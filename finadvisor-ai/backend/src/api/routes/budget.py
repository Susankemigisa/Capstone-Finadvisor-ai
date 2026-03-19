from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.auth.dependencies import get_current_user
from src.database.operations import get_budget_entries, add_budget_entry
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class BudgetEntry(BaseModel):
    category: str
    amount: float
    entry_type: str  # income | expense
    description: Optional[str] = ""
    entry_date: Optional[str] = None
    subcategory: Optional[str] = None


@router.get("")
async def get_entries(month: Optional[str] = None, user=Depends(get_current_user)):
    entries = get_budget_entries(user["user_id"], month)

    # Calculate summary
    income = sum(e["amount"] for e in entries if e["entry_type"] == "income")
    expenses = sum(e["amount"] for e in entries if e["entry_type"] == "expense")

    return {
        "entries": entries,
        "summary": {
            "income": round(income, 2),
            "expenses": round(expenses, 2),
            "net": round(income - expenses, 2),
        }
    }


@router.post("")
async def create_entry(body: BudgetEntry, user=Depends(get_current_user)):
    entry = add_budget_entry(
        user_id=user["user_id"],
        category=body.category,
        amount=body.amount,
        entry_type=body.entry_type,
        description=body.description or "",
        entry_date=body.entry_date,
        subcategory=body.subcategory,
    )
    if not entry:
        raise HTTPException(status_code=400, detail="Failed to add entry")
    return {"success": True, "entry": entry}


@router.delete("/{entry_id}")
async def delete_entry(entry_id: str, user=Depends(get_current_user)):
    from src.database.operations import _db
    try:
        _db().table("budget_entries").delete().eq("id", entry_id).eq("user_id", user["user_id"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to delete entry")
