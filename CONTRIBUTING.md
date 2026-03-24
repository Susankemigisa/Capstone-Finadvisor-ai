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

Follow the full setup in [README.md](README.md). The short version:

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # fill in your keys
uvicorn src.main:app --reload --port 8000

# Frontend
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

You need at least one LLM API key and a Supabase project with the migration applied to work locally.

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

Follow the guidelines in this document for frontend and backend changes.

### 4. Test your changes

```bash
# Backend — run from the backend/ directory
pytest

# Frontend — check for build errors
cd frontend
npm run build
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

fix: prevent duplicate watchlist tickers

i18n: add missing Hausa keys for alerts page

docs: add Stripe webhook setup instructions
```

---

## Pull Request Process

1. **Fill out the PR template** completely — describe what changed and why.
2. **Link the relevant issue** using `Closes #123` in the PR description.
3. **Keep PRs focused** — one feature or fix per PR. Large PRs are hard to review and slow to merge.
4. **Make sure the build passes** — PRs with broken builds will not be reviewed.
5. **Respond to review comments** promptly. PRs with no activity for 2 weeks will be closed.
6. **Squash commits** if your branch has many noisy "WIP" commits before merging.

### PR Checklist

Before submitting, verify:

- [ ] The backend starts without errors (`uvicorn src.main:app --reload`)
- [ ] The frontend builds without errors (`npm run build`)
- [ ] Any new UI strings use `t('key')` and are added to all 16 language JSON files
- [ ] New API endpoints are protected with JWT middleware where appropriate
- [ ] New environment variables are documented in `.env.example` and `README.md`
- [ ] No API keys or secrets are committed to the repo

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
2. Add it to all 15 other language files in `frontend/src/messages/`
3. Add it to all 16 files in `frontend/public/messages/` (kept in sync)
4. If you don't speak a language, use the English value as a placeholder — open an issue for native speaker review

### Component patterns

- Each sub-component that renders translated text must call `const t = useTranslate()` itself — do not pass `t` as a prop.
- Use `const t = useTranslate()` at the top of every component that needs translations.
- Pages must include `<Sidebar />` and follow the sticky-header layout pattern from existing pages.

### Styling

- All styles use inline `style={{}}` objects — no CSS modules or Tailwind.
- Use CSS variables from `globals.css` for colors: `var(--gold)`, `var(--bg-base)`, `var(--text-primary)`, `var(--border)`, etc.
- All page content must be wrapped in a `maxWidth` container with `margin: '0 auto'` for wide-screen centering.
- Respect both light and dark themes — test your changes in both.

### State management

- Auth state: `useAuthStore`
- Chat state: `useChatStore`
- Language: `useLangStore` / `useTranslate()`
- Theme: `useThemeStore`

---

## Backend Guidelines

### Route structure

New routes go in `src/api/routes/`. The pattern for a new resource:

```python
from fastapi import APIRouter, Depends, HTTPException
from src.api.dependencies import get_current_user

router = APIRouter()

@router.get("/")
async def list_items(user=Depends(get_current_user)):
    # user["user_id"] — always use user_id, not user["id"]
    ...

@router.post("/")
async def create_item(data: ItemCreate, user=Depends(get_current_user)):
    ...
```

Register the router in `main.py`:

```python
from src.api.routes import your_module
app.include_router(your_module.router, prefix="/your-resource", tags=["Your Resource"])
```

### User ID

Always use `user["user_id"]` when accessing the current user's ID — not `user["id"]`. This is a known footgun in this codebase.

### Database

All database calls go through the Supabase client:

```python
from src.database.client import get_supabase

supabase = get_supabase()
result = supabase.table("your_table").select("*").eq("user_id", user_id).execute()
```

### Market data

Use `yfinance` for live prices. Crypto tickers must use the `-USD` suffix (e.g., `BTC-USD`, not `BTC`).

```python
import yfinance as yf
ticker = yf.Ticker("AAPL")
price = ticker.fast_info["last_price"]
```

---

## Adding a Language

1. Copy `frontend/src/messages/en.json` to `frontend/src/messages/{langcode}.json`
2. Translate all values (keys must remain in English)
3. Do the same for `frontend/public/messages/{langcode}.json`
4. Add the language to `SUPPORTED_LANGUAGES` in `frontend/src/stores/langStore.js`:
   ```js
   { code: 'sw', label: 'Kiswahili (Swahili)' },
   ```
5. Import the new JSON file in `langStore.js`:
   ```js
   import sw from '../messages/sw.json'
   // add to TRANSLATIONS object
   ```
6. Open a PR with the translation — we'll get a native speaker to review it

---

## Adding a Plugin Tool

1. Create the tool function in the appropriate file under `src/api/routes/` or a new `src/tools/` file
2. Register it in the plugin registry (the list of available tools loaded by the chat agent)
3. Add translation keys for the tool name and description to all 16 language files:
   ```json
   "pluginTools": {
     "your_tool_id": "Your Tool Display Name"
   }
   ```
4. Tool descriptions shown in the plugins page come from the backend — update the tool's `description` field in Python

---

## Reporting Bugs

Open a GitHub issue and include:

- A clear title summarizing the bug
- Steps to reproduce (numbered list)
- What you expected to happen
- What actually happened
- Screenshots if relevant
- Browser and OS (for frontend bugs)
- Error messages from the console or terminal

Use the **Bug report** issue template.

---

## Requesting Features

Open a GitHub issue using the **Feature request** template and include:

- What problem you are trying to solve
- What you propose as a solution
- Any alternatives you considered
- Why this would benefit other users

Feature requests are discussed and prioritized in the issue before any code is written.
