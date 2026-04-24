# Changelog

All notable changes to FinAdvisor AI are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- 16-key time-and-day-aware greeting system across all 17 languages (8 time slots × 7 day-of-week greetings)

---

## [1.2.0] — Phase 12 — Agent Architecture Hardening

### Added
- **4-node LangGraph agent** — graph expanded from 2 nodes (planner + tools) to 4: `rag → planner → human_review → tools`
- **RAG node** (`nodes/rag_node.py`) — fully wired document retrieval before every planner call; keyword-intent detection, user-document cache, relevance-score filtering (≥ 0.72), max 5 chunks injected per turn
- **Human-in-the-Loop (HITL)** (`nodes/human_in_loop.py`) — LangGraph `interrupt_before` gate for all write operations: `add_position`, `remove_position`, `add_expense`, `add_income`, `add_tax_record`, `update_tax_record`, `delete_tax_record`; confirm/cancel flow with SSE `__HITL__` event and `POST /chat/resume` endpoint
- **Long-term memory** (`memory/long_term.py`) — LLM-powered fact extraction from conversation history, Supabase `user_memories` table with importance scoring (1–3), injected into system prompt on session start; triggered every 5th message as background task
- **Short-term memory** (`memory/short_term.py`) — LangGraph `MemorySaver` checkpointer singleton, `get_session_history()`, `clear_session()`, role mapping helpers
- **Agentic scratchpad** — every tool call logged to `state["scratchpad"]` with tool name, args, result, timestamp, `elapsed_ms`, `available` flag; returned in API response and visible in LangSmith traces
- **`reasoning` field** in `AgentState` — `state["reasoning"]` placeholder for future chain-of-thought reasoning node
- **`requires_human_review` field** in `AgentState` — planner can flag a turn for HITL review independently of tool names
- **Chart/file binary payload routing fix** — `stream_agent()` now yields `CHART_BASE64:`, `FILE_BASE64_PDF:`, and `FILE_BASE64_XLSX:` tokens directly from the `tools` node (not lost in planner prose); `_extract_response()` also collects binary parts from `ToolMessage` for the non-streaming path
- **SSE keepalive** — 15-second heartbeat comment (`": keepalive"`) during silent tool execution prevents proxy/Vercel edge timeout
- **Binary payload reordering** — `_stream_response()` moves all binary tokens to the end of `full_response` before `save_message()` so `MessageBubble` extraction is always clean
- **`enabled_tools` bug fix** — `tool_executor_node` now passes `enabled_tool_ids` to `get_all_tools()`, enforcing user tool preferences at execution time (not only at planning time)
- **Comprehensive test suite** (`tests/`) — 5 test files (previously empty), all passing offline with no real API keys:
  - `test_agent.py` — `AgentState` defaults, `should_continue`, `should_require_human_review`, HITL approval/rejection, tool executor bug fix, short-term memory, graph compilation
  - `test_auth.py` — password hashing/verification/strength, JWT access and refresh tokens, token-type enforcement, expiry
  - `test_rag.py` — retriever score filtering, deduplication, result ordering, `rag_node` intent detection, no-op cases, A/B testing, diversity re-ranking
  - `test_tools.py` — ROI, compound interest, DCA, capital gains, tax bracket, document processor, embedding caching, memory importance scoring
  - `conftest.py` — shared fixtures, full env-var patching, no network or DB calls required
- **A/B testing module** (`rag/ab_testing.py`) — compares standard retrieval vs diversity-re-ranked retrieval; stores results in Supabase

### Fixed
- `tool_executor_node` ignoring `enabled_tools` — disabled tools could still execute (see Added)
- Chart and file base64 payloads silently discarded in streaming path — never reached the frontend (see Added)
- SSE connections dropped during long tool execution (yfinance, matplotlib) — keepalive fixes this
- `requires_human_review` in `AgentState` was defined but never read — `should_require_human_review()` now checks it

---

## [1.1.0] — Phase 11 — 2026-03-08

### Added
- **Watchlist page** (`/watchlist`) — monitor any ticker with live price refresh
- **Goals page** (`/goals`) — track financial goals with target amounts, dates, and progress
- **Budget page** (`/budget`) — log income and expenses by category
- **Tax Records page** (`/tax`) — annual income, capital gains, and estimated tax owed
- **Export page** (`/export`) — download portfolio, budget, goals, tax, or watchlist as CSV or JSON
- Forgot password flow (`/forgot-password` + `/reset-password`) with SendGrid primary / SMTP fallback
- Password visibility toggles on all auth forms
- Backend routes: `watchlist.py`, `goals.py`, `budget.py`, `tax.py`, `exports.py`
- Supabase tables for all new features in `SUPABASE_MIGRATION.sql`

### Fixed
- All new pages showing "Loading…" indefinitely — caused by `user["id"]` instead of `user["user_id"]`
- Password reset token never sent — `auth.py` rewritten with SendGrid primary and SMTP fallback
- Sidebar labels not translating — `NAV_GROUPS` moved inside component so `t()` is called reactively
- Settings and Upgrade pages not showing sidebar in loading state
- Alerts page content left-aligned on wide screens — added `margin: '0 auto'`
- Export page showing English strings on language switch — `export.desc*` keys added to all languages
- Upgrade, Alerts, Watchlist pages showing English on language switch — all missing translation keys added to all 17 languages

---

## [1.0.2] — Phase 10 fixes — 2026-03-06

### Fixed
- Language switching falls back to English on second switch — removed conditional check in `setLang()`
- Build failures ("Unterminated regexp literal") — removed orphaned JSX tags, rewrote `ExportCard` component
- Plugins page showing English words on language switch — 32 `pluginTools` translation keys added to all non-English language files
- Auth pages (login, register, forgot-password, reset-password) not translating — all 4 pages rewritten with `useTranslate()`; 48 new auth keys added to all 17 language files

### Changed
- `langStore.js` completely rewritten to use direct ES module imports instead of `fetch()` — eliminates CDN cache race conditions and ensures translations load synchronously on first render

---

## [1.0.1] — Phase 10 — 2026-03-05

### Added
- Voice input on chat page (browser speech recognition)
- File upload support for RAG document context
- Browser push notifications
- Email notifications (market alerts, portfolio summary, weekly digest) via SendGrid
- Mobile responsive layout with collapsible sidebar
- LangSmith tracing integration for AI agent observability
- Rolling rate limits with per-user per-minute and per-hour caps
- Temperature and top-p sliders for AI response tuning
- Regenerate last response button
- Feedback thumbs up/down on AI messages (thumbs-down saved as long-term memory to avoid similar responses)
- Auto-title generation for new chat sessions (GPT-4o-mini generates a 3–5 word title as a background task)
- Context-aware suggested follow-up questions after each AI response

### Fixed
- Sub-components outside main component using `t()` without scope — every sub-component now calls `const t = useTranslate()` itself
- New pages (Watchlist, Goals, Budget, Tax, Export) missing sidebar — all restructured to use sticky header pattern

---

## [1.0.0] — Phase 9 — 2026-03-03

### Added
- **Billing page** (`/billing`) — Stripe integration with monthly and yearly Pro plans
- **Alerts page** (`/alerts`) — price alert creation, auto-check every 5 minutes via APScheduler
- **Plugins page** (`/plugins`) — 36 AI tool plugins, individually enable/disable (later consolidated into Settings)
- **Analytics page** (`/analytics`) — usage stats, message counts, model breakdown
- **Onboarding flow** (`/onboarding`) — 4-step wizard: welcome, profile (name + currency), financial goals, done; UGX-first currency list
- Google OAuth and GitHub OAuth login
- Stripe checkout and webhook handling with signature verification
- Pro vs Free tier enforcement on AI model selection

### Fixed
- Portfolio page showing stale prices — added manual refresh button and 30-second auto-refresh

---

## [0.9.0] — Phase 8 — 2026-03-02

### Added
- **Portfolio page** (`/portfolio`) — real positions, live prices via yfinance, P&L calculation
- Market data endpoints (`/market/price/{ticker}`, `/market/overview`, `/market/search`)
- Asset type breakdown (stocks, crypto, ETFs)
- Add/remove positions with ticker, shares, and average price
- **36 financial tools** — market (4), crypto (2), portfolio (8), calculators (3), budget (3), tax (2), planning (3), news (2), documents (1), data-driven charts (4), exports (2), AI image generation (2)
- Data-driven chart tools using matplotlib: `generate_bar_chart`, `generate_line_chart`, `generate_pie_chart`, `generate_portfolio_chart` — no API key required
- PDF report tool (`generate_pdf_report`) and Excel export tool (`generate_excel_report`)
- AI image generation tools (`generate_chart_image`, `generate_financial_infographic`) via DALL-E 3

### Fixed
- Crypto tickers requiring `-USD` suffix for yfinance compatibility (e.g., `BTC-USD`)

---

## [0.8.0] — Phase 7 — 2026-02-27

### Added
- **17-language support** — EN, FR, ES, PT, DE, SW, YO, HA, IG, AM, AR, ZH, HI, JA, KO, RU, LG (Luganda)
- `langStore.js` — Zustand store for language switching with direct ES module imports
- Language selector in Settings page
- All UI strings translated across all 17 languages
- Chat greeting keys: `goodMorning`, `goodAfternoon`, `goodEvening`
- **Settings page** (`/settings`) — profile, preferred name, theme, AI model, language, currency, notifications, memory management, danger zone
- Light / dark theme toggle with `themeStore.js`
- 4 supported LLM providers: OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude 3.5 Sonnet), Groq (Llama 3.3 70B, Llama 3.1 8B), Google (Gemini 1.5 Flash, Gemini 1.5 Pro)

---

## [0.7.0] — Phase 6 — 2026-02-26

### Added
- Full frontend application with Next.js 16 App Router
- Sidebar navigation with collapse and mobile drawer support
- Chat page (`/chat`) with streaming AI responses (SSE), suggested prompts, and session history
- Login and Register pages with JWT auth
- `authStore.js` and `chatStore.js` Zustand stores with localStorage persistence
- `MessageBubble.js` — full rendering pipeline: normalise → extract binary payloads (charts, files, remote images) → strip tokens → render markdown → display cards with download buttons
- `ChatInput.js`, `HelpGuide.js`, `Sidebar.js`, `PageShell.js` components

---

## [0.5.0] — Phase 5 — 2026-02-26

### Added
- LangGraph agent with tool-calling capability
- Streaming chat endpoint (`POST /chat/send`) with Server-Sent Events
- Document upload and RAG retrieval pipeline (pgvector embeddings)
- Per-user plugin enable/disable stored in Supabase
- RAG pipeline: `document_processor.py`, `embeddings.py` (OpenAI + local sentence-transformers fallback), `vector_store.py` (pgvector + ChromaDB fallback), `retriever.py`

---

## [0.3.0] — Phase 3 — 2026-02-26

### Added
- FastAPI backend with full project structure
- JWT authentication with access tokens (30 min) and refresh tokens (7 days)
- Supabase integration with lazy client initialization and `get_supabase_safe()` for graceful failure
- All auth endpoints: register, login, refresh, `/me`, logout, OAuth, forgot-password, reset-password, change-password
- Structlog structured JSON logging
- Pydantic settings with `.env` support and `SECRET_KEY` length validation
- SlowAPI rate limiting (per-minute and per-hour caps)
- CORS restricted to configured origins
- APScheduler background jobs (price alerts)
- MCP server skeleton (`src/mcp/`) for external AI client integration
- Banking integrations config: Mono (African bank connections), MTN Mobile Money Uganda, Airtel Money, Flutterwave

---

## [0.1.0] — Phase 1 & 2 — 2026-02-25

### Added
- Initial project setup
- Repository structure
- Supabase project and database schema (`schemas.sql`)
- Backend virtual environment and `requirements.txt` / `pyproject.toml`
- Frontend Next.js project scaffolding