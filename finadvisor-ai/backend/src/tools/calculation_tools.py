from langchain_core.tools import tool

@tool
def calculate_roi(buy_price: float, sell_price: float, shares: float = 1) -> str:
    """Calculate return on investment given buy price, sell price, and number of shares."""
    gain = (sell_price - buy_price) * shares
    roi = ((sell_price - buy_price) / buy_price) * 100
    return f"ROI: {roi:.2f}% | Gain/Loss: ${gain:,.2f}"

@tool
def compound_interest(principal: float, annual_rate: float, years: int, compounds_per_year: int = 12) -> str:
    """Calculate compound interest. Rate as decimal (e.g. 0.07 for 7%)."""
    amount = principal * (1 + annual_rate / compounds_per_year) ** (compounds_per_year * years)
    interest = amount - principal
    return f"Final amount: ${amount:,.2f} | Interest earned: ${interest:,.2f} | Total return: {(interest/principal)*100:.1f}%"

@tool
def risk_score(volatility: float, beta: float, concentration: float) -> str:
    """Calculate a portfolio risk score (1-10). Inputs: volatility %, beta, top holding concentration %."""
    score = min(10, (volatility * 0.3 + beta * 2 + concentration * 0.05))
    label = "Low" if score < 3 else "Medium" if score < 6 else "High"
    return f"Risk Score: {score:.1f}/10 ({label} Risk)"

@tool
def dollar_cost_average(monthly_investment: float, annual_return: float, years: int) -> str:
    """Calculate the outcome of a dollar-cost averaging strategy."""
    months = years * 12
    monthly_rate = annual_return / 12
    if monthly_rate == 0:
        total = monthly_investment * months
    else:
        total = monthly_investment * (((1 + monthly_rate) ** months - 1) / monthly_rate)
    invested = monthly_investment * months
    return f"Total invested: ${invested:,.2f} | Portfolio value: ${total:,.2f} | Gain: ${total-invested:,.2f}"