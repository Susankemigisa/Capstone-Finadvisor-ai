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
import math

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
    """
    Apply a clean, professional dark-friendly financial style.

    FIX: original used #FFFFFF figure + #F8F9FA axes → near-zero contrast,
    making bars invisible when they rendered against the light background.
    Now uses a slightly darker axes background (#F0F2F5) with the same white
    figure surround so the chart area is visually distinct and bars always show.
    """
    fig.patch.set_facecolor("#FFFFFF")
    ax.set_facecolor("#F0F2F5")          # FIX: was #F8F9FA — too close to white
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#AAAAAA")
    ax.spines["bottom"].set_color("#AAAAAA")
    ax.tick_params(colors="#333333", labelsize=9)
    ax.yaxis.grid(True, color="#D0D0D0", linestyle="--", linewidth=0.7)
    ax.set_axisbelow(True)


def _scale_disparity(values: list) -> float:
    """Return max/min ratio. > 100 means values span incompatible scales."""
    pos = [v for v in values if v and v > 0]
    if len(pos) < 2:
        return 1.0
    return max(pos) / min(pos)


def _clean_values(labels: list, values: list) -> tuple[list, list]:
    """
    FIX: Remove any None, NaN, or zero-or-negative entries that would produce
    invisible zero-height bars and make the chart appear blank.
    Returns the cleaned (labels, values) pair.
    """
    clean_l, clean_v = [], []
    for l, v in zip(labels, values):
        try:
            fv = float(v)
            if fv != fv:   # NaN check
                continue
            if fv <= 0:    # zero / negative = invisible bar
                continue
            clean_l.append(l)
            clean_v.append(fv)
        except (TypeError, ValueError):
            continue
    return clean_l, clean_v


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

        # FIX: strip NaN / zero / negative values that produce invisible bars
        label_list, value_list = _clean_values(label_list, value_list)

        if len(label_list) == 0:
            return "❌ No valid (non-zero, non-NaN) data to plot."

        color_map = {
            "blue":  ["#1A56DB", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"],
            "green": ["#057A55", "#0E9F6E", "#31C48D", "#6EE7B7", "#A7F3D0"],
            "red":   ["#C81E1E", "#E02424", "#F05252", "#F98080", "#FCA5A5"],
            "mixed": ["#1A56DB", "#057A55", "#C81E1E", "#9333EA", "#D97706",
                      "#0891B2", "#65A30D", "#DB2777"],
        }
        colors = (color_map.get(color_scheme, color_map["blue"]) * 10)[:len(label_list)]

        # FIX: detect scale disparity — when values span >100x range (e.g. VIX=18 vs
        # DOW=42000) the small bars render at ~0 pixels and appear invisible.
        # Solution: use a logarithmic y-axis so every bar has visible height.
        use_log = _scale_disparity(value_list) > 100

        fig, ax = plt.subplots(figsize=(max(6, len(label_list) * 0.9), 4.5))
        _apply_style(fig, ax)

        x = np.arange(len(label_list))
        bars = ax.bar(x, value_list, color=colors, width=0.6, zorder=2)

        if use_log:
            ax.set_yscale("log")
            ax.yaxis.grid(True, which="both", color="#D0D0D0", linestyle="--", linewidth=0.5)

        # Value labels on top of bars
        for bar, val in zip(bars, value_list):
            if use_log:
                # On log scale place text just above bar using a small offset
                y_pos = bar.get_height() * 1.15
            else:
                y_pos = bar.get_height() * 1.01

            label = f"${val:,.2f}" if val >= 1 else f"${val:.4f}"
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                y_pos,
                label,
                ha="center", va="bottom", fontsize=8, color="#111111",
                fontweight="bold",
            )

        ax.set_xticks(x)
        ax.set_xticklabels(label_list, rotation=15 if len(label_list) > 5 else 0, ha="right")
        ax.set_ylabel(y_label + (" (log scale)" if use_log else ""), fontsize=9, color="#333333")
        ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=12)

        if use_log:
            ax.set_ylim(bottom=min(value_list) * 0.5)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("bar_chart_generated", title=title, items=len(label_list), log_scale=use_log)
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
        raw_y  = json.loads(y_values)

        # FIX: filter NaN / None pairs together
        clean_x, clean_y = [], []
        for xl, yv in zip(x_list, raw_y):
            try:
                fv = float(yv)
                if fv == fv:   # NaN check
                    clean_x.append(xl)
                    clean_y.append(fv)
            except (TypeError, ValueError):
                continue

        if not clean_x:
            return "❌ No valid data points to plot."

        fig, ax = plt.subplots(figsize=(9, 4.5))
        _apply_style(fig, ax)

        x = np.arange(len(clean_x))
        color = "#1A56DB"

        ax.plot(x, clean_y, color=color, linewidth=2.5, zorder=3)
        ax.fill_between(x, clean_y, alpha=0.10, color=color)
        ax.scatter(x, clean_y, color=color, s=30, zorder=4)

        min_i, max_i = int(np.argmin(clean_y)), int(np.argmax(clean_y))
        ax.annotate(f"Low: {clean_y[min_i]:,.2f}", xy=(x[min_i], clean_y[min_i]),
                    xytext=(5, -18), textcoords="offset points",
                    fontsize=7.5, color="#C81E1E", fontweight="bold")
        ax.annotate(f"High: {clean_y[max_i]:,.2f}", xy=(x[max_i], clean_y[max_i]),
                    xytext=(5, 8), textcoords="offset points",
                    fontsize=7.5, color="#057A55", fontweight="bold")

        step = max(1, len(clean_x) // 10)
        ax.set_xticks(x[::step])
        ax.set_xticklabels(clean_x[::step], rotation=30, ha="right", fontsize=8)
        ax.set_ylabel(y_label, fontsize=9, color="#333333")
        ax.set_title(title, fontsize=13, fontweight="bold", color="#111827", pad=12)
        ax.legend([series_name], loc="upper left", fontsize=9)

        b64 = _fig_to_base64(fig)
        plt.close(fig)

        logger.info("line_chart_generated", title=title, points=len(clean_x))
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

        # FIX: filter zero/NaN/negative slices — they produce invisible slivers
        label_list, value_list = _clean_values(label_list, value_list)

        if not label_list:
            return "❌ No valid (positive, non-NaN) data to plot."

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

        labels = []
        values = []
        for p in positions:
            ticker = p.get("ticker", "?")
            shares = float(p.get("shares", 0) or 0)
            price  = float(p.get("avg_buy_price", 0) or 0)
            val    = shares * price
            if val > 0:
                labels.append(ticker)
                values.append(val)

        if not labels:
            return "❌ Could not calculate portfolio values — check that positions have shares and prices set."

        # FIX: filter zero/NaN entries just like other chart tools
        labels, values = _clean_values(labels, values)
        if not labels:
            return "❌ All portfolio positions have zero or invalid values."

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