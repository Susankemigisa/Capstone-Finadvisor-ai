"""
restate_client.py — Thin wrapper for starting and cancelling Restate workflows.

Routes import this instead of talking to Restate directly, so the rest of the
app doesn't need to know about Restate's HTTP API format.

RESTATE ENDPOINT
----------------
Local dev:  http://localhost:8080
Production: set RESTATE_ENDPOINT in .env (your Restate Cloud ingress URL)
            and RESTATE_AUTH_TOKEN for authentication.

HOW IT WORKS
------------
Restate exposes an HTTP ingress.  To start a workflow you POST to:
  POST {RESTATE_ENDPOINT}/{service}/{workflow_id}/{handler}

The workflow_id is our DB row id — this ensures exactly one workflow per
entity and lets us cancel by id when the user deletes the record.

GRACEFUL DEGRADATION
--------------------
If Restate isn't running (local dev without Docker, or misconfigured env),
all functions log a warning and return without raising.  The app continues
to work — alerts still exist in the DB, they just won't have durable
per-instance monitoring (the global APScheduler poller still runs).
"""

from __future__ import annotations

import os
from src.utils.logger import get_logger

logger = get_logger(__name__)

RESTATE_ENDPOINT   = os.getenv("RESTATE_ENDPOINT",   "http://localhost:8080")
RESTATE_AUTH_TOKEN = os.getenv("RESTATE_AUTH_TOKEN",  "")


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if RESTATE_AUTH_TOKEN:
        h["Authorization"] = f"Bearer {RESTATE_AUTH_TOKEN}"
    return h


async def start_workflow(
    service:     str,
    workflow_id: str,
    handler:     str,
    payload:     dict,
) -> bool:
    """
    Start a durable Restate workflow.

    service     : Restate service name, e.g. "price-alert"
    workflow_id : Unique key for this workflow instance, e.g. the DB row id
    handler     : Handler method name, e.g. "monitor"
    payload     : Dict passed as JSON body to the handler

    Returns True on success, False if Restate is unreachable.
    """
    import httpx, json

    url = f"{RESTATE_ENDPOINT}/{service}/{workflow_id}/{handler}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=_headers())
            if resp.status_code in (200, 201, 202):
                logger.info(
                    "restate_workflow_started",
                    service=service,
                    workflow_id=workflow_id,
                    handler=handler,
                )
                return True
            elif resp.status_code == 409:
                # 409 Conflict = workflow already running with this id (idempotent)
                logger.info(
                    "restate_workflow_already_running",
                    service=service,
                    workflow_id=workflow_id,
                )
                return True
            else:
                logger.warning(
                    "restate_workflow_start_failed",
                    service=service,
                    workflow_id=workflow_id,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
                return False
    except Exception as e:
        logger.warning(
            "restate_unreachable",
            service=service,
            workflow_id=workflow_id,
            error=str(e),
        )
        return False


async def cancel_workflow(service: str, workflow_id: str) -> bool:
    """
    Cancel a running Restate workflow by its id.
    Called when the user deletes an alert, savings rule, or bill.
    """
    import httpx

    url = f"{RESTATE_ENDPOINT}/restate/invocations/{service}-{workflow_id}/cancel"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(url, headers=_headers())
            success = resp.status_code in (200, 202, 404)  # 404 = already done, that's fine
            if success:
                logger.info("restate_workflow_cancelled", service=service, workflow_id=workflow_id)
            return success
    except Exception as e:
        logger.warning(
            "restate_cancel_failed",
            service=service,
            workflow_id=workflow_id,
            error=str(e),
        )
        return False


# ── Convenience functions called from routes ──────────────────────────────────

async def start_price_alert(alert: dict, user: dict) -> bool:
    """Start a price alert workflow. Call after inserting the alert in the DB."""
    return await start_workflow(
        service="price-alert",
        workflow_id=alert["id"],
        handler="monitor",
        payload={
            "alert_id":     alert["id"],
            "ticker":       alert["ticker"],
            "asset_type":   alert.get("asset_type", "stock"),
            "condition":    alert["condition"],
            "target_price": alert["target_price"],
            "user_id":      user["id"],
            "user_email":   user.get("email", ""),
            "user_name":    (user.get("full_name") or "").split()[0] or "there",
        },
    )


async def cancel_price_alert(alert_id: str) -> bool:
    """Cancel a price alert workflow. Call before deleting the alert from the DB."""
    return await cancel_workflow("price-alert", alert_id)


async def start_savings_rule(rule: dict, user: dict) -> bool:
    """Start a savings automation workflow. Call after inserting the rule in the DB."""
    return await start_workflow(
        service="savings-automation",
        workflow_id=rule["id"],
        handler="run_rule",
        payload={
            "rule_id":    rule["id"],
            "user_id":    user["id"],
            "pocket_id":  rule["pocket_id"],
            "amount":     rule["amount"],
            "currency":   rule.get("currency", "UGX"),
            "frequency":  rule.get("frequency", "monthly"),
            "user_email": user.get("email", ""),
            "user_name":  (user.get("full_name") or "").split()[0] or "there",
        },
    )


async def cancel_savings_rule(rule_id: str) -> bool:
    return await cancel_workflow("savings-automation", rule_id)


async def start_monthly_report(user: dict) -> bool:
    """
    Start the monthly report workflow for a user.
    Idempotent — safe to call on every login; Restate returns 409 if already running.
    """
    return await start_workflow(
        service="monthly-report",
        workflow_id=user["id"],
        handler="generate_monthly",
        payload={
            "user_id":    user["id"],
            "user_email": user.get("email", ""),
            "user_name":  (user.get("full_name") or "").split()[0] or "there",
        },
    )


async def start_bill_reminder(bill: dict, user: dict) -> bool:
    """Start a bill reminder workflow. Call after inserting the bill in the DB."""
    return await start_workflow(
        service="bill-reminder",
        workflow_id=bill["id"],
        handler="remind",
        payload={
            "bill_id":    bill["id"],
            "user_id":    user["id"],
            "user_email": user.get("email", ""),
            "user_name":  (user.get("full_name") or "").split()[0] or "there",
            "bill_name":  bill["name"],
            "amount":     bill["amount"],
            "currency":   bill.get("currency", "UGX"),
            "due_date":   bill["due_date"],
            "remind_days": bill.get("remind_days", 3),
        },
    )


async def cancel_bill_reminder(bill_id: str) -> bool:
    return await cancel_workflow("bill-reminder", bill_id)
