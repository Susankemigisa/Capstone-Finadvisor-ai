from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.auth.dependencies import get_current_user
from src.database.operations import (
    get_financial_goals, create_financial_goal, update_goal_progress
)
from src.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


class GoalCreate(BaseModel):
    goal_name: str
    goal_type: str
    target_amount: float
    target_date: Optional[str] = None
    notes: Optional[str] = ""


class GoalUpdate(BaseModel):
    current_amount: float


@router.get("")
async def get_goals(user=Depends(get_current_user)):
    goals = get_financial_goals(user["user_id"])
    return {"goals": goals}


@router.post("")
async def create_goal(body: GoalCreate, user=Depends(get_current_user)):
    goal = create_financial_goal(
        user_id=user["user_id"],
        goal_name=body.goal_name,
        goal_type=body.goal_type,
        target_amount=body.target_amount,
        target_date=body.target_date,
        notes=body.notes or "",
    )
    if not goal:
        raise HTTPException(status_code=400, detail="Failed to create goal")
    return {"success": True, "goal": goal}


@router.patch("/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate, user=Depends(get_current_user)):
    updated = update_goal_progress(goal_id, user["user_id"], body.current_amount)
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"success": True, "goal": updated}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user=Depends(get_current_user)):
    from src.database.operations import _db
    try:
        _db().table("financial_goals").delete().eq("id", goal_id).eq("user_id", user["user_id"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to delete goal")
