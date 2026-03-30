import openai  # top-level import so tests can patch src.tools.image_tools.openai
import base64
import httpx

from langchain_core.tools import tool
from src.config.settings import settings  # top-level so tests can patch src.tools.image_tools.settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

_NO_KEY_MSG = (
    "⚠️ AI image generation requires an OpenAI API key (DALL-E 3). "
    "You are currently using a non-OpenAI model, but image generation always "
    "goes through OpenAI regardless of your selected model. "
    "Please ask your administrator to add OPENAI_API_KEY to the server's .env file "
    "to enable this feature."
)


def _url_to_base64(url: str) -> str:
    """
    Download an image URL and return it as a base64 string.

    BUG FIX: DALL-E URLs are signed Azure Blob Storage links that expire after
    1 hour. The old code returned the raw URL in the response text, which meant:
      - Any chat message reopened after 1 hour showed a broken image.
      - The frontend RemoteImageCard's download link would return HTTP 403.
      - Users had a 1-hour window to manually save the image.

    By downloading immediately and returning base64 (the same format chart_tools.py
    uses), the image bytes are stored permanently in the DB message content and
    render correctly no matter when the chat is opened.
    """
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    return base64.b64encode(resp.content).decode("utf-8")


@tool
def generate_chart_image(
    chart_type: str,
    title: str,
    description: str,
    size: str = "1024x1024",
) -> str:
    """
    Generate a financial chart or visualization image using AI (DALL-E 3).
    chart_type: pie, bar, line, candlestick, portfolio, comparison
    title: Chart title (e.g. 'My Portfolio Allocation')
    description: What the chart should show (e.g. '40% stocks, 30% bonds, 20% crypto, 10% cash')
    size: Image size — 1024x1024, 1792x1024, or 1024x1792
    Returns a base64-encoded PNG embedded directly in the chat (never expires).
    Note: Always uses OpenAI DALL-E 3 regardless of the active chat model.
    """
    try:
        if not settings.OPENAI_API_KEY:
            return _NO_KEY_MSG

        valid_sizes = {"1024x1024", "1792x1024", "1024x1792"}
        if size not in valid_sizes:
            size = "1024x1024"

        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = (
            f"Create a clean, professional financial {chart_type} chart titled '{title}'. "
            f"{description}. "
            f"Use a white background, modern design, clear labels, and professional financial color scheme "
            f"(blues, greens for positive, reds for negative). No watermarks. High quality."
        )

        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size=size,
            quality="standard",
            n=1,
        )

        image_url = response.data[0].url

        # BUG FIX: download immediately so the image is stored as permanent base64
        # instead of a 1-hour expiring Azure blob URL
        b64 = _url_to_base64(image_url)

        logger.info("image_generated", chart_type=chart_type, title=title)
        return f"CHART_BASE64:{b64}"

    except openai.AuthenticationError:
        logger.error("image_generation_auth_failed")
        return "❌ Image generation failed: Invalid OpenAI API key. Please check your OPENAI_API_KEY configuration."
    except openai.RateLimitError:
        logger.error("image_generation_rate_limited")
        return "❌ Image generation failed: OpenAI rate limit reached. Please try again in a moment."
    except openai.BadRequestError as e:
        logger.error("image_generation_content_policy", error=str(e))
        return f"❌ Image generation was blocked by content policy. Try rephrasing the description. Details: {str(e)}"
    except httpx.HTTPError as e:
        logger.error("image_download_failed", error=str(e))
        return f"❌ Image was generated but could not be downloaded: {str(e)}"
    except Exception as e:
        logger.error("image_generation_failed", error=str(e))
        return f"❌ Failed to generate image: {str(e)}"


@tool
def generate_financial_infographic(
    topic: str,
    key_points: str,
    style: str = "modern",
) -> str:
    """
    Generate a financial infographic or educational visual using AI (DALL-E 3).
    topic: The financial topic (e.g. 'compound interest', 'debt snowball method', 'portfolio diversification')
    key_points: Comma-separated key data points or facts to include
    style: modern, minimal, colorful, dark
    Returns a base64-encoded PNG embedded directly in the chat (never expires).
    Note: Always uses OpenAI DALL-E 3 regardless of the active chat model.
    """
    try:
        if not settings.OPENAI_API_KEY:
            return _NO_KEY_MSG

        valid_styles = {"modern", "minimal", "colorful", "dark"}
        if style not in valid_styles:
            style = "modern"

        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

        prompt = (
            f"Create a {style} financial infographic about '{topic}'. "
            f"Include these key points: {key_points}. "
            f"Professional design, clean typography, financial color palette, "
            f"white background, suitable for a financial advisory app. No watermarks."
        )

        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1792x1024",
            quality="standard",
            n=1,
        )

        image_url = response.data[0].url

        # BUG FIX: download immediately so the image is stored as permanent base64
        b64 = _url_to_base64(image_url)

        logger.info("infographic_generated", topic=topic)
        return f"CHART_BASE64:{b64}"

    except openai.AuthenticationError:
        logger.error("infographic_auth_failed")
        return "❌ Infographic generation failed: Invalid OpenAI API key."
    except openai.RateLimitError:
        logger.error("infographic_rate_limited")
        return "❌ Infographic generation failed: OpenAI rate limit reached. Please try again shortly."
    except openai.BadRequestError as e:
        logger.error("infographic_content_policy", error=str(e))
        return f"❌ Infographic was blocked by content policy. Try adjusting the description. Details: {str(e)}"
    except httpx.HTTPError as e:
        logger.error("infographic_download_failed", error=str(e))
        return f"❌ Infographic was generated but could not be downloaded: {str(e)}"
    except Exception as e:
        logger.error("infographic_generation_failed", error=str(e))
        return f"❌ Failed to generate infographic: {str(e)}"