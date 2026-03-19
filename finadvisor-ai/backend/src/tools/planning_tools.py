from langchain_core.tools import tool

@tool
def retirement_calculator(current_age: int, retirement_age: int, current_savings: float, monthly_contribution: float, annual_return: float = 0.07) -> str:
    """Project retirement savings. Annual return as decimal (e.g. 0.07 for 7%)."""
    years = retirement_age - current_age
    months = years * 12
    monthly_rate = annual_return / 12
    future_savings = current_savings * (1 + annual_return) ** years
    future_contributions = monthly_contribution * (((1 + monthly_rate) ** months - 1) / monthly_rate)
    total = future_savings + future_contributions
    return f"Projected at retirement: ${total:,.0f} | Years to retirement: {years} | Monthly income (~4% rule): ${total*0.04/12:,.0f}"

@tool
def emergency_fund_calculator(monthly_expenses: float, months_coverage: int = 6) -> str:
    """Calculate how much you need in an emergency fund."""
    target = monthly_expenses * months_coverage
    return f"Emergency fund target ({months_coverage} months): ${target:,.2f}"

@tool
def debt_payoff_calculator(balance: float, interest_rate: float, monthly_payment: float) -> str:
    """Calculate how long to pay off debt and total interest paid. Rate as decimal (e.g. 0.20 for 20%)."""
    monthly_rate = interest_rate / 12
    if monthly_payment <= balance * monthly_rate:
        return "Monthly payment is too low — it doesn't cover the interest. Increase your payment."
    months = -( (1 / monthly_rate) * ( (monthly_payment - balance * monthly_rate) / monthly_payment).__class__(0) )
    import math
    months = math.ceil(math.log(monthly_payment / (monthly_payment - balance * monthly_rate)) / math.log(1 + monthly_rate))
    total_paid = months * monthly_payment
    total_interest = total_paid - balance
    return f"Payoff time: {months} months ({months//12}y {months%12}m) | Total interest: ${total_interest:,.2f} | Total paid: ${total_paid:,.2f}"