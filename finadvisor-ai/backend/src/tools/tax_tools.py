from langchain_core.tools import tool

@tool
def estimate_capital_gains(buy_price: float, sell_price: float, shares: float, held_days: int) -> str:
    """Estimate capital gains tax. Held > 365 days = long-term rate."""
    gain = (sell_price - buy_price) * shares
    is_long_term = held_days >= 365
    rate = 0.15 if is_long_term else 0.22
    tax = max(0, gain * rate)
    term = "Long-term" if is_long_term else "Short-term"
    return f"Gain: ${gain:,.2f} | {term} rate: {rate*100:.0f}% | Estimated tax: ${tax:,.2f}"

@tool
def tax_bracket_lookup(annual_income: float, filing_status: str = "single") -> str:
    """Look up the marginal federal tax bracket for a given income and filing status."""
    brackets = [(11600, 10), (47150, 12), (100525, 22), (191950, 24), (243725, 32), (609350, 35)]
    for limit, rate in brackets:
        if annual_income <= limit:
            return f"Marginal bracket: {rate}% | Income: ${annual_income:,.0f} | Status: {filing_status}"
    return f"Marginal bracket: 37% | Income: ${annual_income:,.0f} | Status: {filing_status}"