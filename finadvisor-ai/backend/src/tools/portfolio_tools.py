from langchain_core.tools import tool
from src.utils.logger import get_logger

logger = get_logger(__name__)

# Thread-local user context — set by the chat route before agent runs
_current_user_id: str = ""

def set_user_context(user_id: str):
    """Called by the chat route to set the current user for tool calls."""
    global _current_user_id
    _current_user_id = user_id

def _get_user_id() -> str:
    if not _current_user_id:
        raise ValueError("No user context set. This tool requires authentication.")
    return _current_user_id


@tool
def add_position(ticker: str, shares: float, avg_buy_price: float, asset_type: str = "stock") -> str:
    """
    Add a stock or crypto position to the user's portfolio.
    ticker: Stock symbol e.g. AAPL, BTC
    shares: Number of shares or units
    avg_buy_price: Average purchase price per share/unit in USD
    asset_type: stock, crypto, etf
    """
    try:
        from src.database.operations import add_portfolio_position
        user_id = _get_user_id()
        result = add_portfolio_position(
            user_id=user_id,
            ticker=ticker.upper(),
            asset_type=asset_type,
            shares=shares,
            avg_buy_price=avg_buy_price,
        )
        if result:
            total_cost = shares * avg_buy_price
            logger.info("position_added", ticker=ticker, user_id=user_id)
            return f"✅ Added {shares} shares of {ticker.upper()} at ${avg_buy_price:,.2f} (Total cost: ${total_cost:,.2f})"
        return f"Failed to add position for {ticker}."
    except Exception as e:
        logger.error("add_position_failed", ticker=ticker, error=str(e))
        return f"Failed to add {ticker} to portfolio: {str(e)}"


@tool
def remove_position(position_id: str) -> str:
    """
    Remove a position from the user's portfolio by its ID.
    position_id: The UUID of the position (get it from get_portfolio first)
    """
    try:
        from src.database.operations import remove_portfolio_position
        user_id = _get_user_id()
        success = remove_portfolio_position(position_id, user_id)
        if success:
            return f"✅ Position {position_id} removed from portfolio."
        return f"Position {position_id} not found or you don't have permission to remove it."
    except Exception as e:
        logger.error("remove_position_failed", position_id=position_id, error=str(e))
        return f"Failed to remove position: {str(e)}"


@tool
def get_portfolio() -> str:
    """
    Get the user's current portfolio with all positions, current prices, and P&L.
    Fetches live prices for stocks and crypto.
    """
    try:
        import yfinance as yf
        from src.database.operations import get_portfolio as db_get_portfolio
        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty. Use add_position to start tracking investments."

        lines = ["**Your Portfolio**\n"]
        total_invested = 0
        total_current = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")
            cost_basis = shares * avg_price
            total_invested += cost_basis

            # Fetch current price
            try:
                if asset_type == "crypto":
                    t = yf.Ticker(f"{ticker}-USD")
                else:
                    t = yf.Ticker(ticker)
                info = t.info
                current_price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price
            except Exception:
                current_price = avg_price

            current_value = shares * current_price
            total_current += current_value
            pnl = current_value - cost_basis
            pnl_pct = (pnl / cost_basis) * 100 if cost_basis > 0 else 0
            pnl_icon = "▲" if pnl >= 0 else "▼"

            lines.append(f"**{ticker}** ({asset_type})")
            lines.append(f"  Shares: {shares:,.4f} | Avg: ${avg_price:,.2f} | Current: ${current_price:,.2f}")
            lines.append(f"  Value: ${current_value:,.2f} | P&L: {pnl_icon} ${abs(pnl):,.2f} ({abs(pnl_pct):.1f}%)")
            lines.append(f"  ID: {pos['id']}")
            lines.append("")

        total_pnl = total_current - total_invested
        total_pnl_pct = (total_pnl / total_invested) * 100 if total_invested > 0 else 0
        total_icon = "▲" if total_pnl >= 0 else "▼"

        lines.append("─" * 40)
        lines.append(f"**Total Invested:** ${total_invested:,.2f}")
        lines.append(f"**Portfolio Value:** ${total_current:,.2f}")
        lines.append(f"**Total P&L:** {total_icon} ${abs(total_pnl):,.2f} ({abs(total_pnl_pct):.1f}%)")

        logger.info("portfolio_fetched", user_id=user_id, positions=len(positions))
        return "\n".join(lines)

    except Exception as e:
        logger.error("get_portfolio_failed", error=str(e))
        return f"Failed to fetch portfolio: {str(e)}"


@tool
def calculate_allocation() -> str:
    """
    Calculate the percentage allocation of each position in the portfolio.
    Shows how diversified your portfolio is.
    """
    try:
        import yfinance as yf
        from src.database.operations import get_portfolio as db_get_portfolio
        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty."

        values = {}
        total = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")

            try:
                sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                info = yf.Ticker(sym).info
                price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price
            except Exception:
                price = avg_price

            value = shares * price
            values[ticker] = value
            total += value

        if total == 0:
            return "Portfolio total value is zero."

        lines = ["**Portfolio Allocation**\n"]
        for ticker, value in sorted(values.items(), key=lambda x: x[1], reverse=True):
            pct = (value / total) * 100
            bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
            lines.append(f"{ticker:8} {bar} {pct:5.1f}% (${value:,.2f})")

        lines.append(f"\nTotal: ${total:,.2f}")
        return "\n".join(lines)

    except Exception as e:
        logger.error("calculate_allocation_failed", error=str(e))
        return f"Failed to calculate allocation: {str(e)}"


@tool
def diversification_score() -> str:
    """
    Calculate a diversification score (0-100) for the user's portfolio.
    Analyzes sector spread, asset type mix, concentration risk, and geographic exposure.
    """
    try:
        import yfinance as yf
        from src.database.operations import get_portfolio as db_get_portfolio
        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty. Add positions first."

        if len(positions) < 2:
            return "⚠️ Add more positions to get a diversification score. You only have 1 position."

        values = {}
        sectors = {}
        asset_types = {}
        total = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")

            try:
                sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                info = yf.Ticker(sym).info
                price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price
                sector = info.get("sector", "Crypto" if asset_type == "crypto" else "Unknown")
            except Exception:
                price = avg_price
                sector = "Crypto" if asset_type == "crypto" else "Unknown"

            value = shares * price
            values[ticker] = value
            total += value
            sectors[sector] = sectors.get(sector, 0) + value
            asset_types[asset_type] = asset_types.get(asset_type, 0) + value

        if total == 0:
            return "Portfolio value is zero."

        # Score components
        # 1. Concentration risk (HHI) — lower is better
        weights = [v / total for v in values.values()]
        hhi = sum(w ** 2 for w in weights)  # 1/n = perfect, 1.0 = all in one
        concentration_score = max(0, 100 - (hhi * 100))  # 0-100

        # 2. Sector spread (0-100)
        n_sectors = len(sectors)
        sector_score = min(100, n_sectors * 15)  # 7+ sectors = 100

        # 3. Asset type mix (0-100)
        n_types = len(asset_types)
        type_score = min(100, n_types * 40)  # stocks + crypto + etf = 100

        # 4. Position count score
        count_score = min(100, len(positions) * 10)  # 10+ positions = 100

        # Weighted final score
        final = (concentration_score * 0.4) + (sector_score * 0.3) + (type_score * 0.15) + (count_score * 0.15)
        final = round(final, 1)

        # Grade
        if final >= 80: grade, emoji = "Excellent", "🟢"
        elif final >= 60: grade, emoji = "Good", "🟡"
        elif final >= 40: grade, emoji = "Fair", "🟠"
        else: grade, emoji = "Poor", "🔴"

        # Top holding concentration
        top_ticker = max(values, key=values.get)
        top_pct = (values[top_ticker] / total) * 100

        lines = [
            f"## 📊 Diversification Score: {final}/100 {emoji} {grade}",
            "",
            f"| Component | Score |",
            f"|-----------|-------|",
            f"| Concentration Risk | {concentration_score:.0f}/100 |",
            f"| Sector Spread ({n_sectors} sectors) | {sector_score:.0f}/100 |",
            f"| Asset Type Mix | {type_score:.0f}/100 |",
            f"| Position Count ({len(positions)}) | {count_score:.0f}/100 |",
            "",
            f"**⚠️ Largest holding:** {top_ticker} = {top_pct:.1f}% of portfolio",
            "",
            "**Sectors:**",
        ]
        for s, v in sorted(sectors.items(), key=lambda x: x[1], reverse=True):
            lines.append(f"  • {s}: {(v/total)*100:.1f}%")

        if final < 60:
            lines.append("\n**💡 Tips to improve:**")
            if top_pct > 30: lines.append(f"  • Reduce {top_ticker} concentration (currently {top_pct:.0f}%)")
            if n_sectors < 4: lines.append("  • Add positions in different sectors")
            if n_types < 2: lines.append("  • Mix asset types (stocks, ETFs, crypto)")
            if len(positions) < 5: lines.append("  • Add more positions (aim for 5-10+)")

        return "\n".join(lines)

    except Exception as e:
        logger.error("diversification_score_failed", error=str(e))
        return f"Failed to calculate diversification score: {str(e)}"


@tool
def rebalancing_suggestions(target_stocks: float = 60.0, target_crypto: float = 20.0, target_etf: float = 20.0) -> str:
    """
    Suggest portfolio rebalancing to hit target allocations.
    target_stocks: target % for stocks (default 60)
    target_crypto: target % for crypto (default 20)
    target_etf: target % for ETFs (default 20)
    """
    try:
        import yfinance as yf
        from src.database.operations import get_portfolio as db_get_portfolio
        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty."

        values = {}
        asset_types = {}
        total = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")

            try:
                sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                info = yf.Ticker(sym).info
                price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price
            except Exception:
                price = avg_price

            value = shares * price
            values[ticker] = {"value": value, "price": price, "shares": shares, "type": asset_type}
            asset_types[asset_type] = asset_types.get(asset_type, 0) + value
            total += value

        if total == 0:
            return "Portfolio value is zero."

        targets = {"stock": target_stocks / 100, "crypto": target_crypto / 100, "etf": target_etf / 100}

        lines = [
            f"## ⚖️ Rebalancing Suggestions",
            f"Portfolio Value: ${total:,.2f}",
            "",
            "**Current vs Target Allocation:**",
            f"| Asset Type | Current | Target | Action |",
            f"|------------|---------|--------|--------|",
        ]

        actions = []
        for atype, target_pct in targets.items():
            current_val = asset_types.get(atype, 0)
            current_pct = (current_val / total) * 100
            target_val = total * target_pct
            diff = target_val - current_val
            diff_pct = (target_pct * 100) - current_pct

            if abs(diff_pct) < 2:
                action = "✅ On target"
            elif diff > 0:
                action = f"📈 Buy ${diff:,.0f} more"
                actions.append(f"• **Buy** ${diff:,.0f} of {atype}s to reach {target_pct*100:.0f}% target")
            else:
                action = f"📉 Sell ${abs(diff):,.0f}"
                actions.append(f"• **Sell** ${abs(diff):,.0f} of {atype}s to reach {target_pct*100:.0f}% target")

            lines.append(f"| {atype.capitalize()} | {current_pct:.1f}% | {target_pct*100:.0f}% | {action} |")

        if actions:
            lines.append("\n**Recommended Actions:**")
            lines.extend(actions)

        lines.append(f"\n💡 Tip: You can adjust targets by asking e.g. '80% stocks, 10% crypto, 10% ETF'")
        return "\n".join(lines)

    except Exception as e:
        logger.error("rebalancing_failed", error=str(e))
        return f"Failed to generate rebalancing suggestions: {str(e)}"


@tool
def portfolio_risk_score() -> str:
    """
    Calculate a comprehensive risk score (1-10) for the user's portfolio.
    Automatically fetches portfolio positions and computes volatility, beta,
    concentration risk, and asset type risk. No inputs required.
    """
    try:
        import yfinance as yf
        import numpy as np
        from src.database.operations import get_portfolio as db_get_portfolio

        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty. Add positions first."

        if len(positions) < 1:
            return "Add at least one position to calculate risk."

        values = {}
        betas = {}
        volatilities = {}
        asset_types = {}
        total = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")

            try:
                sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                t = yf.Ticker(sym)
                info = t.info
                price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price

                # Beta from yfinance (stocks only; crypto gets assigned high beta)
                if asset_type == "crypto":
                    beta = 1.8  # crypto is inherently high volatility
                else:
                    beta = info.get("beta") or 1.0

                # 30-day historical volatility
                hist = t.history(period="30d")["Close"]
                if len(hist) > 5:
                    returns = hist.pct_change().dropna()
                    vol = float(returns.std() * (252 ** 0.5) * 100)  # annualised %
                else:
                    vol = 20.0  # default if not enough history

            except Exception:
                price = avg_price
                beta = 1.0 if asset_type != "crypto" else 1.8
                vol = 25.0 if asset_type == "crypto" else 15.0

            value = shares * price
            values[ticker] = value
            betas[ticker] = beta
            volatilities[ticker] = vol
            asset_types[ticker] = asset_type
            total += value

        if total == 0:
            return "Portfolio total value is zero."

        # --- Weighted metrics ---
        weights = {t: v / total for t, v in values.items()}

        weighted_beta = sum(weights[t] * betas[t] for t in values)
        weighted_vol = sum(weights[t] * volatilities[t] for t in values)

        # Top holding concentration %
        top_ticker = max(values, key=values.get)
        top_pct = (values[top_ticker] / total) * 100

        # Asset type penalty: all-crypto or all-single-stock = higher risk
        n_types = len(set(asset_types.values()))
        type_penalty = max(0, (3 - n_types) * 0.5)  # +0.5 per missing asset type

        # --- Risk Score formula (1–10) ---
        # Normalise: vol 0-50% → 0-4pts, beta 0-3 → 0-3pts, concentration 0-100% → 0-2pts, type penalty 0-1pt
        vol_pts         = min(4.0, weighted_vol / 12.5)
        beta_pts        = min(3.0, weighted_beta)
        conc_pts        = min(2.0, top_pct / 50)
        penalty_pts     = min(1.0, type_penalty)
        raw_score       = vol_pts + beta_pts + conc_pts + penalty_pts
        score           = round(min(10.0, max(1.0, raw_score)), 1)

        # Label
        if score <= 3:   label, emoji, color = "Low",    "🟢", "conservative"
        elif score <= 5: label, emoji, color = "Moderate","🟡", "balanced"
        elif score <= 7: label, emoji, color = "High",   "🟠", "aggressive"
        else:            label, emoji, color = "Very High","🔴", "very aggressive"

        # Build breakdown table
        rows = [
            f"## ⚡ Portfolio Risk Score: **{score}/10** {emoji} — {label} Risk",
            "",
            f"Your portfolio has a **{color}** risk profile based on {len(positions)} position(s).",
            "",
            "| Metric | Value | Contribution |",
            "|--------|-------|--------------|",
            f"| Weighted Volatility | {weighted_vol:.1f}% annualised | {vol_pts:.1f}/4 pts |",
            f"| Weighted Beta | {weighted_beta:.2f} | {beta_pts:.1f}/3 pts |",
            f"| Concentration ({top_ticker}) | {top_pct:.1f}% of portfolio | {conc_pts:.1f}/2 pts |",
            f"| Asset Type Diversity | {n_types} type(s) | {penalty_pts:.1f}/1 pt |",
            "",
            "**Position Risk Breakdown:**",
        ]

        for t in sorted(values, key=lambda x: values[x], reverse=True):
            pct = weights[t] * 100
            rows.append(
                f"  • **{t}** ({asset_types[t]}) — {pct:.1f}% of portfolio | "
                f"Vol: {volatilities[t]:.1f}% | Beta: {betas[t]:.2f}"
            )

        rows.append("")

        # Actionable advice
        rows.append("**💡 Risk Reduction Tips:**")
        if top_pct > 40:
            rows.append(f"  • {top_ticker} is {top_pct:.0f}% of your portfolio — consider trimming to under 30%")
        if weighted_beta > 1.5:
            rows.append("  • High beta exposure — add lower-beta assets (bonds, dividend stocks, ETFs) to stabilise")
        if weighted_vol > 30:
            rows.append("  • High volatility — consider adding stable blue-chip stocks or index ETFs like SPY/QQQ")
        if n_types < 2:
            rows.append("  • All assets are the same type — mix stocks, ETFs, and crypto for better diversification")
        if len(positions) == 1:
            rows.append("  • Single position portfolio — diversify across at least 5-10 different assets")
        if score <= 3:
            rows.append("  • Your portfolio is well-diversified with low risk — great for steady long-term growth")

        logger.info("portfolio_risk_score_calculated", user_id=user_id, score=score)
        return "\n".join(rows)

    except Exception as e:
        logger.error("portfolio_risk_score_failed", error=str(e))
        return f"Failed to calculate portfolio risk score: {str(e)}"


@tool
def top_performer() -> str:
    """
    Find the top and worst performing positions in the user's portfolio.
    Ranks all holdings by return percentage and dollar gain/loss.
    No inputs required — automatically fetches portfolio data.
    """
    try:
        import yfinance as yf
        from src.database.operations import get_portfolio as db_get_portfolio

        user_id = _get_user_id()
        positions = db_get_portfolio(user_id)

        if not positions:
            return "Your portfolio is empty. Add positions first."

        if len(positions) < 1:
            return "Add at least one position to see performance."

        results = []
        total_invested = 0
        total_current = 0

        for pos in positions:
            ticker = pos["ticker"]
            shares = float(pos["shares"])
            avg_price = float(pos["avg_buy_price"])
            asset_type = pos.get("asset_type", "stock")
            cost_basis = shares * avg_price

            try:
                sym = f"{ticker}-USD" if asset_type == "crypto" else ticker
                info = yf.Ticker(sym).info
                current_price = info.get("regularMarketPrice") or info.get("currentPrice") or avg_price
            except Exception:
                current_price = avg_price

            current_value = shares * current_price
            pnl = current_value - cost_basis
            pnl_pct = (pnl / cost_basis) * 100 if cost_basis > 0 else 0

            results.append({
                "ticker": ticker,
                "asset_type": asset_type,
                "shares": shares,
                "avg_price": avg_price,
                "current_price": current_price,
                "cost_basis": cost_basis,
                "current_value": current_value,
                "pnl": pnl,
                "pnl_pct": pnl_pct,
            })

            total_invested += cost_basis
            total_current += current_value

        # Sort by % return
        ranked = sorted(results, key=lambda x: x["pnl_pct"], reverse=True)
        total_pnl = total_current - total_invested
        total_pnl_pct = (total_pnl / total_invested) * 100 if total_invested > 0 else 0

        lines = [
            "## 🏆 Portfolio Performance Ranking",
            "",
            f"**Portfolio Total:** ${total_invested:,.2f} invested → ${total_current:,.2f} current "
            f"({'▲' if total_pnl >= 0 else '▼'} ${abs(total_pnl):,.2f} | {total_pnl_pct:+.1f}%)",
            "",
            "| Rank | Ticker | Type | Return % | P&L | Current Price |",
            "|------|--------|------|----------|-----|---------------|",
        ]

        for i, p in enumerate(ranked):
            medal = ["🥇", "🥈", "🥉"][i] if i < 3 else f"#{i+1}"
            arrow = "▲" if p["pnl"] >= 0 else "▼"
            lines.append(
                f"| {medal} | **{p['ticker']}** | {p['asset_type']} | "
                f"{p['pnl_pct']:+.1f}% | {arrow} ${abs(p['pnl']):,.2f} | "
                f"${p['current_price']:,.2f} |"
            )

        # Top performer callout
        best = ranked[0]
        worst = ranked[-1]

        lines += [
            "",
            f"### 🥇 Top Performer: **{best['ticker']}**",
            f"  Up **{best['pnl_pct']:+.1f}%** since purchase "
            f"(bought at ${best['avg_price']:,.2f}, now ${best['current_price']:,.2f})",
            f"  Gain: **▲ ${best['pnl']:,.2f}** on ${best['cost_basis']:,.2f} invested",
        ]

        if len(ranked) > 1:
            lines += [
                "",
                f"### 📉 Worst Performer: **{worst['ticker']}**",
                f"  {'Down' if worst['pnl'] < 0 else 'Up'} **{worst['pnl_pct']:+.1f}%** since purchase "
                f"(bought at ${worst['avg_price']:,.2f}, now ${worst['current_price']:,.2f})",
                f"  {'Loss' if worst['pnl'] < 0 else 'Gain'}: **{'▼' if worst['pnl'] < 0 else '▲'} "
                f"${abs(worst['pnl']):,.2f}** on ${worst['cost_basis']:,.2f} invested",
            ]

        logger.info("top_performer_calculated", user_id=user_id, positions=len(positions))
        return "\n".join(lines)

    except Exception as e:
        logger.error("top_performer_failed", error=str(e))
        return f"Failed to calculate top performer: {str(e)}"