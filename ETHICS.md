# Ethical Considerations — FinAdvisor AI

This document addresses the ethical and privacy dimensions of FinAdvisor AI as required by the AI Engineering Capstone evaluation criteria. It covers data privacy, algorithmic bias, responsible AI design, and the mitigation strategies implemented in the application.

---

## 1. AI Disclaimer and Informed Consent

**The risk:** An AI giving financial advice could be mistaken for licensed professional guidance, leading users to make uninformed or harmful decisions — investing money they cannot afford to lose, missing tax obligations, or making retirement decisions without their full circumstances accounted for.

**What we did:**

The disclaimer is architectural, not cosmetic. It is embedded in the system prompt as an explicit behavioural instruction:

> *"Disclaimer — remind users you are an AI, not a licensed advisor, for major decisions."*

This means the AI itself proactively reminds users during conversations about investments, tax planning, retirement, or any decision with significant financial stakes. It is not a footer users scroll past.

The onboarding screen (shown to every new user before they can use the chat) also displays:

> *"FinAdvisor AI is for informational purposes only and is not a licensed financial advisor. Always consult a qualified professional for major financial decisions."*

**Remaining gap:** Users may still over-rely on AI guidance. Future versions could implement a confidence disclosure feature where the agent explicitly rates its certainty and flags when professional consultation is strongly recommended.

---

## 2. Data Privacy and Security

**The risk:** Users share highly sensitive personal financial data — income, expenses, portfolio holdings, tax information, and personal documents such as pay slips and bank statements. A breach or misuse could cause significant financial and personal harm.

**What we did:**

| Measure | Implementation |
|---|---|
| Row-Level Security (RLS) | Supabase RLS ensures each user can only read and write their own records — the database layer enforces user isolation even if a query bug occurs |
| Password hashing | bcrypt with appropriate cost factor — plaintext passwords are never written to any store |
| Short-lived JWT tokens | Access tokens expire after 30 minutes; refresh tokens expire after 7 days and are invalidated on logout |
| Server-side API keys | OpenAI, Anthropic, Groq, Google, Supabase service role, Stripe, and SendGrid keys are stored in environment variables and never exposed to the browser |
| Document isolation | Uploaded documents are stored per-user; the vector retrieval system is scoped by `user_id` — a user cannot access another user's document chunks |
| Minimal LLM context | Only the minimum necessary context is sent to LLM providers per query — full financial history is not bulk-transmitted |
| Stripe-hosted checkout | Card data never touches our servers; all payment UI is handled by Stripe's PCI-compliant hosted checkout |
| Input sanitisation | A sanitisation middleware layer (`utils/sanitizer.py`) is applied to all API endpoints before request processing |
| Multi-provider LLM | Support for OpenAI, Anthropic, Groq, and Google — no single-vendor lock-in; users can choose which provider processes their data |

**What we do not do:**
- We do not sell user data to third parties
- We do not use uploaded documents to train models
- We do not log conversation content to third-party analytics platforms (LangSmith tracing is opt-in via `LANGCHAIN_TRACING_V2=true` and logs only agent metadata, not message content)

---

## 3. Algorithmic Bias and Financial Inclusion

**The risk:** Large language models are trained predominantly on English-language text with a heavy bias toward US financial systems — US tax law (401k, IRA, capital gains rates), US investment products (S&P 500), and Western financial norms. This means the AI may give advice that is irrelevant, incorrect, or harmful for users in other countries or financial contexts.

**What we did:**

- **17-language support** — The UI and AI responses are available in English, French, Spanish, Portuguese, German, Swahili, Yoruba, Hausa, Igbo, Amharic, Arabic, Chinese, Hindi, Japanese, Korean, Russian, and Luganda. The system prompt instructs the AI to respond in the user's preferred language.
- **Multi-currency display** — The system prompt instructs the agent to use the user's preferred currency for all monetary values.
- **UGX-first onboarding** — The currency selector in the onboarding wizard lists Ugandan Shilling first, followed by Kenyan Shilling, reflecting the application's primary target market in East Africa.
- **General-purpose financial tools** — ROI, compound interest, debt payoff, and retirement calculators are currency- and geography-agnostic.
- **African language inclusion** — Amharic, Hausa, Igbo, Luganda, Swahili, and Yoruba are explicitly supported — a deliberate decision to serve users in East, West, and Central Africa who are typically underserved by English-only fintech tools.
- **African payment rails** — Settings include integration points for Mono (African bank connections), MTN Mobile Money Uganda, Airtel Money Uganda, and Flutterwave (pan-African card payments and transfers).

**Acknowledged limitations:**
- Tax estimation tools (capital gains estimator, tax bracket lookup) currently assume US law. This is disclosed in the system prompt tool descriptions and in the README Known Limitations section.
- The underlying LLMs may still default to US/Western financial concepts even when responding in other languages. Users should verify advice with local resources.

**Future improvement:** Localised tax modules for major non-US jurisdictions (UK, EU, Uganda, Nigeria, Kenya) would significantly improve global applicability.

---

## 4. Human-in-the-Loop (HITL) for Sensitive Actions

**The risk:** An AI agent that can autonomously modify a user's financial records — adding portfolio positions, logging expenses, creating tax entries — could make irreversible mistakes, misinterpret user intent, or be manipulated through prompt injection.

**What we did:**

A HITL interrupt mechanism is implemented using LangGraph's `interrupt_before` capability in `src/agent/nodes/human_in_loop.py`. Before the agent executes any tool call that modifies user state, the graph pauses and presents the planned action to the user for explicit confirmation via an SSE event (`__HITL__`). The frontend renders a confirmation dialog showing exactly what the agent intends to do.

Tools that require confirmation:

| Tool | Action |
|---|---|
| `add_position` | Add a new position to the portfolio |
| `remove_position` | Remove a position from the portfolio |
| `add_expense` | Log a new expense in the budget |
| `add_income` | Log a new income entry |
| `add_tax_record` | Create a new tax record |
| `update_tax_record` | Update an existing tax record |
| `delete_tax_record` | Permanently delete a tax record |

If the user confirms (`POST /chat/resume` with `{approved: true}`), the tool executes. If rejected, a cancellation message is returned and the action is never performed. The agent can never autonomously modify user data — all write operations require human consent.

---

## 5. Hallucination Prevention in Financial Contexts

**The risk:** LLMs generate plausible-sounding but fabricated information. In a financial context, a hallucinated stock price, tax rate, or investment return could directly cause a user to lose money.

**What we did:**

The system prompt contains explicit hard prohibitions enforced as behavioural instructions:

> *"Never fabricate stock prices or financial data — always use tools."*  
> *"Never guarantee investment returns."*

Every numerical financial figure must come from a real-time tool call — stock prices from Yahoo Finance via `yfinance`, crypto prices from CoinGecko, calculations from deterministic Python functions. If a data source is unavailable (API outage, rate limit), the agent reports the failure explicitly rather than estimating. All tool calls include `try/except` error handling that returns a clear, user-readable error string rather than propagating exceptions. The scratchpad (`state["scratchpad"]`) logs every tool call and result, making the data provenance fully traceable in LangSmith.

---

## 6. Rate Limiting and Abuse Prevention

**The risk:** An unrestricted AI chat API can be abused for spam, excessive API cost generation, or denial-of-service attacks.

**What we did:**

- **SlowAPI rate limiting** — enforced per authenticated user per time window (configurable via `RATE_LIMIT_PER_MINUTE` and `RATE_LIMIT_PER_HOUR` environment variables). Unauthenticated requests cannot reach chat or financial data endpoints.
- **Per-user message limits** — free tier users have a configurable daily message limit enforced in the chat route handler with a countdown timer returned to the frontend.
- **Input sanitisation** — all API endpoints pass through `utils/sanitizer.py`.
- **JWT authentication** — all protected endpoints require a valid, unexpired access token (30-minute lifetime).
- **Stripe webhook verification** — webhook payloads are verified using `stripe.WebhookSignature.verify_header` before any subscription state change is processed.
- **API docs gated** — `/docs` and `/redoc` are only exposed when `DEBUG=true`; disabled in production.

---

## 7. Prompt Injection Awareness

**The risk:** Users may craft messages that alter the AI's behaviour — bypassing the finance-only scope, extracting the system prompt, or manipulating the agent into calling tools it should not.

**What we did:**

- The system prompt is fixed server-side in `src/agent/nodes/prompts/system_prompt.json` and is not user-editable.
- The finance-only scope is enforced by explicit rules in the system prompt with concrete example refusal responses for each off-topic category.
- The enabled-tools filter is enforced at **two independent layers**: (1) the LLM only receives descriptions of enabled tools at planning time via `bind_tools()`, and (2) `tool_executor_node` independently calls `get_all_tools(enabled_tool_ids=state["enabled_tools"])` at execution time, so a crafted `tool_call_id` cannot trigger a disabled tool.
- The `requires_human_review` flag in `AgentState` allows the planner to escalate any suspicious request to the HITL gate before execution.

**Acknowledged:** Prompt injection is an unsolved problem in LLM systems. Our mitigations reduce but do not eliminate the risk. Novel injection vectors should be reported via the security policy contact.

---

## 8. Financial Inclusion and Accessibility

**The risk:** AI financial tools risk serving only users who are already financially literate, English-speaking, and well-resourced — reinforcing existing inequalities.

**What we did:**

- **Free tier** — core financial tools (market data, calculators, portfolio tracking, budget) are available without payment.
- **17 languages** — including 6 African languages (Amharic, Hausa, Igbo, Luganda, Swahili, Yoruba) not typically supported by fintech tools.
- **UGX-first design** — onboarding lists East African currencies first.
- **African payment rails** — Mono, MTN Mobile Money, Airtel Money, and Flutterwave integration points are built into the backend settings.
- **Low-jargon design** — the system prompt instructs the AI to use clear, accessible language.
- **Inclusive tone** — the agent is instructed to be warm and non-judgmental; it never shames users about debt, low savings, or past financial mistakes.
- **No minimum portfolio** — portfolio and watchlist tools work with any amount, including zero.
- **Multi-LLM support** — 4 providers (OpenAI, Anthropic, Groq, Google) give users choice and ensure the app works even if one provider has an outage or pricing change.

---

## Summary Risk Table

| Risk | Severity | Status |
|---|---|---|
| Mistaking AI for licensed professional advice | 🔴 High | ✅ Explicit disclaimer in system prompt + onboarding screen |
| Sensitive financial data exposure | 🔴 High | ✅ RLS, bcrypt, short-lived JWTs, server-side keys, document isolation by `user_id` |
| US/English financial bias | 🟡 Medium | ⚠️ Partially mitigated — 17 languages, multi-currency, UGX-first; tax tools still US-centric |
| Agent making irreversible changes without consent | 🔴 High | ✅ LangGraph HITL `interrupt_before` on all 7 write operations, confirm/cancel UI |
| LLM hallucinating financial data | 🔴 High | ✅ Tool-only data policy in system prompt; scratchpad traces every data source; graceful failure |
| API abuse and cost attacks | 🟡 Medium | ✅ Per-user rate limiting (minute + hour caps), daily message limits, JWT-gated endpoints |
| Prompt injection | 🟡 Medium | ⚠️ Partially mitigated — fixed system prompt, dual-layer tool filter, `requires_human_review` flag |
| Financial exclusion | 🟡 Medium | ✅ Free tier, 17 languages, 6 African languages, UGX-first, African payment rails |
| Third-party service outages | 🟢 Low | ✅ Graceful error messages, 4 LLM providers, local embedding fallback, no data fabrication on failure |
| Disabled tools still executing | 🟡 Medium | ✅ Fixed — `tool_executor_node` enforces `enabled_tools` filter at execution time |