# FinAdvisor AI — Project Presentation

## SCR Framework (Situation · Complication · Resolution)

---

### Situation

Personal finance is one of the most consequential areas of everyday life, yet access to quality, personalised financial guidance is deeply unequal. In the US, a certified financial planner charges $200–$400 per hour — and that figure is representative of global trends where professional financial advice is accessible only to those who can already afford it. In most of Sub-Saharan Africa, Southeast Asia, and South America, formal financial advisory services barely exist for individuals outside the top income brackets.

At the same time, the technology to bridge this gap has arrived. Large language models can engage in nuanced, contextual financial conversations. LangChain and LangGraph provide the tooling to equip these models with real-time data and structured workflows. Vector databases enable models to reason over a user's personal documents. The pieces are available — but most people either don't know how to use them or don't have access to a product that assembles them usefully.

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

---

### Resolution

FinAdvisor AI resolves each complication through specific architectural and design decisions:

**Resolution 1: Tool-grounded answers eliminate hallucination**

The LangGraph agent is equipped with 32 financial tools that fetch real-time data from Yahoo Finance, CoinGecko, and financial news APIs. The system prompt explicitly forbids the LLM from inventing numbers — all financial figures must come from tool results. If a data source is unavailable (API outage, rate limit), the agent reports the failure explicitly rather than guessing. This makes the agent less likely to give a confident wrong answer than a knowledgeable human who hasn't checked current prices.

**Resolution 2: RAG pipeline grounds answers in the user's own data**

Users can upload personal financial documents (PDFs, Word files, plain text). These are chunked, embedded using OpenAI's `text-embedding-3-small`, and stored in a pgvector database scoped to the user's account. Before every response, a dedicated RAG node retrieves the most relevant document passages using cosine similarity and injects them into the agent's context. The result is an agent that can answer questions like "Based on my tax return, how much should I be saving?" with reference to the actual document — not a generic estimate.

**Resolution 3: Persistent memory makes advice personal over time**

Short-term memory (LangGraph `MemorySaver` checkpointing) maintains full conversation history within a session. Long-term memory extracts and stores key facts about the user across sessions in Supabase — risk tolerance, stated financial goals, income level, major concerns. On each new session, these memories are injected into the system prompt, so the agent remembers that this user is saving for a house deposit and is risk-averse, without the user having to re-explain it every time.

**Resolution 4: Human-in-the-Loop makes autonomous action safe**

Using LangGraph's `interrupt_before` mechanism, the agent never silently modifies user data. Every write operation — adding a portfolio position, logging an expense, creating a price alert — pauses the graph and presents the planned action to the user for explicit confirmation. The agent explains what it intends to do and waits. This makes the system trustworthy even for financially cautious users who would not accept a black-box agent making decisions for them.

**Resolution 5: Ethical constraints are architectural, not optional**

The AI disclaimer, HITL confirmation, data privacy via Supabase RLS, rate limiting, input sanitisation, tool-only data policy, and the finance-only system prompt scope are all baked into the architecture. They cannot be disabled by a user or bypassed by a clever prompt. See [ETHICS.md](ETHICS.md) for the full breakdown.

---

## Impact

| Dimension | Details |
|---|---|
| **Accessibility** | Free tier with core tools — no payment required to use stock prices, calculators, budget tracking, or portfolio |
| **Language reach** | 20 languages, including 6 African languages (Amharic, Hausa, Igbo, Luganda, Swahili, Yoruba) typically excluded from fintech |
| **Financial breadth** | 32 tools across market data, crypto, portfolio, budgeting, tax, planning, news, documents, and image generation |
| **Model flexibility** | 4 LLM providers (OpenAI, Anthropic, Google, Groq) — no single-vendor lock-in |
| **Observability** | LangSmith tracing for full agent step visibility |
| **Test confidence** | 5 pytest files, all external calls mocked, runs offline in under 30 seconds |

---

## SMART Goals

| Goal | S — Specific | M — Measurable | A — Achievable | R — Relevant | T — Time-bound |
|---|---|---|---|---|---|
| Build a working multi-tool AI financial agent | LangGraph agent with 32 tools, RAG, HITL, and streaming | Agent returns grounded tool-sourced answers; streaming chat works end-to-end | Standard LangGraph + LangChain patterns, well-documented | Core of Case 2 (AI Agent for Task Automation) | ✅ Completed |
| Implement document search (RAG) | Upload → chunk → embed → retrieve → inject pipeline with pgvector | RAG retriever returns top-k relevant chunks with score filtering | Standard RAG pattern using LangChain document loaders and OpenAI embeddings | Core of Case 3 (Smart Document Search) | ✅ Completed |
| Support multiple LLM providers | Switch between GPT-4o, Claude 3.5, Gemini 1.5, and Groq Llama in real time | Model selector works in UI; all four providers return valid streaming responses | All four SDKs available via LangChain wrappers | Demonstrates LLM API usage | ✅ Completed |
| Add HITL for sensitive actions | LangGraph `interrupt_before` pauses on all write tool calls | User must confirm before agent executes; rejection is logged and acknowledged | LangGraph `interrupt_before` is a built-in feature | Ethical AI — prevents autonomous write mistakes | ✅ Completed |
| 20-language support | All UI strings and AI responses in 20 languages including 6 African languages | Language switcher changes UI and AI response language | Translation JSON files + system prompt language instruction | Financial inclusion — serves underrepresented user populations | ✅ Completed |
| Cover code with offline tests | pytest suite covering agent, auth, RAG, tools, and image generation | Tests pass with no real API keys; full suite completes in under 30 seconds | Standard mocking with `unittest.mock` | Best practice; enables safe iteration | ✅ Completed |
| Deploy a live working demo | Frontend on Vercel, backend on Railway, with a publicly accessible URL | Live demo accessible at the link in the README | Both Vercel and Railway support the required stack | Completeness — demonstrates the full application works end-to-end | ✅ Completed |