#!/usr/bin/env python3
"""
test_agent.py — Run this locally to diagnose the blank response issue.

Usage (from backend folder):
    python test_agent.py

It tests:
  1. Can all tools import without errors?
  2. Can the LLM be loaded with your API keys?
  3. Does a simple "what is 2+2" message produce a response?
  4. Does a crypto price request work end-to-end?

Requirements: your .env must be filled in with real API keys.
"""

import asyncio
import os
import sys
import traceback

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ .env loaded")
except Exception as e:
    print(f"⚠️  Could not load .env: {e}")

# ── Test 1: Tool imports ───────────────────────────────────────────────────────
print("\n── Test 1: Tool imports ─────────────────────────────────────")
try:
    from src.tools import get_all_tools
    tools = get_all_tools()
    print(f"✅ {len(tools)} tools loaded successfully")
    print(f"   First 5: {[t.name for t in tools[:5]]}")
except Exception as e:
    print(f"❌ Tool import FAILED: {e}")
    traceback.print_exc()

# ── Test 2: HTTP client ────────────────────────────────────────────────────────
print("\n── Test 2: HTTP client startup ──────────────────────────────")
async def test_http():
    try:
        from src.utils.http_client import startup_http_client, get_http_client
        await startup_http_client()
        client = get_http_client()
        resp = await client.get("https://httpbin.org/get", timeout=5)
        print(f"✅ HTTP client works — status {resp.status_code}")
    except Exception as e:
        print(f"❌ HTTP client FAILED: {e}")
        traceback.print_exc()

asyncio.run(test_http())

# ── Test 3: LLM model load ────────────────────────────────────────────────────
print("\n── Test 3: LLM model load ───────────────────────────────────")
model_to_test = os.getenv("DEFAULT_MODEL", "llama-3.3-70b-versatile")
print(f"   Testing model: {model_to_test}")
try:
    from src.agent.models import get_model
    llm = get_model(model_to_test)
    print(f"✅ Model '{model_to_test}' loaded")
except Exception as e:
    print(f"❌ Model load FAILED: {e}")
    traceback.print_exc()
    print("\n   → Check your API key env vars:")
    print(f"     OPENAI_API_KEY    = {'SET' if os.getenv('OPENAI_API_KEY') else 'MISSING ❌'}")
    print(f"     GROQ_API_KEY      = {'SET' if os.getenv('GROQ_API_KEY') else 'MISSING ❌'}")
    print(f"     GOOGLE_API_KEY    = {'SET' if os.getenv('GOOGLE_API_KEY') else 'MISSING ❌'}")
    print(f"     ANTHROPIC_API_KEY = {'SET' if os.getenv('ANTHROPIC_API_KEY') else 'MISSING ❌'}")

# ── Test 4: Simple agent message ──────────────────────────────────────────────
print("\n── Test 4: Simple agent response (no tools) ─────────────────")
async def test_agent_simple():
    try:
        from src.utils.http_client import startup_http_client
        await startup_http_client()

        from src.agent.graph import stream_agent
        chunks = []
        async for chunk in stream_agent(
            user_message="What is 2 + 2? Reply in one sentence.",
            user_id="test-user",
            session_id="test-session",
            model_id=model_to_test,
        ):
            chunks.append(chunk)
            print(f"   chunk: {repr(chunk[:80])}")

        full = "".join(chunks)
        if full.strip():
            print(f"✅ Agent responded: {full[:200]}")
        else:
            print("❌ Agent returned EMPTY response — this is the blank chat bug")
    except Exception as e:
        print(f"❌ Agent stream FAILED: {e}")
        traceback.print_exc()

asyncio.run(test_agent_simple())

# ── Test 5: Crypto price tool ─────────────────────────────────────────────────
print("\n── Test 5: Crypto price tool (async httpx) ──────────────────")
async def test_crypto():
    try:
        from src.utils.http_client import startup_http_client
        await startup_http_client()

        from src.tools.crypto_tools import get_crypto_price
        result = await get_crypto_price.ainvoke({"symbol": "BTC"})
        if result and "price" in result.lower() or "$" in result:
            print(f"✅ Crypto tool works: {result[:100]}")
        else:
            print(f"⚠️  Crypto tool returned unexpected: {result[:200]}")
    except Exception as e:
        print(f"❌ Crypto tool FAILED: {e}")
        traceback.print_exc()

asyncio.run(test_crypto())

print("\n── Summary ──────────────────────────────────────────────────")
print("Run this script and paste the output here.")
print("The ❌ lines will tell us exactly what's broken.")
