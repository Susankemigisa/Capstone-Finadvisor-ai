"""
savings.py — Savings Pockets CRUD.

All routes live under /savings/pockets and delegate to the same
Supabase tables already used by webhooks.py's auto-rule engine.

Endpoints
---------
GET    /savings/pockets                      – list all active pockets
POST   /savings/pockets                      – create a pocket
DELETE /savings/pockets/{pocket_id}          – soft-delete a pocket
POST   /savings/pockets/{pocket_id}/transact – manual deposit / withdrawal
GET    /savings/pockets/{pocket_id}/history  – transaction history
GET    /savings/summary                      – full savings overview

The webhooks.py router keeps its own identical copies of the GET / POST /
transact / history routes for backwards compatibility.  This file adds
the missing DELETE /savings/pockets/{id} endpoint and re-exports every
other savings pocket endpoint so main.py can import a single clean router.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.dependencies import get_current_user
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── DB helper ─────────────────────────────────────────────────

def _db():
    from src.database.client import get_supabase
    return get_supabase()


# ── Pydantic models ───────────────────────────────────────────

class CreatePocketRequest(BaseModel):
    name: str
    description: str = ""
    target_amount: Optional[float] = None
    currency: str = "UGX"
    icon: str = "💰"
    color: str = "#1A56DB"
    target_date: Optional[str] = None


class PocketTransactionRequest(BaseModel):
    amount: float
    transaction_type: str   # 'deposit' | 'withdrawal'
    note: str = ""


# ── GET /savings/pockets ──────────────────────────────────────

@router.get("/pockets")
async def get_pockets(current_user: dict = Depends(get_current_user)):
    """Return all active savings pockets for the authenticated user."""
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("savings_pockets")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at", desc=False)
            .execute()
        )
        pockets = r.data or []
        # Attach progress percentage so the frontend doesn't have to calculate it
        for p in pockets:
            target = p.get("target_amount")
            current = float(p.get("current_amount", 0))
            if target and float(target) > 0:
                p["progress_pct"] = round(current / float(target) * 100, 1)
            else:
                p["progress_pct"] = None
        return {"pockets": pockets}
    except Exception as e:
        logger.error("get_pockets_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch pockets")


# ── POST /savings/pockets ─────────────────────────────────────

@router.post("/pockets")
async def create_pocket(
    body: CreatePocketRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a new savings pocket."""
    user_id = current_user["user_id"]
    try:
        r = _db().table("savings_pockets").insert({
            "user_id":       user_id,
            "name":          body.name,
            "description":   body.description,
            "target_amount": body.target_amount,
            "currency":      body.currency.upper(),
            "icon":          body.icon,
            "color":         body.color,
            "target_date":   body.target_date,
        }).execute()

        if not r.data:
            raise HTTPException(status_code=500, detail="Failed to create pocket")

        logger.info("pocket_created", user_id=user_id, name=body.name)
        return {"pocket": r.data[0], "message": f"'{body.name}' pocket created!"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_pocket_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create pocket")


# ── DELETE /savings/pockets/{pocket_id} ───────────────────────

@router.delete("/pockets/{pocket_id}")
async def delete_pocket(
    pocket_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Soft-delete a savings pocket.

    Sets is_active = False rather than hard-deleting so that historical
    savings_transactions that reference this pocket_id remain intact for
    audit / reporting purposes.
    """
    user_id = current_user["user_id"]
    try:
        # Verify ownership before updating
        check = (
            _db()
            .table("savings_pockets")
            .select("id, name")
            .eq("id", pocket_id)
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Pocket not found")

        _db().table("savings_pockets").update({
            "is_active":  False,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", pocket_id).eq("user_id", user_id).execute()

        # Also deactivate any savings rules that point to this pocket
        # (prevents orphaned rules from triggering on a deleted pocket)
        try:
            _db().table("savings_rules").update({
                "is_active":  False,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("pocket_id", pocket_id).eq("user_id", user_id).execute()
        except Exception:
            pass  # Non-critical — log but don't fail the delete

        pocket_name = check.data[0].get("name", "Pocket")
        logger.info("pocket_deleted", user_id=user_id, pocket_id=pocket_id)
        return {"message": f"'{pocket_name}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_pocket_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete pocket")


# ── POST /savings/pockets/{pocket_id}/transact ────────────────

@router.post("/pockets/{pocket_id}/transact")
async def pocket_transaction(
    pocket_id: str,
    body: PocketTransactionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Manually deposit into or withdraw from a savings pocket."""
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("savings_pockets")
            .select("*")
            .eq("id", pocket_id)
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        if not r.data:
            raise HTTPException(status_code=404, detail="Pocket not found")
        pocket = r.data[0]

        current_bal = float(pocket["current_amount"])
        if body.transaction_type == "deposit":
            new_balance = current_bal + body.amount
        elif body.transaction_type == "withdrawal":
            if body.amount > current_bal:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient balance. Available: {current_bal:,.0f}",
                )
            new_balance = current_bal - body.amount
        else:
            raise HTTPException(
                status_code=400,
                detail="transaction_type must be 'deposit' or 'withdrawal'",
            )

        # Update pocket balance
        _db().table("savings_pockets").update({
            "current_amount": new_balance,
            "updated_at":     datetime.utcnow().isoformat(),
        }).eq("id", pocket_id).execute()

        # Record transaction
        _db().table("savings_transactions").insert({
            "user_id":          user_id,
            "pocket_id":        pocket_id,
            "transaction_type": body.transaction_type,
            "amount":           body.amount,
            "currency":         pocket["currency"],
            "note":             body.note,
            "source":           "manual",
            "balance_after":    new_balance,
        }).execute()

        action = "deposited into" if body.transaction_type == "deposit" else "withdrawn from"
        logger.info(
            "pocket_transaction",
            user_id=user_id,
            pocket_id=pocket_id,
            type=body.transaction_type,
            amount=body.amount,
        )
        return {
            "message":     f"{pocket['currency']} {body.amount:,.0f} {action} '{pocket['name']}'",
            "new_balance": new_balance,
            "pocket_name": pocket["name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("pocket_transaction_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Transaction failed")


# ── GET /savings/pockets/{pocket_id}/history ──────────────────

@router.get("/pockets/{pocket_id}/history")
async def get_pocket_history(
    pocket_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the 50 most recent transactions for a savings pocket."""
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("savings_transactions")
            .select("*")
            .eq("pocket_id", pocket_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"transactions": r.data or []}
    except Exception as e:
        logger.error("get_pocket_history_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch history")


# ── GET /savings/summary ──────────────────────────────────────

@router.get("/summary")
async def savings_summary(current_user: dict = Depends(get_current_user)):
    """
    Full savings overview — totals, pocket list, recent activity,
    active rules, and connected accounts.

    Used by the Insights page to compute net worth and the Savings page
    header stats card.
    """
    user_id = current_user["user_id"]
    try:
        pockets_r = (
            _db()
            .table("savings_pockets")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )
        pockets = pockets_r.data or []

        rules_r = (
            _db()
            .table("savings_rules")
            .select("id,name,is_active,times_triggered,total_saved,currency")
            .eq("user_id", user_id)
            .execute()
        )

        recent_r = (
            _db()
            .table("savings_transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        accounts_r = (
            _db()
            .table("connected_accounts")
            .select("id,account_name,bank_name,provider,is_active")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        )

        total_saved = sum(float(p.get("current_amount", 0)) for p in pockets)
        total_target = sum(float(p["target_amount"]) for p in pockets if p.get("target_amount"))
        goals_reached = sum(
            1 for p in pockets
            if p.get("target_amount")
            and float(p.get("current_amount", 0)) >= float(p["target_amount"])
        )

        return {
            "total_saved":          total_saved,
            "total_target":         total_target,
            "goals_reached":        goals_reached,
            "pocket_count":         len(pockets),
            "pockets":              pockets,
            "rules":                rules_r.data or [],
            "recent_transactions":  recent_r.data or [],
            "connected_accounts":   accounts_r.data or [],
        }
    except Exception as e:
        logger.error("savings_summary_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch summary")
