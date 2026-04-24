# Contributing to FinAdvisor AI

Thank you for your interest in contributing. This document explains how to get involved, what we expect from contributors, and how to get your changes merged.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Frontend Guidelines](#frontend-guidelines)
- [Backend Guidelines](#backend-guidelines)
- [Adding a Language](#adding-a-language)
- [Adding a Plugin Tool](#adding-a-plugin-tool)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Code of Conduct

All contributors must follow the [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to a welcoming, respectful, and inclusive community.

---

## Before You Start

- **Check open issues** before starting work — your idea may already be tracked or in progress.
- **Open an issue first** for any significant change (new feature, major refactor, new language) so we can discuss scope before you invest time coding.
- **Small fixes** (typos, minor bugs, translation corrections) can go straight to a pull request.

---

## Development Setup

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # fill in at least SECRET_KEY and one LLM API key
uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend
npm install
# Create .env.local:
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

**Minimum requirements to run locally:**

| Requirement | Why |
|---|---|
| `SECRET_KEY` (≥ 32 chars) | JWT signing — app refuses to start without it |
| One LLM API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, or `GOOGLE_API_KEY`) | Chat requires at least one model |
| Supabase project with migration applied | User auth, portfolio, budget, and document storage |

The backend exposes `/health` (no auth required) to verify it is running.

### Running Tests

The full test suite runs **offline with no API keys** — all external calls are mocked.

```bash
cd backend
pytest                      # run all tests
pytest tests/test_agent.py  # run a specific file
pytest --cov=src            # run with coverage report
```

The suite should complete in under 30 seconds.

---

## How to Contribute

### 1. Fork and clone

```bash
git clone https://github.com/your-username/finadvisor-ai.git
cd finadvisor-ai
git remote add upstream https://github.com/original-owner/finadvisor-ai.git
```

### 2. Create a branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make your changes

Follow the guidelines in this document.

### 4. Test your changes

```bash
# Backend
cd backend && pytest

# Frontend — check for build errors
cd frontend && npm run build
```

### 5. Commit

```bash
git add .
git commit -m "feat: add budget category filter"
```

### 6. Push and open a PR

```bash
git push origin feature/your-feature-name
```

Then open a pull request on GitHub against the `main` branch.

---

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/short-description` | `feature/budget-export` |
| Bug fix | `fix/short-description` | `fix/watchlist-refresh` |
| Translation | `i18n/language-code` | `i18n/sw-corrections` |
| Documentation | `docs/short-description` | `docs/api-reference` |
| Refactor | `refactor/short-description` | `refactor/auth-store` |
| Test | `test/short-description` | `test/rag-retriever` |

---

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <short description>

[optional body]

[optional footer]
```

**Types:**

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, no logic change |
| `refactor` | Code restructure, no feature change |
| `i18n` | Translation additions or corrections |
| `chore` | Dependency updates, build changes |
| `test` | Adding or updating tests |

**Examples:**

```
feat: add recurring budget entries

fix: enforce enabled_tools filter in tool executor

i18n: add missing Hausa keys for alerts page

test: add HITL approval/rejection test cases

docs: document RAG pipeline and vector store backends
```

---

## Pull Request Process

1. **Fill out the PR template** completely — describe what changed and why.
2. **Link the relevant issue** using `Closes #123` in the PR description.
3. **Keep PRs focused** — one feature or fix per PR.
4. **Make sure the build passes** — PRs with broken builds will not be reviewed.
5. **Make sure tests pass** — `pytest` must complete without failures.
6. **Respond to review comments** promptly. PRs with no activity for 2 weeks will be closed.
7. **Squash commits** if your branch has many noisy "WIP" commits before merging.

### PR Checklist

Before submitting, verify:

- [ ] The backend starts without errors (`uvicorn src.main:app --reload`)
- [ ] The frontend builds without errors (`npm run build`)
- [ ] `pytest` passes with no failures
- [ ] Any new UI strings use `t('key')` and are added to **all 17 language JSON files** in `src/messages/`
- [ ] New API endpoints use `user["user_id"]` (not `user["id"]`) for user identification
- [ ] New API endpoints are protected with `Depends(get_current_user)` where appropriate
- [ ] New environment variables are documented in `.env.example`
- [ ] No API keys or secrets are committed to the repo
- [ ] Write operations that modify user financial data go through the HITL gate (add the tool name to `SENSITIVE_TOOLS` in `nodes/human_in_loop.py`)

---

## Frontend Guidelines

### Translations

Every user-facing string must go through the translation system. **Never hardcode English strings in JSX.**

```jsx
// ✅ Correct
const t = useTranslate()
return <span>{t('budget.addEntry')}</span>

// ❌ Wrong
return <span>Add Entry</span>
```

When adding a new key:
1. Add it to `frontend/src/messages/en.json` first
2. Add it to all 16 other language files in `frontend/src/messages/`
3. If you don't speak a language, use the English value as a placeholder — open an issue for native speaker review

**Supported languages (17 total):** English, French, Spanish, Portuguese, German, Swahili, Yoruba, Hausa, Igbo, Amharic, Arabic, Chinese, Hindi, Japanese, Korean, Russian, Luganda.

### Component patterns

- Each sub-component that renders translated text must call `const t = useTranslate()` itself — do not pass `t` as a prop.
- Use `const t = useTranslate()` at the top of every component that needs translations.
- Pages must include `<Sidebar />` and follow the sticky-header layout pattern from existing pages.

### Styling

- All styles use inline `style={{}}` objects.
- Use CSS variables from `globals.css` for colors: `var(--gold)`, `var(--bg-base)`, `var(--text-primary)`, `var(--border)`, etc.
- All page content must be wrapped in a `maxWidth` container with `margin: '0 auto'` for wide-screen centering.
- Respect both light and dark themes — test your changes in both.

### State management

| Store | Purpose |
|---|---|
| `useAuthStore` | Logged-in user, tokens, login/logout |
| `useChatStore` | Sessions, messages, streaming state, SSE |
| `useLangStore` / `useTranslate()` | Language switching, `t()` function |
| `useThemeStore` | Dark/light theme preference |

### Binary payloads (charts and files)

If you add a tool that returns a chart or file, the content string must begin with one of these prefixes so the frontend pipeline handles it correctly:

| Prefix | Renders as |
|---|---|
| `CHART_BASE64:<base64>` | PNG chart image with download button |
| `FILE_BASE64_PDF:<base64>` | PDF download card |
| `FILE_BASE64_XLSX:<base64>` | Excel download card |

The `MessageBubble` component automatically strips these from the markdown text and renders the appropriate card. Do **not** add new binary prefix formats without also updating `MessageBubble.js`, `stream_agent()` in `graph.py`, and `_stream_response()` in `chat.py`.

---

## Backend Guidelines

### Route structure

New routes go in `src/api/routes/`. The pattern for a new resource:

```python
from fastapi import APIRouter, Depends, HTTPException
from src.auth.dependencies import get_current_user

router = APIRouter()

@router.get("/")
async def list_items(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]  # always use user_id, not "id"
    ...
```

Register the router in `src/main.py`:

```python
from src.api.routes import your_module
app.include_router(your_module.router, prefix="/your-resource", tags=["Your Resource"])
```

### User ID

**Always use `user["user_id"]`** when accessing the current user's ID from the JWT payload — not `user["id"]`. This is a known footgun in this codebase.

### Database

All database calls go through the Supabase client:

```python
from src.database.client import get_supabase

db = get_supabase()
result = db.table("your_table").select("*").eq("user_id", user_id).execute()
```

Use `get_supabase_safe()` (returns `None` instead of raising) for operations where failure should be non-fatal.

### Agent state

When reading or writing agent state, always use `.get()` with a default — nodes may not always initialise every field:

```python
# ✅ Safe
user_id = state.get("user_id", "")
tools_used = state.get("tools_used", [])

# ❌ Will KeyError if field missing
user_id = state["user_id"]
```

### Adding a write operation

Any tool that **modifies user financial data** must be added to `SENSITIVE_TOOLS` in `src/agent/nodes/human_in_loop.py` so the HITL gate fires before execution:

```python
SENSITIVE_TOOLS: set[str] = {
    "add_position",
    "remove_position",
    "add_expense",
    # ... add your new tool here
}
```

Also add a human-readable description to `TOOL_ACTION_DESCRIPTIONS` in the same file.

### Scratchpad

When adding a new node that takes a meaningful action, append an entry to `state["scratchpad"]` so the action is logged:

```python
state.get("scratchpad", []) + [{
    "step":      "your_step_name",
    "timestamp": datetime.utcnow().isoformat(),
    "detail":    "what happened",
}]
```

### Market data

Use `yfinance` for live prices. **Crypto tickers must use the `-USD` suffix** (e.g., `BTC-USD`, not `BTC`).

```python
import yfinance as yf
ticker = yf.Ticker("AAPL")
price = ticker.fast_info["last_price"]
```

### Tests

Every new module should have corresponding tests in `tests/`. Key rules:
- **No real API calls** — mock all external services with `unittest.mock.patch`
- **No `.env` required** — `conftest.py` sets all env vars via `os.environ.setdefault()`
- Use existing fixtures from `conftest.py`: `fake_user`, `fake_session_id`, `mock_db`, `test_pdf_bytes`, etc.

---

## Adding a Language

1. Copy `frontend/src/messages/en.json` to `frontend/src/messages/{langcode}.json`
2. Translate all values (keys stay in English)
3. Add the language to `SUPPORTED_LANGUAGES` in `frontend/src/stores/langStore.js`:
   ```js
   { code: 'sw', label: 'Kiswahili (Swahili)' },
   ```
4. Import the new JSON file in `langStore.js` and add it to the `TRANSLATIONS` object
5. Add the language code to `LANGUAGE_NAMES` in `src/agent/nodes/planner.py` so the AI responds in that language:
   ```python
   LANGUAGE_NAMES = {
       ...,
       "sw": "Swahili",
   }
   ```
6. Open a PR with the translation — we'll get a native speaker to review it

---

## Adding a Plugin Tool

1. Create the tool function in the appropriate file under `src/tools/` using the `@tool` decorator:
   ```python
   from langchain_core.tools import tool

   @tool
   def your_tool_name(param: str) -> str:
       """One-sentence description — this appears in the LLM's tool list."""
       ...
   ```
2. Add the tool to `get_all_tools()` in `src/tools/__init__.py` (both the import and the `all_tools` dict)
3. Add an entry to `TOOL_REGISTRY` in `src/tools/__init__.py` for the Plugins UI:
   ```python
   {"id": "your_tool_name", "name": "Display Name", "category": "Category", "desc": "Short description", "default": True}
   ```
4. If the tool modifies user data, add it to `SENSITIVE_TOOLS` in `src/agent/nodes/human_in_loop.py`
5. Update the system prompt in `src/agent/nodes/prompts/system_prompt.json` to document the new tool
6. Add tests in `tests/test_tools.py`

---

## Reporting Bugs

Open a GitHub issue and include:

- A clear title summarizing the bug
- Steps to reproduce (numbered list)
- What you expected to happen
- What actually happened
- Screenshots or console output if relevant
- Browser and OS (for frontend bugs)
- Whether LangSmith tracing is enabled (for agent bugs — the trace URL helps enormously)

Use the **Bug report** issue template.

---

## Requesting Features

Open a GitHub issue using the **Feature request** template and include:

- What problem you are trying to solve
- What you propose as a solution
- Any alternatives you considered
- Why this would benefit other users

Feature requests are discussed and prioritised in the issue before any code is written.