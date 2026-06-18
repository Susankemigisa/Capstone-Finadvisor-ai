"""
src/workflows — Durable workflow definitions powered by Restate.

WHY RESTATE INSTEAD OF APSCHEDULER FOR THESE?
----------------------------------------------
APScheduler holds its job schedule in process memory.  When the Render server
restarts (deployments, cold starts, OOM kills) every in-flight job is silently
lost.  For a price alert sleeping between 5-minute checks this means the user
simply never gets notified.  For a savings automation it means money that
should have moved doesn't.

Restate persists workflow state externally (in Restate's own durable log) so a
workflow that is sleeping for 5 minutes or 30 days will resume exactly where it
left off after any restart.

WHAT LIVES HERE vs APSCHEDULER
-------------------------------
APScheduler (src/scheduler.py) is kept for the 5-minute global price-alert
polling loop and the 30-minute watchlist checker — these are stateless fan-outs
that read the whole DB table and don't need per-user durability.

Restate handles the four workflows that are per-user and long-lived:

  price_alert_workflow    — monitors one ticker for one user, sleeps between checks
  savings_workflow        — auto-transfers to a savings pocket on schedule
  monthly_report_workflow — generates + emails a PDF report on the 1st
  bill_reminder_workflow  — reminds user N days before a bill, then marks paid

HOW TO RUN RESTATE LOCALLY
---------------------------
  1. docker run --name restate --rm -p 8080:8080 -p 9070:9070 docker.restate.dev/restatedev/restate:latest
  2. Start the FastAPI server (uvicorn) — it mounts the Restate ASGI handler at /restate
  3. Register services: npx @restatedev/restate deployments register http://localhost:8000/restate

ON RENDER
---------
Add a Restate Cloud account (restate.dev) and set:
  RESTATE_AUTH_TOKEN=<your token>  in the Render environment variables.
The workflows auto-register on startup via restate_client.py.
"""

from src.workflows.price_alert   import price_alert_svc
from src.workflows.savings        import savings_svc
from src.workflows.monthly_report import monthly_report_svc
from src.workflows.bill_reminder  import bill_reminder_svc

__all__ = [
    "price_alert_svc",
    "savings_svc",
    "monthly_report_svc",
    "bill_reminder_svc",
]
