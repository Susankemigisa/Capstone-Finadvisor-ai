"""
MCP Tools Registry — maps every FinAdvisor tool to its MCP schema.

The Model Context Protocol (MCP) requires each tool to be described
with a JSON Schema so external MCP clients (Claude Desktop, VS Code
Copilot, custom agents) can discover and call them without knowing
the Python implementation.

This registry is the single source of truth for:
    - Tool names and descriptions (shown to external clients)
    - Input schemas (validated before forwarding to the tool)
    - Category grouping (for tool discovery / filtering)

The MCP server (mcp/server.py) reads this registry at startup and
registers each tool as an MCP-compliant handler.

External clients connect via:
    stdio  — Claude Desktop, local dev
    SSE    — web-based MCP clients (future)
"""

from __future__ import annotations

from typing import Any

# ── Tool schema type ──────────────────────────────────────────

def _tool(
    name:        str,
    description: str,
    category:    str,
    properties:  dict[str, dict],
    required:    list[str] = None,
) -> dict:
    """Build a standard MCP tool definition dict."""
    return {
        "name":        name,
        "description": description,
        "category":    category,
        "inputSchema": {
            "type":       "object",
            "properties": properties,
            "required":   required or [],
        },
    }


def _str(desc: str, example: str = "") -> dict:
    schema = {"type": "string", "description": desc}
    if example:
        schema["example"] = example
    return schema


def _float(desc: str, default: float = None) -> dict:
    schema: dict = {"type": "number", "description": desc}
    if default is not None:
        schema["default"] = default
    return schema


def _int(desc: str, default: int = None) -> dict:
    schema: dict = {"type": "integer", "description": desc}
    if default is not None:
        schema["default"] = default
    return schema


# ── Registry ──────────────────────────────────────────────────

MCP_TOOLS: list[dict] = [

    # ── Market ────────────────────────────────────────────────
    _tool(
        name="get_stock_price",
        description="Get the current price and key statistics for a stock ticker.",
        category="Market",
        properties={"ticker": _str("Stock ticker symbol", "AAPL")},
        required=["ticker"],
    ),
    _tool(
        name="get_stock_history",
        description="Get historical OHLCV price data for a stock over a given period.",
        category="Market",
        properties={
            "ticker": _str("Stock ticker symbol", "TSLA"),
            "period": _str("Time period: 1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max", "1mo"),
        },
        required=["ticker"],
    ),
    _tool(
        name="search_ticker",
        description="Find a stock ticker symbol by company name.",
        category="Market",
        properties={"query": _str("Company name or partial name", "Apple")},
        required=["query"],
    ),
    _tool(
        name="get_market_overview",
        description="Get a snapshot of major market indices: S&P 500, Nasdaq, Dow Jones, VIX.",
        category="Market",
        properties={},
    ),

    # ── Crypto ────────────────────────────────────────────────
    _tool(
        name="get_crypto_price",
        description="Get the current price and 24h stats for a cryptocurrency via CoinGecko.",
        category="Crypto",
        properties={"coin_id": _str("CoinGecko coin ID", "bitcoin")},
        required=["coin_id"],
    ),
    _tool(
        name="get_crypto_history",
        description="Get historical price data for a cryptocurrency.",
        category="Crypto",
        properties={
            "coin_id": _str("CoinGecko coin ID", "ethereum"),
            "days":    _int("Number of days of history", 30),
        },
        required=["coin_id"],
    ),

    # ── Portfolio ─────────────────────────────────────────────
    _tool(
        name="add_position",
        description="Add a stock, crypto, or ETF position to the user's portfolio.",
        category="Portfolio",
        properties={
            "ticker":        _str("Ticker symbol", "AAPL"),
            "shares":        _float("Number of shares or units"),
            "avg_buy_price": _float("Average purchase price per share"),
            "asset_type":    _str("Asset type: stock crypto etf bond other", "stock"),
            "currency":      _str("Currency code", "USD"),
            "notes":         _str("Optional notes about this position"),
        },
        required=["ticker", "shares", "avg_buy_price"],
    ),
    _tool(
        name="remove_position",
        description="Remove a position from the user's portfolio by ticker symbol.",
        category="Portfolio",
        properties={"ticker": _str("Ticker symbol to remove", "AAPL")},
        required=["ticker"],
    ),
    _tool(
        name="get_portfolio",
        description="Retrieve the user's full portfolio with live prices and P&L.",
        category="Portfolio",
        properties={},
    ),
    _tool(
        name="calculate_allocation",
        description="Calculate the percentage allocation of each holding in the portfolio.",
        category="Portfolio",
        properties={},
    ),
    _tool(
        name="diversification_score",
        description="Score how diversified the user's portfolio is across sectors and asset types (0–100).",
        category="Portfolio",
        properties={},
    ),
    _tool(
        name="rebalancing_suggestions",
        description="Suggest trades to bring the portfolio closer to a target allocation.",
        category="Portfolio",
        properties={
            "target_allocation": _str(
                "JSON string of target allocation, e.g. {\"stocks\": 60, \"bonds\": 30, \"cash\": 10}"
            ),
        },
        required=["target_allocation"],
    ),
    _tool(
        name="portfolio_risk_score",
        description="Calculate a risk score (1–10) for the user's current portfolio.",
        category="Portfolio",
        properties={},
    ),
    _tool(
        name="top_performer",
        description="Rank the user's holdings by return percentage and identify the best and worst performers.",
        category="Portfolio",
        properties={},
    ),

    # ── Calculators ───────────────────────────────────────────
    _tool(
        name="calculate_roi",
        description="Calculate return on investment given buy price, sell price, and number of shares.",
        category="Calculator",
        properties={
            "buy_price":  _float("Purchase price per share"),
            "sell_price": _float("Current or sale price per share"),
            "shares":     _float("Number of shares", 1.0),
        },
        required=["buy_price", "sell_price"],
    ),
    _tool(
        name="compound_interest",
        description="Calculate how an investment grows with compound interest over time.",
        category="Calculator",
        properties={
            "principal":           _float("Initial investment amount"),
            "annual_rate":         _float("Annual interest rate as a decimal, e.g. 0.07 for 7%"),
            "years":               _int("Investment horizon in years"),
            "compounds_per_year":  _int("Compounding frequency per year", 12),
        },
        required=["principal", "annual_rate", "years"],
    ),
    _tool(
        name="dollar_cost_average",
        description="Project the outcome of a regular dollar-cost averaging investment strategy.",
        category="Calculator",
        properties={
            "monthly_investment": _float("Amount invested each month"),
            "annual_return":      _float("Expected annual return as a decimal, e.g. 0.08 for 8%"),
            "years":              _int("Investment horizon in years"),
        },
        required=["monthly_investment", "annual_return", "years"],
    ),

    # ── Budget ────────────────────────────────────────────────
    _tool(
        name="add_expense",
        description="Log a new expense entry in the user's budget tracker.",
        category="Budget",
        properties={
            "amount":      _float("Expense amount"),
            "category":    _str("Expense category", "Food"),
            "description": _str("Brief description of the expense"),
            "entry_date":  _str("Date in YYYY-MM-DD format (defaults to today)"),
        },
        required=["amount", "category"],
    ),
    _tool(
        name="add_income",
        description="Log a new income entry in the user's budget tracker.",
        category="Budget",
        properties={
            "amount":      _float("Income amount"),
            "category":    _str("Income category", "Salary"),
            "description": _str("Brief description of the income"),
            "entry_date":  _str("Date in YYYY-MM-DD format (defaults to today)"),
        },
        required=["amount", "category"],
    ),
    _tool(
        name="get_budget_summary",
        description="Get a summary of income, expenses, and net savings for a given month.",
        category="Budget",
        properties={
            "month": _str("Month in YYYY-MM format (defaults to current month)", "2025-01"),
        },
    ),

    # ── Tax ───────────────────────────────────────────────────
    _tool(
        name="estimate_capital_gains",
        description="Estimate the capital gains tax owed on a trade.",
        category="Tax",
        properties={
            "buy_price":        _float("Purchase price per share"),
            "sell_price":       _float("Sale price per share"),
            "shares":           _float("Number of shares sold"),
            "holding_days":     _int("Number of days the asset was held"),
            "annual_income":    _float("User's annual income for bracket calculation"),
            "country":          _str("Country code for tax rules, e.g. US UK AU", "US"),
        },
        required=["buy_price", "sell_price", "shares", "holding_days"],
    ),
    _tool(
        name="tax_bracket_lookup",
        description="Look up the income tax bracket and marginal rate for a given income level.",
        category="Tax",
        properties={
            "annual_income": _float("Annual taxable income"),
            "country":       _str("Country code", "US"),
            "filing_status": _str("Filing status: single married_filing_jointly married_filing_separately head_of_household", "single"),
        },
        required=["annual_income"],
    ),

    # ── Planning ──────────────────────────────────────────────
    _tool(
        name="retirement_calculator",
        description="Project how much the user will have at retirement given current savings and contributions.",
        category="Planning",
        properties={
            "current_savings":    _float("Current retirement savings balance"),
            "monthly_contribution": _float("Monthly contribution amount"),
            "years_to_retirement":  _int("Years until retirement"),
            "annual_return":        _float("Expected annual return as decimal, e.g. 0.07", 0.07),
        },
        required=["current_savings", "monthly_contribution", "years_to_retirement"],
    ),
    _tool(
        name="emergency_fund_calculator",
        description="Calculate the recommended emergency fund size based on monthly expenses.",
        category="Planning",
        properties={
            "monthly_expenses": _float("Total monthly essential expenses"),
            "months_coverage":  _int("Months of expenses to cover", 6),
            "current_savings":  _float("Current emergency fund balance", 0.0),
        },
        required=["monthly_expenses"],
    ),
    _tool(
        name="debt_payoff_calculator",
        description="Compare debt payoff strategies (avalanche vs snowball) and project payoff timeline.",
        category="Planning",
        properties={
            "debts":            _str("JSON array of debt objects with balance, rate, min_payment"),
            "extra_payment":    _float("Extra monthly payment available", 0.0),
            "strategy":         _str("Payoff strategy: avalanche (highest rate first) or snowball (lowest balance first)", "avalanche"),
        },
        required=["debts"],
    ),

    # ── News ──────────────────────────────────────────────────
    _tool(
        name="get_financial_news",
        description="Get the latest financial and market news headlines.",
        category="News",
        properties={
            "topic":  _str("Optional topic filter, e.g. 'inflation' 'Fed' 'crypto'"),
            "limit":  _int("Number of headlines to return", 10),
        },
    ),
    _tool(
        name="get_stock_news",
        description="Get recent news articles specifically about a stock or company.",
        category="News",
        properties={
            "ticker": _str("Stock ticker symbol", "AAPL"),
            "limit":  _int("Number of articles to return", 5),
        },
        required=["ticker"],
    ),

    # ── Documents ─────────────────────────────────────────────
    _tool(
        name="search_documents",
        description=(
            "Search the user's uploaded financial documents (PDFs, reports, statements) "
            "for information relevant to a query."
        ),
        category="Documents",
        properties={"query": _str("What to search for in the uploaded documents")},
        required=["query"],
    ),

    # ── Charts ────────────────────────────────────────────────
    _tool(
        name="generate_chart_image",
        description="Generate a financial chart image (price history, portfolio allocation, etc.).",
        category="Images",
        properties={
            "chart_type": _str("Type of chart: line bar pie candlestick", "line"),
            "ticker":     _str("Ticker symbol for price charts"),
            "title":      _str("Chart title"),
        },
    ),
    _tool(
        name="generate_financial_infographic",
        description="Generate a financial infographic summarising key metrics or concepts.",
        category="Images",
        properties={
            "topic":   _str("What the infographic should cover"),
            "data":    _str("Optional JSON data to visualise"),
        },
        required=["topic"],
    ),
]


# ── Lookup helpers ────────────────────────────────────────────

def get_tool_schema(name: str) -> dict | None:
    """Return the MCP schema for a specific tool by name."""
    return next((t for t in MCP_TOOLS if t["name"] == name), None)


def get_tools_by_category(category: str) -> list[dict]:
    """Return all tool schemas in a given category."""
    return [t for t in MCP_TOOLS if t["category"] == category]


def get_all_tool_names() -> list[str]:
    """Return a flat list of all registered tool names."""
    return [t["name"] for t in MCP_TOOLS]


def get_mcp_tool_list() -> list[dict]:
    """
    Return the tools list in the MCP protocol format expected by
    the ListTools response:
        [{ name, description, inputSchema }]
    """
    return [
        {
            "name":        t["name"],
            "description": t["description"],
            "inputSchema": t["inputSchema"],
        }
        for t in MCP_TOOLS
    ]
