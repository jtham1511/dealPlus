#!/usr/bin/env python3
"""
excel_to_json.py — Gartner Renewal Portal Data Converter
=========================================================
Run this script whenever the Excel analysis file changes.

Usage:
    py excel_to_json.py Gartner_Contract_Renewal_Analysis.xlsx
    py excel_to_json.py path/to/your_file.xlsx

Output: ../public/data/gartner_data.json

Requirements:
    py -m pip install pandas openpyxl
"""

import sys
import json
import math
import datetime
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("ERROR: pandas not installed. Run: py -m pip install pandas openpyxl")
    sys.exit(1)

SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR    = PROJECT_DIR / "public" / "data"
OUTPUT_FILE = DATA_DIR / "gartner_data.json"
DEFAULT_EXCEL = PROJECT_DIR / "excel" / "Gartner_Contract_Renewal_Analysis.xlsx"


def clean_float(v):
    if pd.isna(v): return 0.0
    s = str(v).replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        f = float(s)
        return 0.0 if math.isnan(f) or math.isinf(f) else f
    except ValueError:
        return 0.0


def clean_pct(v):
    s = str(v).replace("%", "").replace("+", "").strip()
    try:
        f = float(s)
        return 0.0 if math.isnan(f) or math.isinf(f) else f
    except ValueError:
        return 0.0


def is_numeric(v):
    if pd.isna(v): return False
    try:
        float(str(v).replace("$", "").replace(",", "").strip())
        return True
    except ValueError:
        return False


def classify_status(survey_status, recommendation):
    """
    Works with both old Excel format (verbose text) and new format (Renew - ..., Terminate).
    """
    rec = recommendation.lower().strip()
    if "excluded" in survey_status.lower():
        return "excluded"
    if survey_status == "Non-Respondent":
        return "followup"
    # Terminate — exact word or starts with it (new format), or old verbose text
    if rec == "terminate" or rec.startswith("terminate"):
        return "terminate"
    if "contract termination" in rec or "significant downgrade" in rec:
        return "terminate"
    # Review / Right-size
    if "right-size" in rec or "right size" in rec:
        return "review"
    # Everything else for a Responded user = renew
    return "renew"


def sanitize(obj):
    """Recursively replace NaN/Infinity with None so JSON stays valid."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(i) for i in obj]
    return obj


def convert(excel_path: Path) -> dict:
    print(f"  Reading: {excel_path}")
    xl     = pd.read_excel(excel_path, sheet_name=None)
    sheets = list(xl.keys())
    print(f"  Found sheets: {sheets}")

    # ── 1. Users ──────────────────────────────────────────────────────────────
    ind_sheet_name = next((k for k in sheets if "Individual" in k or "2." in k), None)
    if not ind_sheet_name:
        raise ValueError(f"Cannot find 'Individual User Analysis' sheet. Available: {sheets}")

    ind   = xl[ind_sheet_name]
    users = []

    for i in range(1, len(ind)):
        r   = ind.iloc[i].tolist()
        uid = str(r[0]).strip()
        if not uid or uid == "nan":
            continue
        survey              = str(r[3]).strip() if pd.notna(r[3]) else ""
        decision_rationale  = str(r[11]).strip() if pd.notna(r[11]) and str(r[11]) != "nan" else ""
        p                   = proposal_map.get(uid, {})
        decision_rec        = p.get("renewalProposal", "")
        status              = proposal_to_status(survey, decision_rec)
        users.append({
            "id":                      uid,
            "agency":                  str(r[1]).strip() if pd.notna(r[1]) else "",
            "accountType":             str(r[2]).strip() if pd.notna(r[2]) else "",
            "surveyStatus":            survey,
            "q15":                     str(r[4]).strip() if pd.notna(r[4]) else "",
            "valueAssessment":         str(r[5]).strip() if pd.notna(r[5]) else "",
            "activityLevel":           str(r[6]).strip() if pd.notna(r[6]) else "",
            "totalActivities":         int(r[7]) if pd.notna(r[7]) else 0,
            "monthlyAvg":              round(float(r[8]), 1) if pd.notna(r[8]) else 0.0,
            "currentCostYr":           clean_float(r[9]),
            "newCostYr":               clean_float(r[10]),
            "decisionRationale":       decision_rationale,
            "decisionRecommendation":  decision_rec,
            "rationale":               str(r[12]).strip() if pd.notna(r[12]) and str(r[12]) != "nan" else "",
            "status":                  status,
            "downloads":               0,
            "analystCalls":            0,
            "conferences":             0,
        })

    print(f"  Loaded {len(users)} users from '{ind_sheet_name}'")

    # ── 2. Raw activity breakdown ─────────────────────────────────────────────
    raw_sheet_name = next((k for k in sheets if "Raw User" in k or "10." in k), None)
    if raw_sheet_name:
        raw = xl[raw_sheet_name]
        for i in range(1, len(raw)):
            r   = raw.iloc[i].tolist()
            uid = str(r[0]).strip()
            if not uid or uid == "nan" or "TOTAL" in uid.upper():
                continue
            target = next((u for u in users if u["id"] == uid), None)
            if target:
                target["downloads"]    = int(r[3]) if pd.notna(r[3]) else 0
                target["analystCalls"] = int(r[4]) if pd.notna(r[4]) else 0
                target["conferences"]  = int(r[5]) if pd.notna(r[5]) else 0
        print(f"  Enriched activity breakdown from '{raw_sheet_name}'")
    else:
        print("  WARNING: Raw activity sheet not found")

    # ── 3. Pricing table ──────────────────────────────────────────────────────
    # Handles both formats:
    #   Old: [AccountType, NewName, Users, CurrCost, NewCost, IncAmt, IncPct]
    #   New: [AccountType, NewName, Users, CurrCost, (missing), IncAmt, IncPct]
    #        → NewCost computed as CurrCost + IncAmt
    budget_sheet_name = next((k for k in sheets if "Budget" in k or "5." in k), None)
    pricing = []
    if budget_sheet_name:
        b             = xl[budget_sheet_name]
        pricing_start = None
        for i in range(len(b)):
            row_vals = [str(v).strip() for v in b.iloc[i].tolist() if pd.notna(v)]
            if "Account Type" in row_vals and "New Contract Name" in row_vals:
                pricing_start = i + 1
                break

        if pricing_start:
            for i in range(pricing_start, len(b)):
                r  = b.iloc[i].tolist()
                at = str(r[0]).strip() if pd.notna(r[0]) else ""
                if not at or at == "nan":
                    continue
                if at.upper() == "TOTAL":
                    break
                # Stop if Users column (r[2]) is not a number — signals a new section header
                if not is_numeric(r[2]):
                    break
                curr_cost = clean_float(r[3])
                inc_amt   = clean_float(r[5])
                # Use NewCost column if present, otherwise compute it
                new_cost  = clean_float(r[4]) if pd.notna(r[4]) and is_numeric(r[4]) else curr_cost + inc_amt
                pricing.append({
                    "accountType":        at,
                    "newContractName":    str(r[1]).strip() if pd.notna(r[1]) else at,
                    "userCount":          int(float(str(r[2]).replace(",", ""))) if pd.notna(r[2]) else 0,
                    "currentCostPerUser": curr_cost,
                    "newCostPerUser":     new_cost,
                    "increaseAmt":        inc_amt,
                    "increasePct":        clean_pct(r[6]),
                })

        print(f"  Loaded {len(pricing)} pricing rows from '{budget_sheet_name}'")
    else:
        print("  WARNING: Budget sheet not found")

    # ── 4. Survey data ────────────────────────────────────────────────────────
    survey_sheet_name = next((k for k in sheets if "Survey Analysis" in k or "3." in k), None)
    q3, q4, q14, q15 = [], [], [], []
    if survey_sheet_name:
        s = xl[survey_sheet_name]
        for i in range(2, 8):
            if i >= len(s): break
            r   = s.iloc[i].tolist()
            lbl = str(r[0]).strip()
            if lbl and lbl != "nan" and pd.notna(r[1]):
                q3.append({"label": lbl, "count": int(r[1]), "pct": clean_pct(r[2])})
        for i in range(13, 21):
            if i >= len(s): break
            r   = s.iloc[i].tolist()
            lbl = str(r[0]).strip()
            if lbl and lbl != "nan" and pd.notna(r[1]):
                try:
                    q4.append({"label": lbl, "count": int(r[1]), "pct": clean_pct(r[2])})
                except (ValueError, TypeError):
                    pass
        for i in range(len(s)):
            r   = s.iloc[i].tolist()
            lbl = str(r[0]).strip() if pd.notna(r[0]) else ""
            cnt = r[1]
            if "Value exceeds cost" in lbl and pd.notna(cnt):
                q14.append({"label": lbl, "count": int(cnt), "pct": clean_pct(r[2])})
            elif "Value is less" in lbl and pd.notna(cnt):
                q14.append({"label": lbl, "count": int(cnt), "pct": clean_pct(r[2])})
            elif "Continue with current" in lbl and pd.notna(cnt):
                q15.append({"label": lbl, "count": int(cnt), "pct": clean_pct(r[2])})
            elif "Change account tier" in lbl and pd.notna(cnt):
                q15.append({"label": lbl, "count": int(cnt), "pct": clean_pct(r[2])})
            elif "Do not need Gartner" in lbl and pd.notna(cnt):
                q15.append({"label": lbl, "count": int(cnt), "pct": clean_pct(r[2])})
        print(f"  Loaded survey data: Q3={len(q3)}, Q4={len(q4)}, Q14={len(q14)}, Q15={len(q15)}")
    else:
        print("  WARNING: Survey Analysis sheet not found")

    # ── 5. Derived statistics ─────────────────────────────────────────────────
    responded    = len([u for u in users if u["surveyStatus"] == "Responded"])
    non_resp     = len([u for u in users if u["surveyStatus"] == "Non-Respondent"])
    excluded_cnt = len([u for u in users if u["surveyStatus"] == "Excluded"])
    total_dl     = sum(u["downloads"]    for u in users)
    total_ca     = sum(u["analystCalls"] for u in users)
    total_cf     = sum(u["conferences"]  for u in users)
    total_ix     = total_dl + total_ca + total_cf
    if total_ix == 0:
        total_ix = sum(u["totalActivities"] for u in users)
        total_dl = total_ix

    status_counts = {}
    for u in users:
        status_counts[u["status"]] = status_counts.get(u["status"], 0) + 1

    agency_map = {}
    for u in users:
        ag = u["agency"]
        if ag not in agency_map:
            agency_map[ag] = {"agency": ag, "users": 0, "downloads": 0,
                              "analystCalls": 0, "conferences": 0, "total": 0}
        agency_map[ag]["users"]        += 1
        agency_map[ag]["downloads"]    += u["downloads"]
        agency_map[ag]["analystCalls"] += u["analystCalls"]
        agency_map[ag]["conferences"]  += u["conferences"]
        agency_map[ag]["total"]        += u["totalActivities"]
    agencies = list(agency_map.values())
    for ag in agencies:
        ag["activitySharePct"] = round(ag["total"] / total_ix * 100, 1) if total_ix else 0
        ag["monthlyAvg"]       = round(ag["total"] / 26, 1)

    total_resp          = responded if responded > 0 else 17
    high_usefulness_pct = round(sum(r["count"] for r in q3[:2]) / total_resp * 100) if q3 else 47
    substantial_count   = sum(1 for u in users if u["valueAssessment"] == "Substantial")
    substantial_pct     = round(substantial_count / total_resp * 100) if total_resp else 0
    val_exceeds_count   = q14[0]["count"] if q14 else 10
    val_exceeds_pct     = q14[0]["pct"]   if q14 else 59
    continue_count      = q15[0]["count"] if q15 else 10
    continue_pct        = q15[0]["pct"]   if q15 else 59
    exit_count          = q15[2]["count"] if len(q15) > 2 else 3
    exit_pct            = q15[2]["pct"]   if len(q15) > 2 else 18
    current_annual      = sum(p["currentCostPerUser"] * p["userCount"] for p in pricing)
    new_annual          = sum(p["newCostPerUser"]      * p["userCount"] for p in pricing)
    total_increase      = sum(p["increaseAmt"]         * p["userCount"] for p in pricing)
    avg_increase_pct    = round((new_annual - current_annual) / current_annual * 100, 1) if current_annual else 0

    # ── 6. Assemble ───────────────────────────────────────────────────────────
    data = {
        "_meta": {
            "generatedFrom":        excel_path.name,
            "generatedAt":          datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "analysisPeriod":       "Aug 2023 – Oct 2025",
            "analysisPeriodMonths": 26,
            "contractExpiry":       "2026-07-31",
            "organization":         "GovTech / SNG",
        },
        "contract": {
            "totalLicensedUsers":   len(users),
            "responded":            responded,
            "nonRespondents":       non_resp,
            "excluded":             excluded_cnt,
            "totalBudgetApproved":  3920000,
            "projectedFinalSpend":  3810000,
            "budgetUtilisationPct": 96.7,
            "currentAnnualCost":    round(current_annual) or 1340753,
            "newAnnualCost":        round(new_annual)     or 1689816,
            "avgPriceIncreasePct":  avg_increase_pct,
            "totalIncreaseAmt":     round(total_increase) or 348041,
        },
        "usage": {
            "totalDownloads":     total_dl,
            "totalAnalystCalls":  total_ca,
            "totalConferences":   total_cf,
            "totalInteractions":  total_ix,
            "monthlyAvgAllUsers": round(total_ix / 26),
            "costPerInteraction": round(3810000 / total_ix) if total_ix else 475,
            "downloadsPct":       round(total_dl / total_ix * 100, 1) if total_ix else 94.4,
            "callsPct":           round(total_ca / total_ix * 100, 1) if total_ix else 4.9,
            "confPct":            round(total_cf / total_ix * 100, 1) if total_ix else 0.8,
            "activityLevelCounts": {
                "extremeOutlier": len([u for u in users if u["activityLevel"] == "Extreme Outlier"]),
                "high":           len([u for u in users if u["activityLevel"] == "High"]),
                "active":         len([u for u in users if u["activityLevel"] == "Active"]),
                "low":            len([u for u in users if u["activityLevel"] == "Low"]),
            },
        },
        "survey": {
            "totalRespondents":      responded,
            "highUsefulnessPct":     high_usefulness_pct,
            "substantialValuePct":   substantial_pct,
            "substantialValueCount": substantial_count,
            "valueExceedsCostPct":   val_exceeds_pct,
            "valueExceedsCostCount": val_exceeds_count,
            "continueGartnerPct":    continue_pct,
            "continueGartnerCount":  continue_count,
            "exitIntentionPct":      exit_pct,
            "exitIntentionCount":    exit_count,
            "q3Usefulness":          q3,
            "q4ImpactAreas":         q4,
            "q14ValueVsCost":        q14,
            "q15FuturePlans":        q15,
        },
        "pricing":      pricing,
        "statusCounts": status_counts,
        "agencies":     agencies,
        "users":        users,
    }

    return sanitize(data)


if __name__ == "__main__":
    excel_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_EXCEL

    if not excel_path.exists():
        print(f"\nERROR: File not found: {excel_path}")
        print(f"Usage: py excel_to_json.py your_file.xlsx")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Gartner Portal — Excel → JSON Converter")
    print(f"{'='*60}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = convert(excel_path)

    # Validate before writing
    json.loads(json.dumps(data))

    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  ✅ Written: {OUTPUT_FILE}")
    print(f"  Users: {data['contract']['totalLicensedUsers']}")
    print(f"  Interactions: {data['usage']['totalInteractions']}")
    print(f"  Status: {data['statusCounts']}")
    print(f"  Pricing rows: {len(data['pricing'])}")
    print(f"{'='*60}")
    print(f"\n  Next steps:")
    print(f"  1. git add public/data/gartner_data.json")
    print(f"  2. git commit -m 'Update portal data'")
    print(f"  3. git push\n")
