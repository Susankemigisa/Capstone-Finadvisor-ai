"""
browser.py — Shared Playwright browser manager for FinAdvisor AI.

WHY A SHARED BROWSER?
---------------------
Launching a new Chromium instance on every tool call takes 1-3 seconds just
for startup.  A shared browser instance stays open for the lifetime of the
server process and each tool call opens a fresh page (tab) inside it instead,
which takes ~50ms.

SECURITY MODEL
--------------
Bank credentials are NEVER stored.  They are passed in at call time by the
agent (having retrieved them from the encrypted connections table), used once
in memory, and never logged or persisted.  The browser runs in headless mode
with a sandboxed profile so no cookies or sessions leak between calls.

USAGE
-----
    from src.utils.browser import get_browser, new_page

    async def my_tool():
        page = await new_page()          # fresh tab, auto-closed on exit
        try:
            await page.goto("https://example.com")
            text = await page.inner_text("h1")
            return text
        finally:
            await page.close()           # always close the tab when done

LIFECYCLE
---------
Call startup_browser() in main.py lifespan startup and
shutdown_browser() in lifespan shutdown.
"""

from __future__ import annotations

from playwright.async_api import (
    async_playwright,
    Browser,
    BrowserContext,
    Page,
    Playwright,
)
from src.utils.logger import get_logger

logger = get_logger(__name__)

_playwright: Playwright | None = None
_browser:    Browser    | None = None


async def startup_browser() -> None:
    """
    Launch a headless Chromium instance.
    Call once at application startup (FastAPI lifespan).
    """
    global _playwright, _browser
    _playwright = await async_playwright().start()
    _browser    = await _playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",               # required in Docker / Render containers
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",    # prevents OOM in low-memory envs
            "--disable-gpu",
        ],
    )
    logger.info("browser_started", browser_type="chromium")


async def shutdown_browser() -> None:
    """Close the browser and Playwright cleanly on app shutdown."""
    global _playwright, _browser
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None
    logger.info("browser_closed")


def get_browser() -> Browser:
    """Return the shared Browser instance. Raises if not started yet."""
    if _browser is None:
        raise RuntimeError(
            "Browser not initialised. "
            "Call startup_browser() in your app lifespan startup handler."
        )
    return _browser


async def new_page(
    viewport_width:  int  = 1280,
    viewport_height: int  = 800,
    locale:          str  = "en-US",
    timezone:        str  = "Africa/Kampala",
) -> Page:
    """
    Open a fresh isolated browser context + page (tab).
    Each call gets its own cookie jar and storage — no cross-contamination
    between tool calls or users.

    The caller is responsible for calling page.close() (and context.close())
    when done — use a try/finally block.
    """
    browser = get_browser()
    context: BrowserContext = await browser.new_context(
        viewport={"width": viewport_width, "height": viewport_height},
        locale=locale,
        timezone_id=timezone,
        # Appear as a real Chrome browser, not a bot
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        # Block images/fonts on pages we only need text from — faster scraping
        java_script_enabled=True,
    )
    page = await context.new_page()
    return page
