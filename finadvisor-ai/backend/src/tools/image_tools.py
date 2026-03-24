import openai  # top-level import so tests can patch src.tools.image_tools.openai

from langchain_core.tools import tool
from src.config.settings import settings  # top-level so tests can patch src.tools.image_tools.settings
from src.utils.logger import get_logger

logger = get_logger(__name__)

_NO_KEY_MSG = (
    "⚠️ Chart/image generation requires an OpenAI API key (DALL-E 3). "
    "You are currently using a non-OpenAI model, but image generation always "
    "goes through OpenAI regardless of your selected model. "
    "Please ask your administrator to add OPENAI_API_KEY to the server's .env file "
    "to enable this feature."
)


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
    Returns a URL to the generated image.
    Note: Always uses OpenAI DALL-E 3 regardless of the active chat model.
    """
    try:
        if not settings.OPENAI_API_KEY:
            return _NO_KEY_MSG

        # Validate size
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

        logger.info("image_generated", chart_type=chart_type, title=title)
        return (
            f"Image generated successfully!\n"
            f"URL: {image_url}\n"
            f"Note: This URL expires in 1 hour — save the image if you need it permanently."
        )

    except openai.AuthenticationError:
        logger.error("image_generation_auth_failed")
        return "❌ Image generation failed: Invalid OpenAI API key. Please check your OPENAI_API_KEY configuration."
    except openai.RateLimitError:
        logger.error("image_generation_rate_limited")
        return "❌ Image generation failed: OpenAI rate limit reached. Please try again in a moment."
    except openai.BadRequestError as e:
        logger.error("image_generation_content_policy", error=str(e))
        return f"❌ Image generation was blocked by content policy. Try rephrasing the description. Details: {str(e)}"
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
    Returns a URL to the generated infographic.
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
        logger.info("infographic_generated", topic=topic)
        return (
            f"Infographic generated!\n"
            f"URL: {image_url}\n"
            f"Note: URL expires in 1 hour — save the image if you need it permanently."
        )

    except openai.AuthenticationError:
        logger.error("infographic_auth_failed")
        return "❌ Infographic generation failed: Invalid OpenAI API key."
    except openai.RateLimitError:
        logger.error("infographic_rate_limited")
        return "❌ Infographic generation failed: OpenAI rate limit reached. Please try again shortly."
    except openai.BadRequestError as e:
        logger.error("infographic_content_policy", error=str(e))
        return f"❌ Infographic was blocked by content policy. Try adjusting the description. Details: {str(e)}"
    except Exception as e:
        logger.error("infographic_generation_failed", error=str(e))
        return f"❌ Failed to generate infographic: {str(e)}"