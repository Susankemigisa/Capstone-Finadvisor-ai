"""
browser_tools.py — Playwright-powered browser automation tools.

WHY PLAYWRIGHT IN A FINANCIAL AI AGENT?
----------------------------------------
Many financial institutions — especially in East Africa — do not expose
developer APIs.  Banks like Centenary, DFCU, Stanbic Uganda, and most
mobile money portals only provide web dashboards.  Playwright lets the agent
interact with those portals the same way a human would: open the page, fill
in credentials, click buttons, read values, download files.

This is used ONLY as a fallback when a dedicated API tool is unavailable.
The agent will prefer structured API calls (market_tools, crypto_tools,
connections/*) and only invoke these browser tools when the user explicitly
asks about a source that has no API.

SECURITY
--------
- Credentials are never logged (structlog will not serialise them because
  they are not passed as keyword arguments to logger calls).
- Each tool call gets its own isolated browser context (separate cookie jar).
- No session cookies are persisted between calls.
- Screenshots and downloaded files are written to /tmp and the path (or
  base64) is returned — never stored in the database directly.

ADDING NEW BANKS
----------------
Each bank has a slightly different DOM.  The _login_and_navigate helpers
below are written generically with CSS selector parameters so you can add
a new bank by passing its selectors without rewriting the tool logic.
"""

import asyncio
import base64
import os
import tempfile
from pathlib import Path

from langchain_core.tools import tool
from src.utils.browser import new_page
from src.utils.logger import get_logger

logger = get_logger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _safe_close(page) -> None:
    """Close both the page and its parent context without raising."""
    try:
        context = page.context
        await page.close()
        await context.close()
    except Exception:
        pass


async def _wait_and_fill(page, selector: str, value: str, timeout: int = 8000) -> None:
    """Wait for an element to be visible, then fill it."""
    await page.wait_for_selector(selector, timeout=timeout)
    await page.fill(selector, value)


# ── Tool 1: Download bank statement ──────────────────────────────────────────

@tool
async def download_bank_statement(
    bank_url: str,
    username_selector: str,
    password_selector: str,
    login_button_selector: str,
    username: str,
    password: str,
    statements_nav_selector: str,
    download_button_selector: str,
    month: str = "",
    month_selector: str = "",
) -> str:
    """
    Log into an online banking portal and download a monthly statement as PDF.

    Use this when the user wants their bank statement and the bank has no API.
    Always ask the user to confirm before using their credentials.

    Parameters
    ----------
    bank_url                : Full URL of the bank login page, e.g. https://ibank.centenary.co.ug
    username_selector       : CSS selector for the username/email input, e.g. #username
    password_selector       : CSS selector for the password input, e.g. #password
    login_button_selector   : CSS selector for the login/submit button, e.g. #login-btn
    username                : The user's online banking username or email
    password                : The user's online banking password
    statements_nav_selector : CSS selector or text for the Statements link, e.g. text=Statements
    download_button_selector: CSS selector for the download/export button
    month                   : Month to download, e.g. "2026-05" (leave blank for latest)
    month_selector          : CSS selector for the month dropdown (leave blank if not needed)

    Returns the file path of the downloaded PDF, or an error message.
    """
    page = await new_page()
    tmp_dir = tempfile.mkdtemp()

    try:
        # Navigate to login page
        await page.goto(bank_url, wait_until="domcontentloaded", timeout=30_000)
        logger.info("browser_navigated", url=bank_url)

        # Fill credentials
        await _wait_and_fill(page, username_selector, username)
        await _wait_and_fill(page, password_selector, password)

        # Click login and wait for navigation
        async with page.expect_navigation(timeout=15_000):
            await page.click(login_button_selector)

        logger.info("browser_logged_in", bank=bank_url)

        # Navigate to statements section
        await page.click(statements_nav_selector)
        await page.wait_for_load_state("networkidle", timeout=10_000)

        # Select month if a dropdown selector was provided
        if month and month_selector:
            await page.select_option(month_selector, month)
            await page.wait_for_load_state("networkidle", timeout=8_000)

        # Set up download destination and trigger download
        pdf_path = os.path.join(tmp_dir, f"statement_{month or 'latest'}.pdf")
        async with page.expect_download(timeout=30_000) as dl_info:
            await page.click(download_button_selector)

        download = await dl_info.value
        await download.save_as(pdf_path)

        logger.info("bank_statement_downloaded", path=pdf_path)
        return (
            f"✅ Statement downloaded successfully.\n"
            f"File: {pdf_path}\n"
            f"You can now ask me to analyse it or extract specific transactions."
        )

    except Exception as e:
        logger.error("download_bank_statement_failed", bank=bank_url, error=str(e))
        return (
            f"❌ Could not download statement from {bank_url}.\n"
            f"Reason: {str(e)}\n"
            f"Check that the selectors match the bank's current page layout, "
            f"or try logging in manually and downloading the PDF yourself."
        )
    finally:
        await _safe_close(page)


# ── Tool 2: Scrape exchange rate ──────────────────────────────────────────────

@tool
async def scrape_exchange_rate(
    from_currency: str,
    to_currency: str,
) -> str:
    """
    Scrape the live exchange rate between two currencies from XE.com.

    Use this when the market_tools API doesn't have a specific currency pair
    (common for UGX, KES, TZS, RWF and other East African currencies).

    from_currency : ISO 4217 code, e.g. USD, UGX, EUR, GBP, KES
    to_currency   : ISO 4217 code, e.g. UGX, USD, KES, TZS

    Returns the exchange rate as a formatted string.
    """
    page = await new_page()

    try:
        from_c = from_currency.upper().strip()
        to_c   = to_currency.upper().strip()
        url    = f"https://www.xe.com/currencyconverter/convert/?Amount=1&From={from_c}&To={to_c}"

        await page.goto(url, wait_until="domcontentloaded", timeout=20_000)

        # XE renders the rate in a paragraph that contains the conversion result.
        # We wait for the result element and read its text.
        rate_selector = "p.sc-63d8b7e3-1"   # XE's result paragraph (stable as of 2026)
        await page.wait_for_selector(rate_selector, timeout=10_000)
        rate_text = await page.inner_text(rate_selector)

        # rate_text looks like: "1.00 USD = 3,740.25 UGX"
        # Clean it up
        rate_text = rate_text.strip().replace("\n", " ")

        logger.info("exchange_rate_scraped", from_c=from_c, to_c=to_c, rate=rate_text)
        return (
            f"**Live Exchange Rate (XE.com)**\n"
            f"{rate_text}\n"
            f"_Rates update every minute. Source: xe.com_"
        )

    except Exception as e:
        logger.error("scrape_exchange_rate_failed", from_c=from_currency, to_c=to_currency, error=str(e))

        # Graceful fallback message with context
        return (
            f"❌ Could not scrape exchange rate for {from_currency}/{to_currency}.\n"
            f"Reason: {str(e)}\n"
            f"Try visiting https://www.xe.com/currencyconverter/convert/"
            f"?From={from_currency.upper()}&To={to_currency.upper()} directly."
        )
    finally:
        await _safe_close(page)


# ── Tool 3: Screenshot a financial dashboard ──────────────────────────────────

@tool
async def capture_dashboard_screenshot(
    url: str,
    wait_for_selector: str = "",
    scroll_to_bottom: bool = False,
) -> str:
    """
    Take a full-page screenshot of a financial dashboard or webpage and return
    it as a base64-encoded PNG so it can be displayed in the chat.

    Use this when the user wants to see a visual snapshot of a dashboard,
    report page, or portfolio view that exists on the web.

    url                : Full URL of the page to screenshot
    wait_for_selector  : Optional CSS selector to wait for before screenshotting
                         (ensures the page has fully loaded its data, e.g. ".chart-container")
    scroll_to_bottom   : Set True to capture a long page by scrolling first

    Returns CHART_BASE64:<data> which the frontend renders as an inline image.
    """
    page = await new_page(viewport_width=1440, viewport_height=900)

    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        logger.info("browser_navigated_for_screenshot", url=url)

        # Wait for a specific element if requested (e.g. chart has finished rendering)
        if wait_for_selector:
            await page.wait_for_selector(wait_for_selector, timeout=10_000)

        # Optionally scroll to trigger lazy-loaded content
        if scroll_to_bottom:
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1)  # brief pause for lazy images to load
            await page.evaluate("window.scrollTo(0, 0)")

        # Take the screenshot as bytes (no temp file needed)
        screenshot_bytes = await page.screenshot(full_page=True, type="png")
        b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

        logger.info("dashboard_screenshot_captured", url=url, size_kb=len(screenshot_bytes) // 1024)
        return f"CHART_BASE64:{b64}"

    except Exception as e:
        logger.error("capture_dashboard_screenshot_failed", url=url, error=str(e))
        return (
            f"❌ Could not capture screenshot of {url}.\n"
            f"Reason: {str(e)}"
        )
    finally:
        await _safe_close(page)
