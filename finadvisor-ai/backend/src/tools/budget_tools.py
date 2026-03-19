from langchain_core.tools import tool
from src.utils.logger import get_logger
from datetime import date

logger = get_logger(__name__)

_current_user_id: str = ""

def set_user_context(user_id: str):
    global _current_user_id
    _current_user_id = user_id

def _get_user_id() -> str:
    if not _current_user_id:
        raise ValueError("No user context set.")
    return _current_user_id


@tool
def add_expense(category: str, amount: float, description: str = "", entry_date: str = "") -> str:
    """
    Log an expense to the budget tracker.
    category: housing, food, transport, entertainment, healthcare, utilities, shopping, education, other
    amount: Amount in USD
    description: Optional description
    entry_date: Optional date in YYYY-MM-DD format (defaults to today)
    """
    try:
        from src.database.operations import add_budget_entry
        user_id = _get_user_id()
        result = add_budget_entry(
            user_id=user_id,
            category=category.lower(),
            amount=amount,
            entry_type="expense",
            description=description,
            entry_date=entry_date or str(date.today()),
        )
        if result:
            return f"✅ Logged expense: {category.title()} — ${amount:,.2f}" + (f" ({description})" if description else "")
        return "Failed to log expense."
    except Exception as e:
        logger.error("add_expense_failed", error=str(e))
        return f"Failed to log expense: {str(e)}"


@tool
def add_income(source: str, amount: float, description: str = "", entry_date: str = "") -> str:
    """
    Log an income entry to the budget tracker.
    source: salary, freelance, investment, rental, bonus, other
    amount: Amount in USD
    description: Optional description
    entry_date: Optional date in YYYY-MM-DD format (defaults to today)
    """
    try:
        from src.database.operations import add_budget_entry
        user_id = _get_user_id()
        result = add_budget_entry(
            user_id=user_id,
            category=source.lower(),
            amount=amount,
            entry_type="income",
            description=description,
            entry_date=entry_date or str(date.today()),
        )
        if result:
            return f"✅ Logged income: {source.title()} — ${amount:,.2f}" + (f" ({description})" if description else "")
        return "Failed to log income."
    except Exception as e:
        logger.error("add_income_failed", error=str(e))
        return f"Failed to log income: {str(e)}"


@tool
def get_budget_summary(month: str = "") -> str:
    """
    Get a monthly budget summary with income, expenses, and savings rate.
    month: YYYY-MM format e.g. '2026-02'. Defaults to current month.
    """
    try:
        from src.database.operations import get_budget_entries
        user_id = _get_user_id()

        if not month:
            today = date.today()
            month = f"{today.year}-{today.month:02d}"

        entries = get_budget_entries(user_id, month)
        if not entries:
            return f"No budget entries found for {month}."

        income = [e for e in entries if e["entry_type"] == "income"]
        expenses = [e for e in entries if e["entry_type"] == "expense"]

        total_income = sum(float(e["amount"]) for e in income)
        total_expenses = sum(float(e["amount"]) for e in expenses)
        net = total_income - total_expenses
        savings_rate = (net / total_income * 100) if total_income > 0 else 0

        # Group expenses by category
        expense_by_cat = {}
        for e in expenses:
            cat = e.get("category", "other")
            expense_by_cat[cat] = expense_by_cat.get(cat, 0) + float(e["amount"])

        lines = [f"**Budget Summary — {month}**\n"]
        lines.append(f"💰 Total Income:   ${total_income:>10,.2f}")
        lines.append(f"💸 Total Expenses: ${total_expenses:>10,.2f}")
        lines.append(f"📊 Net Savings:    ${net:>10,.2f}")
        lines.append(f"💹 Savings Rate:   {savings_rate:.1f}%\n")

        if expense_by_cat:
            lines.append("**Expenses by Category:**")
            for cat, amt in sorted(expense_by_cat.items(), key=lambda x: x[1], reverse=True):
                pct = (amt / total_expenses * 100) if total_expenses > 0 else 0
                lines.append(f"  {cat.title():15} ${amt:>8,.2f}  ({pct:.0f}%)")

        if net < 0:
            lines.append(f"\n⚠️ You're spending ${abs(net):,.2f} more than you earn this month.")
        elif savings_rate < 20:
            lines.append(f"\n💡 Tip: Aim for a 20%+ savings rate. You're at {savings_rate:.1f}%.")
        else:
            lines.append(f"\n✅ Great job! You're saving {savings_rate:.1f}% of your income.")

        logger.info("budget_summary_fetched", user_id=user_id, month=month)
        return "\n".join(lines)

    except Exception as e:
        logger.error("get_budget_summary_failed", error=str(e))
        return f"Failed to get budget summary: {str(e)}"