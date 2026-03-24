<div align="center">

# 💎 FinAdvisor AI

### Your intelligent AI companion for financial insights and investment guidance

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=flat-square&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square&logo=python)
![LangChain](https://img.shields.io/badge/LangChain-0.1%2B-1C3C3C?style=flat-square)
![LangGraph](https://img.shields.io/badge/LangGraph-0.2%2B-2D6A4F?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)
![Languages](https://img.shields.io/badge/Languages-20-blue?style=flat-square)

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Demo](https://finadvisor-ai-app-two.vercel.app) • [Contributing](CONTRIBUTING.md)

---

</div>

## 📋 Table of Contents

- [Capstone Project Summary](#-capstone-project-summary)
- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [AI Agent & LangGraph Architecture](#-ai-agent--langgraph-architecture)
- [RAG Pipeline](#-rag-pipeline)
- [Prompt Engineering](#-prompt-engineering)
- [Project Structure](#-project-structure)
- [Pages & Routes](#-pages--routes)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Database Setup](#-database-setup)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Internationalization](#-internationalization)
- [AI Models](#-ai-models)
- [Plugins System](#-plugins-system)
- [Testing](#-testing)
- [Ethical Considerations](#-ethical-considerations)
- [Evaluation Against Capstone Criteria](#-evaluation-against-capstone-criteria)
- [Known Limitations](#-known-limitations)
- [Contributing](#-contributing)
- [Security](#-security)
- [License](#-license)

---

## 🎓 Capstone Project Summary

> **AI Engineering Capstone — Case 2 (AI Agent for Task Automation) + Case 3 (Smart Document Search System)**

**FinAdvisor AI** is a full-stack AI-powered personal finance advisor built for the AI Engineering Capstone project. It addresses a real and widespread problem: access to quality, personalised financial guidance is deeply unequal. Certified financial planners are expensive and inaccessible to most people, while generic online tools do not account for a user's actual portfolio, income, goals, or personal documents.

FinAdvisor AI solves this by deploying a **LangGraph-powered AI agent** equipped with **32 specialised financial tools**, a **Retrieval-Augmented Generation (RAG) pipeline** for analysing the user's own uploaded financial documents, and **real-time market data** — all accessible through a conversational streaming chat interface. A user can ask *"Based on my last tax return, how much should I be saving each month?"* and the system will retrieve their document, fetch current data, run the appropriate calculations, and respond with a grounded, personalised answer — while always reminding the user it is an AI and not a licensed financial advisor.

The project implements **Case 2 (AI Agent for Task Automation)** as its primary case, with substantial overlap into **Case 3 (Smart Document Search)** through the full RAG pipeline and semantic document retrieval system. See [PRESENTATION.md](PRESENTATION.md) for the full SCR analysis and SMART goals, and [ETHICS.md](ETHICS.md) for the ethical considerations breakdown.

---

## 🌟 Overview

FinAdvisor AI is a full-stack AI-powered financial advisor application. It combines real-time market data, multi-model AI chat, portfolio tracking, budgeting, tax records, watchlists, financial goals, and price alerts — all in one platform with 20-language support.

**Live Demo:** https://finadvisor-ai-app-two.vercel.app
**API:** https://finadvisor-ai-production-c72b.up.railway.app
**API Docs:** https://finadvisor-ai-production-c72b.up.railway.app/docs *(requires DEBUG=true)*

> ⚠️ FinAdvisor AI is for informational purposes only and is not a licensed financial advisor. Always consult a qualified professional for major financial decisions.

---

## ✨ Features

### 🤖 AI Chat — Finance Only
- Multi-model support: GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama 3.3 70B (Groq)
- Streaming responses with real-time token output via Server-Sent Events
- **Strictly scoped** — refuses non-financial questions by design
- Persistent chat sessions with full conversation history
- Suggested prompts for quick starts
- Smart time-and-day-aware greetings in 20 languages
- Voice input and file upload (RAG document context)
- Preferred name — the AI addresses you how you want
- **Human-in-the-Loop (HITL)** — the agent pauses for user confirmation before executing sensitive actions

### 📈 Financial Tools (32 total across 10 categories)

| Category | Tools |
|----------|-------|
| **Market** | Real-time stock prices, historical data, ticker search, market overview |
| **Crypto** | Live crypto prices (CoinGecko), historical crypto data |
| **Portfolio** | Add/remove positions, P&L tracking, allocation %, diversification score, rebalancing advisor, risk score, top performer |
| **Calculator** | ROI, compound interest, dollar-cost averaging |
| **Budget** | Log income/expenses, monthly budget summary |
| **Tax** | Capital gains estimator, tax bracket lookup |
| **Planning** | Retirement calculator, emergency fund calculator, debt payoff (snowball/avalanche) |
| **News** | Market-wide news, per-stock news |
| **Documents** | Semantic search across uploaded personal financial documents (RAG) |
| **Images** | AI chart generation, financial infographic generation (DALL-E 3) |

### 🧠 Platform Features

| Feature | Description |
|---------|-------------|
| **Portfolio** | Track positions with live P&L via yfinance |
| **Watchlist** | Monitor any ticker (stocks, crypto, ETFs) with live price refresh |
| **Goals** | Set financial goals with target amounts, deadlines, and progress tracking |
| **Budget** | Log income and expenses by category |
| **Tax Records** | Track annual income, capital gains, and estimated tax owed |
| **Analytics** | Usage stats, message counts, AI model breakdown |
| **Export** | Download any section as CSV or JSON |
| **Price Alerts** | Threshold-based alerts, auto-checked every 5 minutes via APScheduler |

### 🌍 Platform
- 20-language UI and AI responses (including Amharic, Hausa, Igbo, Luganda, Swahili, Yoruba)
- Light / Dark theme with instant toggle
- Google and GitHub OAuth login
- Email + password auth with forgot/reset password flow
- Free and Pro tiers via Stripe subscriptions
- Push and email notifications via SendGrid
- LangSmith tracing integration for agent observability
- Fully responsive — mobile, tablet, and desktop

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Zustand |
| Backend | FastAPI (Python 3.12), Uvicorn |
| Agent Framework | LangChain + LangGraph (StateGraph) |
| LLM Providers | OpenAI, Anthropic, Google Gemini, Groq |
| RAG | LangChain document loaders, OpenAI embeddings, pgvector / ChromaDB |
| Market Data | yfinance, CoinGecko API |
| Database | Supabase (PostgreSQL + pgvector) |
| Payments | Stripe (subscriptions + webhooks) |
| Email | SendGrid / SMTP fallback |
| Image Generation | OpenAI DALL-E 3 |
| Observability | LangSmith |
| Scheduling | APScheduler (price alert background job) |
| Hosting | Vercel (frontend) + Railway (backend) |

---

## 🤖 AI Agent & LangGraph Architecture

The core of FinAdvisor AI is a **LangGraph StateGraph** agent that orchestrates every chat turn. Rather than a simple prompt → response loop, each message passes through a structured pipeline of nodes:

```
START
  │
  ▼
┌─────────────┐
│   RAG Node  │  ← Retrieves relevant chunks from the user's uploaded documents
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Planner   │  ← LLM call: decides what to say or which tools to call (ReAct)
└──────┬──────┘
       │
       ├── needs confirmation? ──→ ┌──────────────────┐
       │                           │  Human Review    │  ← HITL interrupt (user must confirm)
       │                           └────────┬─────────┘
       │                                    │
       ├── tools needed? ──────────────────→ ┌──────────────┐
       │                                     │  Tool Node   │  ← Executes enabled tools only
       │                                     └──────┬───────┘
       │◄────────────────────────────────────────────┘
       │  (loops back to planner with tool results)
       ▼
      END
```

**Key design decisions:**

- **RAG runs first on every turn** — before the LLM is called, the RAG node checks whether the question is relevant to any uploaded document and injects matching chunks into context. This is a near-zero-cost no-op when no documents are present.
- **ReAct planning loop** — the planner LLM decides whether to respond directly or call tools. After tools execute, the planner is called again with results to formulate the final answer.
- **HITL interrupt** — using LangGraph's `interrupt_before` mechanism, the graph pauses before any state-changing tool call. The user sees exactly what the agent plans to do and must explicitly confirm. Rejection is logged and the agent explains what was attempted.
- **Enabled-tools enforcement** — the tool executor node respects the user's plugin preferences. A disabled tool cannot be executed, even if the LLM requests it — preventing crafted tool call IDs from bypassing user preferences.
- **Short-term memory** — conversation history is persisted within a session via LangGraph's `MemorySaver` checkpointer.
- **Long-term memory** — key facts about the user (risk tolerance, stated goals, financial situation) are extracted and stored in Supabase across sessions, making the agent progressively more personalised.

---

## 📚 RAG Pipeline

The Retrieval-Augmented Generation pipeline allows users to upload personal financial documents and ask questions about them directly in chat.

```
Upload → Process → Chunk → Embed → Store → Retrieve → Inject → Answer
```

1. **Document ingestion** — Users upload PDFs, Word documents (`.docx`), or plain text files. The document processor extracts text using `pypdf` and `python-docx`, enforcing a 20 MB file size limit and rejecting unsupported formats.

2. **Chunking** — Documents are split into overlapping chunks using LangChain's `RecursiveCharacterTextSplitter`. Chunk size and overlap are tuned to balance context preservation with retrieval precision.

3. **Embedding** — Each chunk is embedded using OpenAI's `text-embedding-3-small`. The embedding module implements batch caching to avoid re-embedding identical content.

4. **Storage** — Embeddings are stored in **pgvector** (Supabase PostgreSQL with the vector extension) when `DATABASE_URL` is configured, with **ChromaDB** as a local fallback for development.

5. **Retrieval** — On each turn, the RAG node performs cosine similarity search against the current user's document store. A score threshold filters out low-relevance results.

6. **Injection** — Retrieved chunks are formatted and injected into the planner's context as a `## Relevant Document Context` section, scoped strictly to the current user's documents.

7. **A/B testing** — `src/rag/ab_testing.py` provides a framework for comparing retrieval strategies (different chunk sizes, embedding models, top-k values) to continuously improve retrieval quality.

---

## ✍️ Prompt Engineering

FinAdvisor AI uses a **Jinja2-templated system prompt** (`src/agent/nodes/prompts/system_prompt.json`) that is dynamically assembled on each turn with user-specific context.

### Dynamic Context Injection

| Variable | Source | Purpose |
|----------|--------|---------|
| `user_name` | Supabase users table | Personalised address |
| `preferred_currency` | User settings | All monetary values in user's currency |
| `tier` | Subscription status | Adjusts available models and features |
| `portfolio_summary` | Live portfolio query | Agent knows the user's actual holdings |
| `memories` | Long-term memory store | Facts from past conversations |
| `current_date` | Server time | Agent knows today's date for time-sensitive advice |

### Techniques Used

**1. Role and persona definition** — A clear persona (warm, professional, emoji-aware) with explicit expertise domains reduces off-topic hallucination.

**2. Tool descriptions in the prompt** — Every enabled tool is listed with a one-line description, priming the LLM to use tools proactively rather than guessing answers.

**3. Explicit behavioural rules** — A `## Conversation Rules` section handles greetings, finance questions, off-topic questions, and grey-area topics with concrete example responses for each case.

**4. Hard prohibitions** — Explicit negatives prevent the default LLM helpfulness from producing fabricated financial data:
```
"Never fabricate stock prices or financial data — always use tools"
"Never guarantee investment returns"
```

**5. Grey-area lean** — Rather than refusing ambiguous questions, the agent is instructed to lean toward answering when there is any financial angle (GDP, salary negotiation, cost of living), preventing an overly restrictive assistant.

**6. Separate RAG prompt** — The RAG node uses a distinct prompt template (`rag_prompt.json`) that instructs the model how to use retrieved document context, including citing the source document and acknowledging when the document does not answer the question.

---

## 📁 Project Structure

```
finadvisor-ai/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/           # login, register, forgot/reset password
│   │   │   ├── chat/             # AI chat interface
│   │   │   ├── portfolio/        # investment positions & P&L
│   │   │   ├── analytics/        # usage stats
│   │   │   ├── watchlist/        # live ticker monitoring
│   │   │   ├── goals/            # financial goal tracking
│   │   │   ├── budget/           # income & expense logging
│   │   │   ├── tax/              # tax records
│   │   │   ├── export/           # data export (CSV/JSON)
│   │   │   ├── alerts/           # price alerts
│   │   │   ├── plugins/          # AI plugin management
│   │   │   ├── settings/         # profile, theme, language, AI model
│   │   │   └── billing/          # Stripe subscription management
│   │   ├── components/layout/    # Sidebar, MessageBubble, ChatInput
│   │   ├── stores/               # authStore, chatStore, langStore, themeStore
│   │   └── messages/             # 20 language JSON files
│   └── public/messages/          # static fallback language files
│
└── backend/
    └── src/
        ├── main.py               # FastAPI app, router registration
        ├── scheduler.py          # APScheduler — price alert background job
        ├── config/settings.py    # Pydantic settings, env vars
        ├── database/client.py    # Supabase client (lazy init)
        ├── agent/
        │   ├── graph.py          # LangGraph StateGraph — run_agent / stream_agent
        │   ├── state.py          # AgentState TypedDict
        │   └── nodes/
        │       ├── planner.py          # ReAct planner node
        │       ├── tool_executor.py    # Tool execution node (enabled-tools filter)
        │       ├── rag_node.py         # RAG retrieval node
        │       ├── human_in_loop.py    # HITL interrupt node
        │       └── prompts/
        │           ├── system_prompt.json  # Jinja2 system prompt template
        │           └── rag_prompt.json     # RAG context injection prompt
        ├── models/model_manager.py     # Unified multi-LLM interface
        ├── memory/
        │   ├── short_term.py           # LangGraph MemorySaver checkpointer
        │   └── long_term.py            # Supabase-backed cross-session memory
        ├── rag/
        │   ├── document_processor.py   # PDF/DOCX/TXT ingestion and chunking
        │   ├── embeddings.py           # OpenAI embeddings with batch caching
        │   ├── vector_store.py         # pgvector / ChromaDB abstraction
        │   ├── retriever.py            # Cosine similarity retrieval with score filter
        │   └── ab_testing.py           # Retrieval strategy comparison framework
        ├── tools/                      # 32 plugin tools across 10 categories
        │   ├── __init__.py             # TOOL_REGISTRY + get_all_tools()
        │   ├── market_tools.py
        │   ├── crypto_tools.py
        │   ├── portfolio_tools.py
        │   ├── calculation_tools.py
        │   ├── budget_tools.py
        │   ├── tax_tools.py
        │   ├── planning_tools.py
        │   ├── news_tools.py
        │   ├── rag_tools.py
        │   └── image_tools.py          # DALL-E 3 chart/infographic generation
        ├── mcp/
        │   ├── server.py               # MCP server for external integrations
        │   └── tools_registry.py
        ├── auth/                       # JWT, bcrypt, dependencies
        ├── api/
        │   ├── routes/                 # All FastAPI route handlers
        │   └── middleware/             # Auth, rate limiting, error handling
        └── utils/                      # Logger, cache, sanitizer
│
├── tests/
│   ├── conftest.py             # Shared fixtures (fully mocked — no API keys needed)
│   ├── test_agent.py           # LangGraph agent and node tests
│   ├── test_auth.py            # JWT and authentication tests
│   ├── test_rag.py             # RAG pipeline tests
│   ├── test_tools.py           # Financial calculation tool tests
│   └── test_image_tools.py     # Image generation tool tests
│
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── ETHICS.md
├── LICENSE
├── PRESENTATION.md
├── README.md
├── SECURITY.md
├── pyproject.toml
└── requirements.txt
```

---

## 🗺 Pages & Routes

### Auth Pages *(public)*
| Route | Description |
|-------|-------------|
| `/login` | Email/password + Google/GitHub OAuth |
| `/register` | New account with password strength check |
| `/forgot-password` | Request password reset email |
| `/reset-password` | Enter reset token + set new password |

### App Pages *(protected — requires login)*
| Route | Description |
|-------|-------------|
| `/chat` | Main AI chat — finance topics only |
| `/portfolio` | Real-time investment positions and P&L |
| `/analytics` | Usage stats, message counts, model breakdown |
| `/watchlist` | Live ticker price monitoring |
| `/goals` | Financial goal tracking with progress bars |
| `/budget` | Income and expense logging by category |
| `/tax` | Annual income, capital gains, tax estimates |
| `/export` | Download financial data as CSV or JSON |
| `/alerts` | Price alert creation and monitoring |
| `/plugins` | Enable/disable 32 AI tool plugins |
| `/settings` | Profile, theme, language, AI model, notifications |
| `/billing` | Upgrade to Pro, manage Stripe subscription |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and Python 3.12+
- A [Supabase](https://supabase.com) project
- At least one LLM API key (OpenAI recommended — also required for embeddings and image generation)

### Backend

```bash
git clone https://github.com/your-username/finadvisor-ai.git
cd finadvisor-ai/backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate           # macOS/Linux
# OR: .\.venv\Scripts\Activate.ps1  # Windows PowerShell

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"  # → paste as SECRET_KEY

# Run Supabase migration (dashboard → SQL Editor → SUPABASE_MIGRATION.sql → Run)

# Start server
uvicorn src.main:app --reload --port 8000
```

### Frontend

```bash
cd finadvisor-ai/frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:3000

---

## ⚙️ Environment Variables

### Backend `.env`

```env
# App
APP_NAME=FinAdvisor AI
APP_ENV=development
DEBUG=true

# Security
SECRET_KEY=<32+ random chars>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# LLM Providers (add at least one)
OPENAI_API_KEY=sk-...          # Also required for embeddings and DALL-E 3 image generation
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=AIza...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Stripe (Pro tier)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_YEARLY=price_...

# Email
SENDGRID_API_KEY=SG....
FROM_EMAIL=noreply@yourdomain.com

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# Optional: LangSmith tracing
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=finadvisor-ai
```

> **Note on image generation:** `generate_chart_image` and `generate_financial_infographic` always use OpenAI DALL-E 3, regardless of which chat model is active. `OPENAI_API_KEY` is required for these tools even when using Claude or Gemini as the chat model. Generated image URLs expire after 1 hour.

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
```

---

## 🗄 Database Setup

Enable the pgvector extension in Supabase, then run the migration:

```sql
create extension if not exists vector;
-- then paste and run SUPABASE_MIGRATION.sql
```

**Tables:** `users`, `chat_sessions`, `chat_messages`, `portfolio_positions`, `watchlist_items`, `financial_goals`, `budget_entries`, `tax_records`, `price_alerts`, `documents`, `document_chunks`

---

## 🚢 Deployment

### Frontend — Vercel
1. Connect GitHub repo in Vercel dashboard
2. Set `NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app`
3. Deploy

### Backend — Railway
1. Connect GitHub repo in Railway
2. Add all backend env vars in Railway dashboard
3. Set `ALLOWED_ORIGINS` to include your Vercel URL
4. Register Stripe webhook: `https://your-backend.up.railway.app/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`

---

## 📡 API Reference

Full interactive docs at `/docs` when `DEBUG=true`.

```
POST   /auth/register          Create account
POST   /auth/login             Login → JWT tokens
GET    /auth/me                Get current user
PATCH  /auth/me                Update profile
POST   /auth/oauth             Google / GitHub OAuth
POST   /auth/forgot-password   Send reset email
POST   /auth/reset-password    Reset with token

POST   /chat/stream            Send message (SSE streaming)
GET    /chat/sessions          List sessions

GET/POST/PATCH/DELETE  /portfolio/positions/{id}
GET/POST/PATCH/DELETE  /watchlist/{id}
GET/POST/PATCH/DELETE  /goals/{id}
GET/POST/PATCH/DELETE  /budget/{id}
GET/POST/PATCH/DELETE  /tax/{id}
GET/POST/DELETE        /alerts/{id}
GET                    /export/{type}?format=csv|json
GET                    /market/price/{ticker}
```

---

## 🌍 Internationalization

| Code | Language | Code | Language |
|------|----------|------|----------|
| `en` | English | `ar` | العربية |
| `fr` | Français | `zh` | 中文 |
| `es` | Español | `hi` | हिन्दी |
| `pt` | Português | `ja` | 日本語 |
| `de` | Deutsch | `ko` | 한국어 |
| `sw` | Kiswahili | `ru` | Русский |
| `yo` | Yorùbá | `am` | አማርኛ |
| `ha` | Hausa | `ig` | Igbo |
| `lg` | Luganda | — | — |

---

## 🤖 AI Models

| Provider | Models | Key Required | Tier |
|----------|--------|-------------|------|
| OpenAI | GPT-4o, GPT-4o Mini | `OPENAI_API_KEY` | Free (Mini) / Pro (4o) |
| Anthropic | Claude 3.5 Sonnet | `ANTHROPIC_API_KEY` | Pro |
| Google | Gemini 1.5 Flash/Pro | `GOOGLE_API_KEY` | Pro |
| Groq | Llama 3.3 70B, Llama 3.1 8B | `GROQ_API_KEY` | Free (8B) / Pro (70B) |

> The AI is strictly scoped to financial topics only. Non-financial questions are politely declined.

---

## 🔌 Plugins System

32 tools across 10 categories, individually enable/disable on the `/plugins` page. The enabled tool list is stored per-user in Supabase and enforced at two levels: (1) the planner only receives tool descriptions for enabled tools, so the LLM cannot even request a disabled tool; (2) the tool executor node independently filters by `enabled_tools` from state as a second safeguard.

---

## 🧪 Testing

The test suite runs fully offline — no real API keys or network calls are required. All external dependencies (OpenAI, Supabase, yfinance, CoinGecko) are mocked via `unittest.mock`.

```bash
# Run all tests
pytest

# With coverage report
pytest --cov=src --cov-report=term-missing

# Specific test files
pytest tests/test_tools.py -v
pytest tests/test_image_tools.py -v
pytest tests/test_rag.py -v
pytest tests/test_agent.py -v
```

| File | What it covers |
|------|---------------|
| `test_agent.py` | LangGraph graph compilation, node behaviour, streaming, HITL flow |
| `test_auth.py` | JWT creation/validation, password hashing, protected route access |
| `test_rag.py` | Document chunking, embedding batch caching, retrieval score filtering |
| `test_tools.py` | All financial calculation tools — ROI, compound interest, DCA, tax, planning |
| `test_image_tools.py` | Image generation — happy path, missing key, invalid inputs, all error types |

The full suite completes in under 30 seconds.

---

## ⚖️ Ethical Considerations

See [ETHICS.md](ETHICS.md) for the complete breakdown. Summary:

**AI Disclaimer** — The system prompt explicitly instructs the AI to remind users it is not a licensed financial advisor for major decisions. This is an architectural constraint, not a UI label — it is enforced in the system prompt with: *"Disclaimer — remind users you are an AI, not a licensed advisor, for major decisions."*

**Data Privacy** — User financial data is stored in Supabase with Row-Level Security (RLS). Passwords are hashed with bcrypt. JWT tokens are short-lived (30 min) with refresh rotation. Uploaded documents are per-user and never accessible across accounts. API keys are server-side only.

**Bias Awareness** — LLMs may reflect US-centric and English-language financial biases. The app mitigates this with 20-language support (including 6 African languages), multi-currency display, and a disclosure that tax tools assume US law.

**Human-in-the-Loop** — LangGraph's `interrupt_before` pauses the agent before any state-changing action. Users must explicitly confirm before execution.

**Hallucination Prevention** — The system prompt forbids the agent from fabricating financial data. All prices, historical figures, and calculations must come from real-time tool calls.

**Rate Limiting & Security** — SlowAPI rate limits are enforced per authenticated user. Input sanitisation middleware is applied to all endpoints. Stripe webhook signatures are verified before processing.

---

## 📊 Evaluation Against Capstone Criteria

| Criterion | How It Is Met |
|---|---|
| **Project description (goal, problem, how it works)** | [Capstone Project Summary](#-capstone-project-summary) section above |
| **Completeness and functionality** | Full-stack app live at the demo link: FastAPI + Next.js + LangGraph agent + 32 tools + RAG + streaming + portfolio/budget/goals/alerts/billing |
| **User interface quality** | Next.js frontend: dark/light theme, 20-language support, responsive layout, real-time SSE streaming, inline image rendering |
| **LangChain usage** | `@tool` decorator, `ToolNode`, `RecursiveCharacterTextSplitter`, document loaders, embedding wrappers |
| **LangGraph usage** | `StateGraph` with 4 nodes, conditional edges, `MemorySaver` checkpointing, `interrupt_before` HITL, `stream_mode="messages"` |
| **LLM API usage** | 4 providers (OpenAI, Anthropic, Google, Groq) via unified model manager; LangSmith tracing |
| **RAG implementation** | Full pipeline: ingestion → chunking → embeddings → pgvector/ChromaDB → cosine retrieval → context injection + A/B testing framework |
| **Prompt engineering** | Jinja2 system prompt with dynamic user context, tool descriptions, behavioural rules, hard prohibitions, separate RAG prompt template |
| **Ethical considerations** | [ETHICS.md](ETHICS.md) + inline section: AI disclaimer, RLS data privacy, bias acknowledgement, HITL, hallucination prevention, rate limiting |
| **Testing** | 5 pytest files, all mocked, runs offline in < 30 seconds |
| **Presentation (SCR/SMART)** | [PRESENTATION.md](PRESENTATION.md) |

---

## ⚠️ Known Limitations

- **Image generation requires OpenAI key** — DALL-E 3 is used regardless of active chat model; `OPENAI_API_KEY` is required even when chatting with Claude or Gemini
- **DALL-E image URLs expire** — URLs are valid for 1 hour; users should download images they want to keep
- **Tax tools assume US law** — capital gains estimator and tax bracket lookup are calibrated for US rates; international users should treat these as illustrative
- **Long-term memory is heuristic** — key fact extraction uses LLM-based heuristics and may miss nuanced preferences
- **Market data depends on third parties** — yfinance and CoinGecko may rate-limit or experience downtime; the agent reports unavailability rather than guessing
- **Crypto tickers require `-USD` suffix** — yfinance format requires `BTC-USD`, not `BTC`; the agent handles this automatically in chat

---

## 🤝 Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

1. Fork → branch → change → test → PR
2. All UI strings must use `t('key')` — never hardcode English
3. New keys must be added to all 20 language JSON files
4. Always use `user["user_id"]` not `user["id"]`

---

## 🔒 Security

See [SECURITY.md](SECURITY.md). To report a vulnerability: **security@finadvisor.ai** — do not open a public GitHub issue.

---

## 📄 License

[MIT](LICENSE) © 2026 FinAdvisor AI

---

<div align="center">

Built with ❤️ by Kemigisa Suzan · [⬆ Back to top](#-finadvisor-ai)

</div>