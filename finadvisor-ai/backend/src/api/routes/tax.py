from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.auth.dependencies import get_current_user
from src.database.operations import get_tax_records, save_tax_record
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class TaxRecord(BaseModel):
    tax_year: int
    filing_status: Optional[str] = "single"
    annual_income: Optional[float] = 0
    capital_gains_short: Optional[float] = 0
    capital_gains_long: Optional[float] = 0
    notes: Optional[str] = ""


def _estimate_tax(income: float, cg_short: float, cg_long: float, filing: str) -> float:
    """Simple US tax estimate."""
    brackets = {
        "single": [(11600, 0.10), (47150, 0.12), (100525, 0.22), (191950, 0.24), (243725, 0.32), (609350, 0.35), (float('inf'), 0.37)],
        "married_filing_jointly": [(23200, 0.10), (94300, 0.12), (201050, 0.22), (383900, 0.24), (487450, 0.32), (731200, 0.35), (float('inf'), 0.37)],
    }
    bracket = brackets.get(filing, brackets["single"])
    tax = 0
    prev = 0
    for limit, rate in bracket:
        if income <= prev:
            break
        taxable = min(income, limit) - prev
        tax += taxable * rate
        prev = limit

    # Capital gains tax (simplified)
    cg_long_rate = 0.15 if income < 492300 else 0.20
    tax += cg_short * 0.22  # taxed as ordinary income
    tax += cg_long * cg_long_rate

    return round(tax, 2)


@router.get("")
async def get_records(user=Depends(get_current_user)):
    records = get_tax_records(user["user_id"])
    return {"records": records}


@router.post("")
async def upsert_record(body: TaxRecord, user=Depends(get_current_user)):
    estimated = _estimate_tax(
        body.annual_income or 0,
        body.capital_gains_short or 0,
        body.capital_gains_long or 0,
        body.filing_status or "single"
    )
    record = save_tax_record(user["user_id"], body.tax_year, {
        "filing_status": body.filing_status,
        "annual_income": body.annual_income,
        "capital_gains_short": body.capital_gains_short,
        "capital_gains_long": body.capital_gains_long,
        "estimated_tax_owed": estimated,
        "notes": body.notes,
    })
    if not record:
        raise HTTPException(status_code=400, detail="Failed to save tax record")
    return {"success": True, "record": record, "estimated_tax": estimated}


@router.delete("/{record_id}")
async def delete_record(record_id: str, user=Depends(get_current_user)):
    from src.database.operations import _db
    try:
        _db().table("tax_records").delete().eq("id", record_id).eq("user_id", user["user_id"]).execute()
        return {"success": True}
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to delete record")
