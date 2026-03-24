# Changelog

All notable changes to FinAdvisor AI are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- 16-key time-and-day-aware greeting system across all 16 languages (8 time slots + 7 day-of-week greetings)

---

## [1.1.0] — Phase 11 — 2026-03-08

### Added
- **Watchlist page** (`/watchlist`) — monitor any ticker with live price refresh
- **Goals page** (`/goals`) — track financial goals with target amounts, dates, and progress
- **Budget page** (`/budget`) — log income and expenses by category
- **Tax Records page** (`/tax`) — annual income, capital gains, and estimated tax owed
- **Export page** (`/export`) — download portfolio, budget, goals, tax, or watchlist as CSV or JSON
- Forgot password flow (`/forgot-password` + `/reset-password`) with email delivery via SendGrid/SMTP
- Password visibility toggles on all auth forms
- 7 new greeting translation keys: `goodNight`, `happyMonday`, `happyFriday`, `happyWeekend`, `heyThere`, `hiThere`, `helloThere`
- Backend routes: `watchlist.py`, `goals.py`, `budget.py`, `tax.py`, `exports.py`
- Supabase tables for all new features in `SUPABASE_MIGRATION.sql`

### Fixed
- All new pages showing "Loading…" indefinitely — caused by `user["id"]` instead of `user["user_id"]`
- Password reset token never sent — auth.py rewritten with SendGrid primary and SMTP fallback
- Sidebar labels not translating — `NAV_GROUPS` moved inside component so `t()` is called reactively
- Settings and Upgrade pages not showing sidebar in loading state
- Alerts page content left-aligned on wide screens — added `margin: '0 auto'`
- Export page showing English strings on language switch — `export.desc*` keys added to all languages
- Upgrade, Alerts, Watchlist pages showing English on language switch — all missing translation keys added to all 16 languages (up to 32 keys per page in some language files)

---

## [1.0.2] — Phase 10 fixes — 2026-03-06

### Fixed
- Language switching falls back to English on second switch — removed conditional check in `setLang()`
- Build failures ("Unterminated regexp literal") — removed orphaned JSX tags, rewrote ExportCard component
- Plugins page showing English words on language switch — 32 `pluginTools` translation keys added to all 15 non-English languages
- Auth pages (login, register, forgot-password, reset-password) not translating — all 4 pages rewritten with `useTranslate()`; 48 new auth keys added to all 16 language files

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
- Temperature slider for AI response creativity
- Regenerate last response button
- Feedback thumbs up/down on AI messages

### Fixed
- Sub-components outside main component using `t()` without scope — every sub-component now calls `const t = useTranslate()` itself
- New pages (Watchlist, Goals, Budget, Tax, Export) missing sidebar — all restructured to use sticky header pattern

---

## [1.0.0] — Phase 9 — 2026-03-03

### Added
- **Billing page** (`/billing`) — Stripe integration with monthly and yearly Pro plans
- **Alerts page** (`/alerts`) — price alert creation, auto-check every 5 minutes
- **Plugins page** (`/plugins`) — 32 AI tool plugins, individually enable/disable
- **Analytics page** (`/analytics`) — usage stats, message counts, model breakdown
- Google OAuth and GitHub OAuth login
- Stripe checkout and webhook handling
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

### Fixed
- Crypto tickers requiring `-USD` suffix for yfinance compatibility (e.g., `BTC-USD`)

---

## [0.8.0] — Phase 7 — 2026-02-27

### Added
- **16-language support** — EN, FR, ES, PT, DE, SW, YO, HA, IG, AM, AR, ZH, HI, JA, KO, RU
- `langStore.js` — Zustand store for language switching
- Language selector in Settings page
- All UI strings translated across all 16 languages
- Chat greeting keys: `goodMorning`, `goodAfternoon`, `goodEvening`
- **Settings page** (`/settings`) — profile, preferred name, theme, AI model, language, currency, notifications, danger zone
- Light / dark theme toggle with `themeStore.js`

---

## [0.7.0] — Phase 6 — 2026-02-26

### Added
- Full frontend application with Next.js 14 App Router
- Sidebar navigation with collapse and mobile support
- Chat page (`/chat`) with streaming AI responses, suggested prompts, and session history
- Login and Register pages with JWT auth
- `authStore.js` and `chatStore.js` Zustand stores
- `MessageBubble.js` and `ChatInput.js` components

---

## [0.5.0] — Phase 5 — 2026-02-26

### Added
- LangChain agent with 32 plugin tools
- Streaming chat endpoint (`POST /chat/stream`) with Server-Sent Events
- Document upload and RAG retrieval (pgvector embeddings)
- Per-user plugin enable/disable stored in Supabase

---

## [0.3.0] — Phase 3 — 2026-02-26

### Added
- FastAPI backend with full project structure
- JWT authentication with access and refresh tokens
- Supabase integration with lazy client initialization
- All auth endpoints: register, login, refresh, `/me`, logout, OAuth, forgot-password, reset-password, change-password
- Structlog structured logging
- Pydantic settings with `.env` support

---

## [0.1.0] — Phase 1 & 2 — 2026-02-25

### Added
- Initial project setup
- Repository structure
- Supabase project and database schema
- Backend virtual environment and `requirements.txt`
- Frontend Next.js project scaffolding
