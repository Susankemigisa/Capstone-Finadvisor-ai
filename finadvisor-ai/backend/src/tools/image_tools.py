from langchain_core.tools import tool
from src.utils.logger import get_logger

logger = get_logger(__name__)


@tool
def generate_chart_image(
    chart_type: str,
    title: str,
    description: str,
    size: str = "1024x1024",
) -> str:
    """
    Generate a financial chart or visualization image using AI.
    chart_type: pie, bar, line, candlestick, portfolio, comparison
    title: Chart title (e.g. 'My Portfolio Allocation')
    description: What the chart should show (e.g. '40% stocks, 30% bonds, 20% crypto, 10% cash')
    size: Image size — 1024x1024, 1792x1024, or 1024x1792
    Returns a URL to the generated image.
    """
    try:
        import openai
        from src.config.settings import settings

        if not settings.OPENAI_API_KEY:
            return "Image generation requires an OpenAI API key. Please add OPENAI_API_KEY to your .env file."

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
        revised_prompt = response.data[0].revised_prompt

        logger.info("image_generated", chart_type=chart_type, title=title)
        return f"Image generated successfully!\nURL: {image_url}\nNote: This URL expires in 1 hour — save the image if you need it permanently."

    except Exception as e:
        logger.error("image_generation_failed", error=str(e))
        return f"Failed to generate image: {str(e)}"


@tool
def generate_financial_infographic(
    topic: str,
    key_points: str,
    style: str = "modern",
) -> str:
    """
    Generate a financial infographic or educational visual.
    topic: The financial topic (e.g. 'compound interest', 'debt snowball method', 'portfolio diversification')
    key_points: Comma-separated key data points or facts to include
    style: modern, minimal, colorful, dark
    Returns a URL to the generated infographic.
    """
    try:
        import openai
        from src.config.settings import settings

        if not settings.OPENAI_API_KEY:
            return "Image generation requires an OpenAI API key."

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
        return f"Infographic generated!\nURL: {image_url}\nNote: URL expires in 1 hour."

    except Exception as e:
        logger.error("infographic_generation_failed", error=str(e))
        return f"Failed to generate infographic: {str(e)}"