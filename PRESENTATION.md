# FinAdvisor AI — Project Presentation

## SCR Framework (Situation · Complication · Resolution)

---

### Situation

Personal finance is one of the most consequential areas of everyday life, yet access to quality, personalised financial guidance is deeply unequal. In the US, a certified financial planner charges $200–$400 per hour — and that figure is representative of global trends where professional financial advice is accessible only to those who can already afford it. In most of Sub-Saharan Africa, Southeast Asia, and South America, formal financial advisory services barely exist for individuals outside the top income brackets.

At the same time, the technology to bridge this gap has arrived. Large language models can engage in nuanced, contextual financial conversations. LangChain and LangGraph provide the tooling to equip these models with real-time data and structured multi-step workflows. Vector databases enable models to reason over a user's personal documents. The pieces are available — but most people either don't know how to use them or don't have access to a product that assembles them usefully.

---

### Complication

Building a genuinely useful AI financial advisor — not just a chatbot that talks about money — involves several specific and difficult problems:

**1. LLMs hallucinate financial data with confidence.**
Asking a raw LLM "What is Apple's stock price?" may return a number that is months old or entirely fabricated. A user who acts on a wrong price, tax rate, or investment return figure faces real financial consequences. The default behaviour of a helpful LLM is precisely the wrong behaviour in a financial context.

**2. Generic advice is actively unhelpful.**
A person carrying $30,000 in high-interest credit card debt needs completely different advice from someone with a diversified equity portfolio and a three-month emergency fund. A standard chatbot gives the same generic answer to both — often the wrong one. Useful advice requires knowing the user's actual situation.

**3. Users cannot bring their own documents into the conversation.**
People's financial lives are documented: tax returns, pay slips, investment statements, pension documents. A user might want to ask "Based on my last three pay slips, how much should I be putting into savings?" — but without document intelligence, the AI cannot access those files and falls back to generic estimates.

**4. An AI agent that can write to your financial records is a liability without oversight.**
If the agent can add portfolio positions, log expenses, and set price alerts autonomously, it can also make mistakes autonomously. A misheard ticker, a misunderstood instruction, a prompt injection attack — any of these could result in incorrect records that a user has to manually untangle.

**5. Financial advice is inherently high-stakes and regulated.**
Any application in this space must be unambiguous that it is not a licensed advisor, must never fabricate data, must protect user financial data rigorously, and must be honest about what it does and does not know. These constraints cannot be optional features — they must be architectural.

**6. Shallow agents are brittle.**
A two-node graph (planner + tools) means the agent picks tools and executes them — but it has no awareness of what it has already tried, cannot detect failure, and cannot incorporate information from the user's own documents before deciding what to do. Real usefulness requires more architectural depth.

---

### Resolution

FinAdvisor AI resolves each complication through specific architectural and design decisions:

**Resolution 1: Tool-grounded answers eliminate hallucination**

The LangGraph agent is equipped with 36 financial tools that fetch real-time data from Yahoo Finance, CoinGecko, and financial news APIs. The system prompt explicitly forbids the LLM from inventing numbers — all financial figures must come from tool results. If a data source is unavailable (API outage, rate limit), the agent reports the failure explicitly rather than guessing. This makes the agent less likely to give a confident wrong answer than a knowledgeable human who hasn't checked current prices.

**Resolution 2: RAG pipeline grounds answers in the user's own data**

Users can upload personal financial documents (PDFs, Word files, plain text, CSV). These are chunked, embedded using OpenAI's `text-embedding-3-small` (or a free local sentence-transformers model as fallback), and stored in a pgvector database scoped by `user_id`. Before every LLM call, a dedicated RAG node checks whether the query warrants document retrieval, runs cosine similarity search, applies a dual relevance threshold (≥ 0.65 at retrieval, ≥ 0.72 at injection), deduplicates results, and injects the top 5 chunks into the agent's context. The result is an agent that can answer "Based on my tax return, how much should I be saving?" with reference to the actual uploaded document — not a generic estimate.

**Resolution 3: Persistent memory makes advice personal over time**

Short-term memory (LangGraph `MemorySaver` checkpointing) maintains full conversation history within a session — every message is automatically restored when the same session resumes. Long-term memory extracts and stores key facts about the user across sessions in Supabase — risk tolerance, stated financial goals, income level, major concerns — using an LLM-powered extraction pipeline triggered as a background task every 5th message. Facts are scored by importance (1–3) so the most relevant memories are loaded first. On each new session, up to 12 memories are injected into the system prompt, so the agent remembers that this user is saving for a house deposit and is risk-averse, without the user having to re-explain it every time.

**Resolution 4: Human-in-the-Loop makes autonomous action safe**

Using LangGraph's `interrupt_before` mechanism in `human_in_loop.py`, the agent never silently modifies user data. Every write operation — adding a portfolio position, logging an expense, creating or deleting a tax record — pauses the graph and presents the planned action to the user for explicit confirmation via a real-time SSE event. The user sees exactly what the agent intends to do and must confirm or cancel before execution. This makes the system trustworthy even for financially cautious users who would not accept a black-box agent making decisions for them.

**Resolution 5: Ethical constraints are architectural, not optional**

The AI disclaimer, HITL confirmation, data privacy via Supabase RLS, rate limiting, input sanitisation, dual-layer tool filter, and the finance-only system prompt scope are all baked into the architecture. They cannot be disabled by a user or bypassed by a clever prompt. See [ETHICS.md](ETHICS.md) for the full breakdown.

**Resolution 6: A 4-node graph adds real agentic depth**

The graph was extended from 2 nodes to 4: `rag → planner → human_review → tools`. The RAG node runs before the planner on every turn, giving the LLM grounded document context before it decides what to do. The human_review node intercepts sensitive write operations. The agentic scratchpad (`state["scratchpad"]`) logs every tool call with its result, timestamp, and elapsed time — providing full traceability in LangSmith and a structured foundation for adding a self-correction node. The `enabled_tools` bug was fixed: disabled tools are now filtered at execution time (not only at planning time), making tool access control genuinely reliable.

---

## Impact

| Dimension | Details |
|---|---|
| **Accessibility** | Free tier with core tools — no payment required to use stock prices, calculators, budget tracking, or portfolio |
| **Language reach** | 17 languages, including 6 African languages (Amharic, Hausa, Igbo, Luganda, Swahili, Yoruba) typically excluded from fintech |
| **Financial breadth** | 36 tools across market data (4), crypto (2), portfolio (8), calculators (3), budget (3), tax (2), planning (3), news (2), documents (1), data-driven charts (4), PDF/Excel exports (2), AI image generation (2) |
| **Model flexibility** | 4 LLM providers — OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude 3.5 Sonnet), Groq (Llama 3.3 70B, Llama 3.1 8B), Google (Gemini 1.5 Flash, Gemini 1.5 Pro) — no single-vendor lock-in |
| **Observability** | LangSmith tracing for full agent step visibility; agentic scratchpad logged on every turn |
| **Test confidence** | 5 pytest files, all external calls mocked, runs offline in under 30 seconds |
| **Regional payments** | Mono, MTN Mobile Money Uganda, Airtel Money, and Flutterwave integration points for East/West African markets |

---

## SMART Goals

| Goal | S — Specific | M — Measurable | A — Achievable | R — Relevant | T — Time-bound |
|---|---|---|---|---|---|
| Build a working multi-tool AI financial agent | LangGraph 4-node agent (rag → planner → human_review → tools) with 36 tools, RAG, HITL, streaming, scratchpad, and long-term memory | Agent returns grounded tool-sourced answers; streaming chat works end-to-end; HITL fires on write operations | Standard LangGraph + LangChain patterns, well-documented | Core of Case 2 (AI Agent for Task Automation) | ✅ Completed |
| Implement document search (RAG) | Upload → chunk → embed → retrieve → inject pipeline with pgvector (production) and ChromaDB (local fallback); dual relevance threshold; deduplication | RAG retriever returns top-k relevant chunks with score filtering; rag_node is graceful no-op on failure | Standard RAG pattern using LangChain text splitters and OpenAI embeddings | Core of Case 3 (Smart Document Search) | ✅ Completed |
| Support multiple LLM providers | Switch between GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Gemini 1.5 Flash/Pro, and Llama 3.3 70B in real time | Model selector works in UI; all four providers return valid streaming responses; only models with configured API keys are offered | All four SDKs available via LangChain wrappers | Demonstrates LLM API usage and avoids vendor lock-in | ✅ Completed |
| Add HITL for sensitive actions | LangGraph `interrupt_before` pauses on 7 specific write tool calls; frontend shows confirmation dialog; `POST /chat/resume` resumes or cancels | User must confirm before agent executes; rejection acknowledged with cancellation message; no data written on cancel | LangGraph `interrupt_before` is a built-in feature | Ethical AI — prevents autonomous write mistakes | ✅ Completed |
| 17-language support | All UI strings and AI responses in 17 languages including 6 African languages; UGX-first onboarding | Language switcher changes UI and AI response language; all 17 language JSON files complete | Translation JSON files + system prompt language instruction | Financial inclusion — serves underrepresented user populations | ✅ Completed |
| Cover code with offline tests | pytest suite covering agent, auth, RAG, tools with comprehensive mocking | Tests pass with no real API keys; full suite completes in under 30 seconds; `enabled_tools` bug fix verified by test | Standard mocking with `unittest.mock` | Best practice; enables safe iteration | ✅ Completed |
| Fix the enabled_tools execution bug | `tool_executor_node` passes `enabled_tool_ids` to `get_all_tools()` and enforces the filter at execution time, not only at planning time | `test_disabled_tool_not_executed()` in `test_agent.py` verifies the fix | Single-line fix with clear test coverage | Security and correctness — disabled tools must not execute | ✅ Completed |
| Deploy a live working demo | Frontend on Vercel, backend on Render, with a publicly accessible URL | Live demo accessible at the link in the README; `/health` endpoint returns 200 | Both Vercel and Render support the required stack | Completeness — demonstrates the full application works end-to-end | ✅ Completed |