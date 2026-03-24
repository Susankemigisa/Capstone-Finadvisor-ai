"""
Tests for image generation tools (generate_chart_image, generate_financial_infographic).

All external calls are mocked — no real API key or network needed.

Root cause of original failures:
    The original image_tools.py imported openai INSIDE the function body
    (inside a try: block), so `openai` was never a module-level attribute.
    patch("src.tools.image_tools.openai") raised AttributeError because
    there was nothing to patch at that path.

Fix applied to image_tools.py:
    `import openai` and `from src.config.settings import settings` are now
    at the top of the module, making them patchable as module-level names.

Fix applied to these tests:
    - patch targets updated to match top-level imports
    - openai error classes patched via `unittest.mock.patch` on the real
      openai module paths, not via mock_openai.SomeError (which creates
      new MagicMock subclasses that don't match isinstance checks)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────

def _make_fake_image_response(url: str = "https://oaidalleapiprodscus.blob.core.windows.net/fake/image.png"):
    """Build a minimal fake openai image response object."""
    fake_image = MagicMock()
    fake_image.url = url
    response = MagicMock()
    response.data = [fake_image]
    return response


# ── generate_chart_image ──────────────────────────────────────

class TestGenerateChartImage:

    def test_returns_url_on_success(self):
        """Happy path — valid key, DALL-E responds with a URL."""
        from src.tools.image_tools import generate_chart_image

        fake_response = _make_fake_image_response()
        mock_client = MagicMock()
        mock_client.images.generate.return_value = fake_response

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client

            result = generate_chart_image.invoke({
                "chart_type": "pie",
                "title": "My Portfolio",
                "description": "50% stocks, 50% bonds",
            })

        assert "URL:" in result
        assert "oaidalleapiprodscus" in result
        assert "expires in 1 hour" in result

    def test_missing_api_key_returns_friendly_message(self):
        """No OPENAI_API_KEY — must return a readable string, not raise."""
        from src.tools.image_tools import generate_chart_image

        with patch("src.tools.image_tools.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""

            result = generate_chart_image.invoke({
                "chart_type": "bar",
                "title": "Revenue",
                "description": "Q1 to Q4 revenue",
            })

        assert "OPENAI_API_KEY" in result or "OpenAI API key" in result
        assert "URL:" not in result

    def test_invalid_size_is_normalised(self):
        """An unsupported size must silently fall back to 1024x1024."""
        from src.tools.image_tools import generate_chart_image

        fake_response = _make_fake_image_response()
        captured = {}

        def capture_generate(**kwargs):
            captured["size"] = kwargs.get("size")
            return fake_response

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = capture_generate

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client

            generate_chart_image.invoke({
                "chart_type": "line",
                "title": "Stock History",
                "description": "AAPL over 1 year",
                "size": "9999x9999",  # invalid
            })

        assert captured["size"] == "1024x1024"

    def test_authentication_error_returns_friendly_message(self):
        """openai.AuthenticationError must be caught and returned as a string."""
        import openai as real_openai
        from src.tools.image_tools import generate_chart_image

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = real_openai.AuthenticationError(
            message="invalid api key",
            response=MagicMock(status_code=401, headers={}),
            body={},
        )

        with patch("src.tools.image_tools.openai", real_openai), \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-bad-key"

            with patch("openai.OpenAI", return_value=mock_client):
                result = generate_chart_image.invoke({
                    "chart_type": "bar",
                    "title": "Test",
                    "description": "test",
                })

        assert isinstance(result, str)
        assert "Invalid OpenAI API key" in result or "❌" in result

    def test_rate_limit_error_returns_friendly_message(self):
        """openai.RateLimitError must be caught and returned as a string."""
        import openai as real_openai
        from src.tools.image_tools import generate_chart_image

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = real_openai.RateLimitError(
            message="rate limited",
            response=MagicMock(status_code=429, headers={}),
            body={},
        )

        with patch("src.tools.image_tools.openai", real_openai), \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"

            with patch("openai.OpenAI", return_value=mock_client):
                result = generate_chart_image.invoke({
                    "chart_type": "pie",
                    "title": "Test",
                    "description": "test",
                })

        assert isinstance(result, str)
        assert "rate limit" in result.lower() or "❌" in result

    def test_unexpected_exception_returns_string_not_raises(self):
        """Any unexpected exception must not bubble up — must return an error string."""
        from src.tools.image_tools import generate_chart_image

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = RuntimeError("unexpected network failure")

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client
            # Make openai error classes not match the RuntimeError
            mock_openai.AuthenticationError = type("AuthenticationError", (Exception,), {})
            mock_openai.RateLimitError = type("RateLimitError", (Exception,), {})
            mock_openai.BadRequestError = type("BadRequestError", (Exception,), {})

            result = generate_chart_image.invoke({
                "chart_type": "bar",
                "title": "Test",
                "description": "test",
            })

        assert isinstance(result, str)
        assert "Failed" in result or "❌" in result


# ── generate_financial_infographic ───────────────────────────

class TestGenerateFinancialInfographic:

    def test_returns_url_on_success(self):
        """Happy path — valid key, DALL-E responds with a URL."""
        from src.tools.image_tools import generate_financial_infographic

        fake_response = _make_fake_image_response()
        mock_client = MagicMock()
        mock_client.images.generate.return_value = fake_response

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client

            result = generate_financial_infographic.invoke({
                "topic": "compound interest",
                "key_points": "starts small, grows exponentially, time is key",
            })

        assert "URL:" in result
        assert "expires in 1 hour" in result

    def test_missing_api_key_returns_friendly_message(self):
        """No OPENAI_API_KEY — must return a readable string, not raise."""
        from src.tools.image_tools import generate_financial_infographic

        with patch("src.tools.image_tools.settings") as mock_settings:
            mock_settings.OPENAI_API_KEY = ""

            result = generate_financial_infographic.invoke({
                "topic": "debt snowball",
                "key_points": "list smallest debt first, pay minimums on rest",
            })

        assert "OPENAI_API_KEY" in result or "OpenAI API key" in result
        assert "URL:" not in result

    def test_invalid_style_is_normalised(self):
        """An unsupported style must silently fall back to 'modern'."""
        from src.tools.image_tools import generate_financial_infographic

        fake_response = _make_fake_image_response()
        captured = {}

        def capture_generate(**kwargs):
            captured["prompt"] = kwargs.get("prompt", "")
            return fake_response

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = capture_generate

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client

            generate_financial_infographic.invoke({
                "topic": "investing",
                "key_points": "diversify",
                "style": "neon_cyberpunk",  # invalid — must fall back to modern
            })

        assert "modern" in captured["prompt"]

    def test_content_policy_error_returns_friendly_message(self):
        """openai.BadRequestError (content policy) must be caught gracefully."""
        import openai as real_openai
        from src.tools.image_tools import generate_financial_infographic

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = real_openai.BadRequestError(
            message="content policy violation",
            response=MagicMock(status_code=400, headers={}),
            body={},
        )

        with patch("src.tools.image_tools.openai", real_openai), \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"

            with patch("openai.OpenAI", return_value=mock_client):
                result = generate_financial_infographic.invoke({
                    "topic": "test topic",
                    "key_points": "key point",
                })

        assert isinstance(result, str)
        assert "content policy" in result.lower() or "❌" in result

    def test_unexpected_exception_returns_string_not_raises(self):
        """Any unexpected exception must not bubble up."""
        from src.tools.image_tools import generate_financial_infographic

        mock_client = MagicMock()
        mock_client.images.generate.side_effect = ConnectionError("network down")

        with patch("src.tools.image_tools.openai") as mock_openai, \
             patch("src.tools.image_tools.settings") as mock_settings:

            mock_settings.OPENAI_API_KEY = "sk-fake-key"
            mock_openai.OpenAI.return_value = mock_client
            mock_openai.AuthenticationError = type("AuthenticationError", (Exception,), {})
            mock_openai.RateLimitError = type("RateLimitError", (Exception,), {})
            mock_openai.BadRequestError = type("BadRequestError", (Exception,), {})

            result = generate_financial_infographic.invoke({
                "topic": "test",
                "key_points": "test",
            })

        assert isinstance(result, str)
        assert "Failed" in result or "❌" in result


# ── Tool registry checks ──────────────────────────────────────

class TestToolRegistry:

    def test_generate_financial_infographic_is_default_enabled(self):
        """generate_financial_infographic must be default=True in TOOL_REGISTRY."""
        from src.tools import TOOL_REGISTRY
        tool = next((t for t in TOOL_REGISTRY if t["id"] == "generate_financial_infographic"), None)
        assert tool is not None, "generate_financial_infographic missing from TOOL_REGISTRY"
        assert tool["default"] is True, "generate_financial_infographic should be default=True"

    def test_generate_chart_image_is_default_enabled(self):
        """generate_chart_image must be default=True in TOOL_REGISTRY."""
        from src.tools import TOOL_REGISTRY
        tool = next((t for t in TOOL_REGISTRY if t["id"] == "generate_chart_image"), None)
        assert tool is not None, "generate_chart_image missing from TOOL_REGISTRY"
        assert tool["default"] is True

    def test_both_image_tool_ids_in_default_set(self):
        """Both image tool IDs must appear in the default-enabled set."""
        from src.tools import TOOL_REGISTRY
        default_ids = {t["id"] for t in TOOL_REGISTRY if t["default"]}
        assert "generate_chart_image" in default_ids
        assert "generate_financial_infographic" in default_ids