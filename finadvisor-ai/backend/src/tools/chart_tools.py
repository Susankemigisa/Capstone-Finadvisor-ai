"""
chart_tools.py — Real data-driven financial chart generation using matplotlib.

Unlike image_tools.py (which uses DALL-E to *draw a picture* of a chart),
these tools take actual numbers and produce accurate, properly-labelled charts
as base64-encoded PNG images embedded directly in the chat response.

No API key required — matplotlib is a Python library.

Tools:
    generate_bar_chart      — Bar chart from labeled data (e.g. stock comparison)
    generate_line_chart     — Line chart for time-series data (e.g. price history)
    generate_pie_chart      — Pie chart for allocation / breakdown data
    generate_portfolio_chart — Auto-generates a portfolio allocation pie chart
                               by fetching the user's live portfolio data
"""

import base64
import io
import json

from langchain_core.tools import tool

from src.utils.logger import get_logger

logger = get_logger(__name__)


def _fig_to_base64(fig) -> str:
    """Convert a matplotlib figure to a base64 PNG string."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150, facecolor=fig.get_facecolor())
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _apply_style(fig, ax):
    """Apply a clean, professional financial style to the chart."""
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#F8F9FA")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#CCCCCC")
    ax.spines["bottom"].set_color("#CCCCCC")
    ax.tick_params(colors="#555555", labelsize=9)
    ax.yaxis.grid(True, color="#E0E0E0", linestyle="--", linewidth=0.7)
    ax.set_axisbelow(True)


@tool
def generate_bar_chart(
    labels: str,
    values: str,
    title: str,
    y_label: str = "Value",
    color_scheme: str = "blue",
) -> str:
    """
    Generate a bar chart from labeled data and return it as a base64 PNG image.
    Use this for comparing values across categories — stock prices, budget categories,
    monthly expenses, portfolio returns, etc.

    labels: JSON array of category names e.g. '["AAPL", "MSFT", "BTC"]'
    values: JSON array of numbers matching the labels e.g. '[252.62, 371.04, 70038.00]'
    title: Chart title e.g. 'Stock Price Comparison'
    y_label: Y-axis label e.g. 'Price (USD)'
    color_scheme: 'blue', 'green', 'mixed', 'red'

    Returns base64-encoded PNG — the frontend renders this as an inline image.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        label_list = json.loads(labels)
        value_list = [float(v) for v in json.loads(values)]

        if len(label_list) != len(value_list):
            return "❌ labels and values must have the same number of items."
        if len(label_list) == 0:
            return "❌ No data provided."

        color_map = {
            "blue":   ["#1A56DB", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"],
            "green":  ["#057A55", "#0E9F6E", "#31C48D", "#6EE7B7", "#A7F3D0"],
            "red":    ["#C81E1E", "#E02424", "#F05252", "#F98080", "#FCA5A5"],
            "mixed":  ["#1A56DB", "#057A55", "#C81E1E", "#9333EA", "#D97706",
                       "#0891B2", "#65A30D", "#DB2777"],
        }
        colors = (color_map.get(color_scheme, color_map["blue"]) * 10)[:len(label_list)]

        fig, ax = plt.subplots(figsize=(max(6, len(label_list) * 0.9), 4.5))
        _apply_style(fig, ax)

        x = np.arange(len(label_list))
        bars = ax.bar(x, value_list, color=colors, width=0.6, zorder=2)

        # Value labels on top of bars
        for bar, val in zip(bars, value_list):
            label = f"${val:,.2f}" if val >= 1 else f"${val:.4f}"
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() * 1.01,
                label,
                ha="center", va="bottom", fontsize=8, color="#333333"
            )

        ax.set_xticks(x)
        ax.set_xticklabels(label_list, rotation=15 if len(label_list) > 5 else 0, ha="right")
        ax.set_ylabel(y_label, fontsize=9, color="#555555")
        ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=12)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("bar_chart_generated", title=title, items=len(label_list))
        return f"CHART_BASE64:{b64}"

    except json.JSONDecodeError:
        return "❌ Invalid JSON for labels or values. Use format: '[\"AAPL\", \"MSFT\"]' and '[252.62, 371.04]'"
    except Exception as e:
        logger.error("bar_chart_failed", error=str(e))
        return f"❌ Failed to generate bar chart: {str(e)}"


@tool
def generate_line_chart(
    x_labels: str,
    y_values: str,
    title: str,
    y_label: str = "Value",
    series_name: str = "Price",
) -> str:
    """
    Generate a line chart for time-series or sequential data.
    Use this for stock price history, portfolio growth over time,
    monthly budget trends, savings progress, etc.

    x_labels: JSON array of x-axis labels e.g. '["Jan", "Feb", "Mar"]' or dates
    y_values: JSON array of numbers e.g. '[150.0, 162.5, 158.3]'
    title: Chart title e.g. 'AAPL Price — Last 30 Days'
    y_label: Y-axis label e.g. 'Price (USD)'
    series_name: Legend label for the line e.g. 'AAPL'

    Returns base64-encoded PNG.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np

        x_list = json.loads(x_labels)
        y_list = [float(v) for v in json.loads(y_values)]

        if len(x_list) != len(y_list):
            return "❌ x_labels and y_values must have the same number of items."
        if len(x_list) == 0:
            return "❌ No data provided."

        fig, ax = plt.subplots(figsize=(9, 4.5))
        _apply_style(fig, ax)

        x = np.arange(len(x_list))
        color = "#1A56DB"

        ax.plot(x, y_list, color=color, linewidth=2, zorder=3)
        ax.fill_between(x, y_list, alpha=0.08, color=color)
        ax.scatter(x, y_list, color=color, s=30, zorder=4)

        # Show min/max annotations
        min_i, max_i = int(np.argmin(y_list)), int(np.argmax(y_list))
        ax.annotate(f"Low: {y_list[min_i]:,.2f}", xy=(x[min_i], y_list[min_i]),
                    xytext=(5, -18), textcoords="offset points",
                    fontsize=7.5, color="#C81E1E")
        ax.annotate(f"High: {y_list[max_i]:,.2f}", xy=(x[max_i], y_list[max_i]),
                    xytext=(5, 8), textcoords="offset points",
                    fontsize=7.5, color="#057A55")

        step = max(1, len(x_list) // 10)
        ax.set_xticks(x[::step])
        ax.set_xticklabels(x_list[::step], rotation=30, ha="right", fontsize=8)
        ax.set_ylabel(y_label, fontsize=9, color="#555555")
        ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=12)
        ax.legend([series_name], loc="upper left", fontsize=9)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("line_chart_generated", title=title, points=len(x_list))
        return f"CHART_BASE64:{b64}"

    except json.JSONDecodeError:
        return "❌ Invalid JSON. Use format: '[\"Jan\", \"Feb\"]' and '[100.0, 110.5]'"
    except Exception as e:
        logger.error("line_chart_failed", error=str(e))
        return f"❌ Failed to generate line chart: {str(e)}"


@tool
def generate_pie_chart(
    labels: str,
    values: str,
    title: str,
) -> str:
    """
    Generate a pie chart showing proportional breakdown.
    Use this for portfolio allocation, budget category split,
    asset type distribution, expense breakdown, etc.

    labels: JSON array of category names e.g. '["Stocks", "Bonds", "Cash"]'
    values: JSON array of numbers (raw amounts or percentages) e.g. '[40, 35, 25]'
    title: Chart title e.g. 'My Portfolio Allocation'

    Returns base64-encoded PNG.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        label_list = json.loads(labels)
        value_list = [float(v) for v in json.loads(values)]

        if len(label_list) != len(value_list):
            return "❌ labels and values must have the same number of items."
        if len(label_list) == 0:
            return "❌ No data provided."
        if any(v < 0 for v in value_list):
            return "❌ Pie chart values must all be positive."

        palette = [
            "#1A56DB", "#057A55", "#C81E1E", "#9333EA", "#D97706",
            "#0891B2", "#65A30D", "#DB2777", "#7C3AED", "#059669"
        ]
        colors = (palette * 5)[:len(label_list)]

        fig, ax = plt.subplots(figsize=(7, 5))
        fig.patch.set_facecolor("#FFFFFF")

        wedges, texts, autotexts = ax.pie(
            value_list,
            labels=None,
            colors=colors,
            autopct="%1.1f%%",
            startangle=140,
            pctdistance=0.82,
            wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
        )
        for at in autotexts:
            at.set_fontsize(8.5)
            at.set_color("white")
            at.set_fontweight("bold")

        ax.legend(
            wedges, label_list,
            loc="center left",
            bbox_to_anchor=(1, 0, 0.5, 1),
            fontsize=9,
            frameon=False,
        )
        ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=14)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("pie_chart_generated", title=title, slices=len(label_list))
        return f"CHART_BASE64:{b64}"

    except json.JSONDecodeError:
        return "❌ Invalid JSON. Use format: '[\"Stocks\", \"Bonds\"]' and '[60, 40]'"
    except Exception as e:
        logger.error("pie_chart_failed", error=str(e))
        return f"❌ Failed to generate pie chart: {str(e)}"


@tool
def generate_portfolio_chart(user_id: str) -> str:
    """
    Automatically generate a portfolio allocation pie chart using the user's
    actual live portfolio data. No need to pass labels or values manually —
    this tool fetches the portfolio and builds the chart automatically.

    user_id: The current user's ID (pass from context)

    Returns base64-encoded PNG showing portfolio allocation by ticker and asset type.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from src.database.operations import get_portfolio

        positions = get_portfolio(user_id)
        if not positions:
            return "❌ Your portfolio is empty. Add some positions first with the 'Add Position' tool."

        # Group by ticker with value = shares * avg_buy_price as proxy
        labels = []
        values = []
        for p in positions:
            ticker = p.get("ticker", "?")
            shares = float(p.get("shares", 0))
            price = float(p.get("avg_buy_price", 0))
            val = shares * price
            if val > 0:
                labels.append(ticker)
                values.append(val)

        if not labels:
            return "❌ Could not calculate portfolio values — check that positions have shares and prices set."

        total = sum(values)
        palette = [
            "#1A56DB", "#057A55", "#C81E1E", "#9333EA", "#D97706",
            "#0891B2", "#65A30D", "#DB2777", "#7C3AED", "#059669"
        ]
        colors = (palette * 5)[:len(labels)]

        fig, ax = plt.subplots(figsize=(7, 5))
        fig.patch.set_facecolor("#FFFFFF")

        wedges, texts, autotexts = ax.pie(
            values, labels=None, colors=colors,
            autopct="%1.1f%%", startangle=140, pctdistance=0.82,
            wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
        )
        for at in autotexts:
            at.set_fontsize(8.5)
            at.set_color("white")
            at.set_fontweight("bold")

        legend_labels = [f"{l} (${v:,.0f})" for l, v in zip(labels, values)]
        ax.legend(wedges, legend_labels, loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1), fontsize=9, frameon=False)
        ax.set_title(f"Portfolio Allocation (Total: ${total:,.2f})",
                     fontsize=13, fontweight="bold", color="#111827", pad=14)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("portfolio_chart_generated", user_id=user_id, positions=len(labels))
        return f"CHART_BASE64:{b64}"

    except Exception as e:
        logger.error("portfolio_chart_failed", error=str(e))
        return f"❌ Failed to generate portfolio chart: {str(e)}"