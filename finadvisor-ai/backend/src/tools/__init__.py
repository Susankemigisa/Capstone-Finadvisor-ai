from typing import Any


# Tool metadata for the plugin system UI
TOOL_REGISTRY = [
    # Market
    {"id": "get_stock_price",      "name": "Stock Prices",         "category": "Market",     "desc": "Real-time stock prices", "default": True},
    {"id": "get_stock_history",    "name": "Stock History",        "category": "Market",     "desc": "Historical price data", "default": True},
    {"id": "search_ticker",        "name": "Ticker Search",        "category": "Market",     "desc": "Find stocks by company name", "default": True},
    {"id": "get_market_overview",  "name": "Market Overview",      "category": "Market",     "desc": "S&P 500, Nasdaq, Dow Jones", "default": True},
    # Crypto
    {"id": "get_crypto_price",     "name": "Crypto Prices",        "category": "Crypto",     "desc": "Live crypto prices via CoinGecko", "default": True},
    {"id": "get_crypto_history",   "name": "Crypto History",       "category": "Crypto",     "desc": "Historical crypto data", "default": True},
    # Portfolio
    {"id": "add_position",         "name": "Add Position",         "category": "Portfolio",  "desc": "Add stocks to portfolio", "default": True},
    {"id": "remove_position",      "name": "Remove Position",      "category": "Portfolio",  "desc": "Remove from portfolio", "default": True},
    {"id": "get_portfolio",        "name": "View Portfolio",       "category": "Portfolio",  "desc": "Portfolio with P&L", "default": True},
    {"id": "calculate_allocation", "name": "Allocation Calculator","category": "Portfolio",  "desc": "Portfolio allocation %", "default": True},
    {"id": "diversification_score",  "name": "Diversification Score","category": "Portfolio", "desc": "Score how diversified your portfolio is", "default": True},
    {"id": "rebalancing_suggestions","name": "Rebalancing Advisor", "category": "Portfolio",  "desc": "Suggest trades to hit target allocation", "default": True},
    # Calculations
    {"id": "calculate_roi",        "name": "ROI Calculator",       "category": "Calculator", "desc": "Return on investment", "default": True},
    {"id": "compound_interest",    "name": "Compound Interest",    "category": "Calculator", "desc": "Compound interest calculator", "default": True},
    {"id": "portfolio_risk_score", "name": "Portfolio Risk Score", "category": "Portfolio",  "desc": "Auto-calculates risk score from your actual portfolio", "default": True},
    {"id": "top_performer",        "name": "Top Performer",        "category": "Portfolio",  "desc": "Rank holdings by return % and find best/worst performers", "default": True},
    {"id": "dollar_cost_average",  "name": "DCA Calculator",       "category": "Calculator", "desc": "Dollar cost averaging", "default": True},
    # Budget
    {"id": "add_expense",          "name": "Track Expense",        "category": "Budget",     "desc": "Log expenses", "default": True},
    {"id": "add_income",           "name": "Track Income",         "category": "Budget",     "desc": "Log income", "default": True},
    {"id": "get_budget_summary",   "name": "Budget Summary",       "category": "Budget",     "desc": "Monthly budget overview", "default": True},
    # Tax & Planning
    {"id": "estimate_capital_gains","name": "Capital Gains Tax",   "category": "Tax",        "desc": "Estimate tax on gains", "default": True},
    {"id": "tax_bracket_lookup",   "name": "Tax Bracket",          "category": "Tax",        "desc": "Tax bracket lookup", "default": True},
    {"id": "retirement_calculator","name": "Retirement Planner",   "category": "Planning",   "desc": "Retirement savings projection", "default": True},
    {"id": "emergency_fund_calculator","name": "Emergency Fund",   "category": "Planning",   "desc": "Emergency fund target", "default": True},
    {"id": "debt_payoff_calculator","name": "Debt Payoff",         "category": "Planning",   "desc": "Debt repayment strategies", "default": True},
    # News & Media
    {"id": "get_financial_news",   "name": "Financial News",       "category": "News",       "desc": "Latest market news", "default": True},
    {"id": "get_stock_news",       "name": "Stock News",           "category": "News",       "desc": "News per stock", "default": True},
    # Documents & Images
    {"id": "search_documents",     "name": "Document Search",      "category": "Documents",  "desc": "Search uploaded documents", "default": True},
    {"id": "generate_chart_image", "name": "Chart Generator",      "category": "Images",     "desc": "Generate financial charts", "default": True},
    {"id": "generate_financial_infographic","name": "Infographics","category": "Images",     "desc": "Generate infographics", "default": True},
]


def get_all_tools(enabled_tool_ids: list[str] = None) -> list[Any]:
    """
    Returns tools for the agent, optionally filtered by enabled_tool_ids.
    If enabled_tool_ids is None, returns all default tools.
    """
    from src.tools.market_tools import get_stock_price, get_stock_history, search_ticker, get_market_overview
    from src.tools.crypto_tools import get_crypto_price, get_crypto_history
    from src.tools.portfolio_tools import add_position, remove_position, get_portfolio, calculate_allocation, diversification_score, rebalancing_suggestions, portfolio_risk_score, top_performer
    from src.tools.calculation_tools import calculate_roi, compound_interest, dollar_cost_average
    from src.tools.budget_tools import add_expense, add_income, get_budget_summary
    from src.tools.tax_tools import estimate_capital_gains, tax_bracket_lookup
    from src.tools.planning_tools import retirement_calculator, emergency_fund_calculator, debt_payoff_calculator
    from src.tools.news_tools import get_financial_news, get_stock_news
    from src.tools.rag_tools import search_documents
    from src.tools.image_tools import generate_chart_image, generate_financial_infographic

    all_tools = {
        "get_stock_price": get_stock_price,
        "get_stock_history": get_stock_history,
        "search_ticker": search_ticker,
        "get_market_overview": get_market_overview,
        "get_crypto_price": get_crypto_price,
        "get_crypto_history": get_crypto_history,
        "add_position": add_position,
        "remove_position": remove_position,
        "get_portfolio": get_portfolio,
        "calculate_allocation": calculate_allocation,
        "diversification_score": diversification_score,
        "rebalancing_suggestions": rebalancing_suggestions,
        "portfolio_risk_score": portfolio_risk_score,
        "top_performer": top_performer,
        "calculate_roi": calculate_roi,
        "compound_interest": compound_interest,
        "dollar_cost_average": dollar_cost_average,
        "add_expense": add_expense,
        "add_income": add_income,
        "get_budget_summary": get_budget_summary,
        "estimate_capital_gains": estimate_capital_gains,
        "tax_bracket_lookup": tax_bracket_lookup,
        "retirement_calculator": retirement_calculator,
        "emergency_fund_calculator": emergency_fund_calculator,
        "debt_payoff_calculator": debt_payoff_calculator,
        "get_financial_news": get_financial_news,
        "get_stock_news": get_stock_news,
        "search_documents": search_documents,
        "generate_chart_image": generate_chart_image,
        "generate_financial_infographic": generate_financial_infographic,
    }

    if enabled_tool_ids is None:
        # Return all default tools
        default_ids = {t["id"] for t in TOOL_REGISTRY if t["default"]}
        return [v for k, v in all_tools.items() if k in default_ids]

    return [v for k, v in all_tools.items() if k in enabled_tool_ids]