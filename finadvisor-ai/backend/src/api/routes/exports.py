import csv
import json
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from src.auth.dependencies import get_current_user
from src.database.operations import (
    get_portfolio, get_budget_entries, get_financial_goals,
    get_tax_records, get_watchlist, get_user_sessions
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


def _csv_response(rows: list, headers: list, filename: str):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _json_response(data: dict, filename: str):
    content = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/portfolio")
async def export_portfolio(fmt: str = "csv", user=Depends(get_current_user)):
    positions = get_portfolio(user["user_id"])
    ts = datetime.now().strftime("%Y%m%d")
    if fmt == "json":
        return _json_response({"portfolio": positions, "exported_at": datetime.now().isoformat()}, f"portfolio_{ts}.json")
    headers = ["ticker", "asset_type", "shares", "avg_buy_price", "currency", "notes", "created_at"]
    return _csv_response(positions, headers, f"portfolio_{ts}.csv")


@router.get("/budget")
async def export_budget(fmt: str = "csv", month: str = None, user=Depends(get_current_user)):
    entries = get_budget_entries(user["user_id"], month)
    ts = datetime.now().strftime("%Y%m%d")
    if fmt == "json":
        return _json_response({"budget_entries": entries, "exported_at": datetime.now().isoformat()}, f"budget_{ts}.json")
    headers = ["entry_date", "entry_type", "category", "subcategory", "amount", "description"]
    return _csv_response(entries, headers, f"budget_{ts}.csv")


@router.get("/goals")
async def export_goals(fmt: str = "csv", user=Depends(get_current_user)):
    goals = get_financial_goals(user["user_id"])
    ts = datetime.now().strftime("%Y%m%d")
    if fmt == "json":
        return _json_response({"goals": goals, "exported_at": datetime.now().isoformat()}, f"goals_{ts}.json")
    headers = ["goal_name", "goal_type", "target_amount", "current_amount", "target_date", "is_completed", "notes"]
    return _csv_response(goals, headers, f"goals_{ts}.csv")


@router.get("/tax")
async def export_tax(fmt: str = "csv", user=Depends(get_current_user)):
    records = get_tax_records(user["user_id"])
    ts = datetime.now().strftime("%Y%m%d")
    if fmt == "json":
        return _json_response({"tax_records": records, "exported_at": datetime.now().isoformat()}, f"tax_{ts}.json")
    headers = ["tax_year", "filing_status", "annual_income", "capital_gains_short", "capital_gains_long", "estimated_tax_owed", "notes"]
    return _csv_response(records, headers, f"tax_{ts}.csv")


@router.get("/watchlist")
async def export_watchlist(fmt: str = "csv", user=Depends(get_current_user)):
    items = get_watchlist(user["user_id"])
    ts = datetime.now().strftime("%Y%m%d")
    if fmt == "json":
        return _json_response({"watchlist": items, "exported_at": datetime.now().isoformat()}, f"watchlist_{ts}.json")
    headers = ["ticker", "asset_type", "notes", "created_at"]
    return _csv_response(items, headers, f"watchlist_{ts}.csv")


@router.get("/all")
async def export_all(user=Depends(get_current_user)):
    """Full data export as JSON."""
    ts = datetime.now().strftime("%Y%m%d")
    data = {
        "user_id": user["user_id"],
        "exported_at": datetime.now().isoformat(),
        "portfolio": get_portfolio(user["user_id"]),
        "budget_entries": get_budget_entries(user["user_id"]),
        "financial_goals": get_financial_goals(user["user_id"]),
        "tax_records": get_tax_records(user["user_id"]),
        "watchlist": get_watchlist(user["user_id"]),
    }
    return _json_response(data, f"finadvisor_export_{ts}.json")
