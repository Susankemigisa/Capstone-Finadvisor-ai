"""
rules.py — Auto-Savings Rules CRUD.

Endpoints
---------
GET    /savings/rules                        – list all rules for the user
POST   /savings/rules                        – create a new rule
PATCH  /savings/rules/{rule_id}/toggle       – enable / disable a rule
DELETE /savings/rules/{rule_id}              – permanently delete a rule

The actual rule execution engine lives in webhooks.py (_apply_savings_rules).
This module only manages the rule records — it does not run them.

Rule types
----------
percentage  — save X % of every qualifying incoming transaction
fixed_amount — save a fixed amount from every qualifying transaction

Trigger filtering (all optional — leave blank to match everything)
------------------------------------------------------------------
trigger_keyword    — only fire when transaction description contains this word
trigger_amount_min — only fire when transaction amount >= this value
source_account_id  — only fire for a specific connected account
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

class CreateRuleRequest(BaseModel):
    name: str
    pocket_id: str
    rule_type: str                      # 'percentage' | 'fixed_amount'
    amount_value: float                 # 20.0 = 20 %,  or 200_000 = UGX 200k fixed
    trigger_keyword: str = ""           # empty → match ALL income
    trigger_amount_min: Optional[float] = None
    source_account_id: Optional[str]   = None
    notify_on_trigger: bool            = True


# ── GET /savings/rules ────────────────────────────────────────

@router.get("/rules")
async def get_rules(current_user: dict = Depends(get_current_user)):
    """
    Return all savings rules for the authenticated user.

    Joins savings_pockets and connected_accounts so the frontend
    can display pocket name / icon and account name without extra
    round trips.
    """
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("savings_rules")
            .select(
                "*, "
                "savings_pockets(name, icon, currency), "
                "connected_accounts(account_name, bank_name)"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return {"rules": r.data or []}
    except Exception as e:
        logger.error("get_rules_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch rules")


# ── POST /savings/rules ───────────────────────────────────────

@router.post("/rules")
async def create_rule(
    body: CreateRuleRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Create an auto-savings rule.

    Default behaviour (trigger_keyword empty):
        Save X% or a fixed amount from EVERY incoming credit on any
        linked account.  Reversals, refunds, and tiny credits < UGX 1,000
        are automatically skipped by the webhook engine.

    Restricted (trigger_keyword set):
        Only save when the transaction description contains the keyword.
        Useful for salary-only rules: set keyword to "salary".
    """
    user_id = current_user["user_id"]

    # Validate rule_type
    if body.rule_type not in ("percentage", "fixed_amount"):
        raise HTTPException(
            status_code=400,
            detail="rule_type must be 'percentage' or 'fixed_amount'",
        )

    # Validate pocket belongs to this user
    pocket_check = (
        _db()
        .table("savings_pockets")
        .select("id, name")
        .eq("id", body.pocket_id)
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    if not pocket_check.data:
        raise HTTPException(status_code=404, detail="Pocket not found")

    try:
        r = _db().table("savings_rules").insert({
            "user_id":           user_id,
            "name":              body.name,
            "trigger_type":      "income_received",
            "trigger_keyword":   body.trigger_keyword.lower().strip(),
            "trigger_amount_min": body.trigger_amount_min,
            "source_account_id": body.source_account_id or None,
            "pocket_id":         body.pocket_id,
            "rule_type":         body.rule_type,
            "amount_value":      body.amount_value,
            "notify_on_trigger": body.notify_on_trigger,
        }).execute()

        if not r.data:
            raise HTTPException(status_code=500, detail="Failed to save rule")

        logger.info(
            "rule_created",
            user_id=user_id,
            name=body.name,
            rule_type=body.rule_type,
            amount_value=body.amount_value,
        )
        return {
            "rule":    r.data[0],
            "message": f"Savings rule '{body.name}' created!",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_rule_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create rule")


# ── PATCH /savings/rules/{rule_id}/toggle ─────────────────────

@router.patch("/rules/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Enable or disable a savings rule (flip is_active)."""
    user_id = current_user["user_id"]
    try:
        r = (
            _db()
            .table("savings_rules")
            .select("is_active, name")
            .eq("id", rule_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not r.data:
            raise HTTPException(status_code=404, detail="Rule not found")

        current_state = r.data[0]["is_active"]
        new_state     = not current_state
        rule_name     = r.data[0].get("name", "Rule")

        _db().table("savings_rules").update({
            "is_active":  new_state,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", rule_id).eq("user_id", user_id).execute()

        action = "enabled" if new_state else "paused"
        logger.info("rule_toggled", user_id=user_id, rule_id=rule_id, is_active=new_state)
        return {
            "is_active": new_state,
            "message":   f"'{rule_name}' {action}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("toggle_rule_failed", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to toggle rule")


# ── DELETE /savings/rules/{rule_id} ───────────────────────────

@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete a savings rule."""
    user_id = current_user["user_id"]
    try:
        check = (
            _db()
            .table("savings_rules")
            .select("id, name")
            .eq("id", rule_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not check.data:
            raise HTTPException(status_code=404, detail="Rule not found")

        rule_name = check.data[0].get("name", "Rule")

        _db().table("savings_rules").delete() \
            .eq("id", rule_id).eq("user_id", user_id).execute()

        logger.info("rule_deleted", user_id=user_id, rule_id=rule_id)
        return {"message": f"'{rule_name}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_rule_failed", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete rule")
