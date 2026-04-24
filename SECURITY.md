# Security Policy

## Supported Versions

We actively maintain security fixes for the following versions:

| Version | Supported |
|---------|-----------|
| Latest (`main`) | ✅ Yes |
| Previous release | ✅ Yes (critical fixes only) |
| Older releases | ❌ No |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in FinAdvisor AI, please report it privately so we can address it before it becomes public knowledge and potentially harms users.

### How to Report

Send an email to: **security@finadvisor.ai** *(replace with your actual contact)*

Include as much of the following as possible:

- A description of the vulnerability and the potential impact
- The component or file(s) affected (e.g., `auth.py`, `/chat` endpoint, `tool_executor.py`)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept code or screenshots if available
- Your suggested fix, if you have one

We will acknowledge receipt of your report within **48 hours** and aim to provide a full response within **7 days**. If the issue is confirmed, we will work on a fix and coordinate a disclosure timeline with you.

### What to Expect

- We will keep you informed of our progress
- We will credit you in the release notes unless you prefer to remain anonymous
- We will not take legal action against researchers who follow responsible disclosure
- We ask that you give us reasonable time to fix the issue before any public disclosure

---

## Security Architecture

### Authentication & Tokens

- **Passwords** are hashed using bcrypt (`bcrypt==4.0.1`) before storage — plaintext passwords are never written to the database
- **JWT access tokens** expire after 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES=30`)
- **JWT refresh tokens** expire after 7 days (`REFRESH_TOKEN_EXPIRE_DAYS=7`) and are invalidated on logout
- **Token type enforcement** — `decode_access_token()` rejects refresh tokens and vice versa; type is embedded in the JWT payload
- **Password reset tokens** are cryptographically random, valid for 1 hour, single-use — invalidated immediately after use
- **OAuth tokens** from Google/GitHub are never stored — only the user's profile data
- **Password strength** is validated server-side: minimum 8 characters, at least one uppercase, one lowercase, and one digit

### API Security

- All protected routes require a valid JWT in the `Authorization: Bearer <token>` header via `Depends(get_current_user)`
- **Rate limiting** is enforced per authenticated user via SlowAPI: configurable per-minute and per-hour caps (`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_HOUR`)
- **Per-user daily message limits** are enforced in the chat route handler with a structured `429` response including a countdown timer
- **CORS** is restricted to explicitly configured origins (`ALLOWED_ORIGINS`) — wildcard `*` is never used in production
- The `SECRET_KEY` must be at least 32 characters and is validated at application startup via a Pydantic field validator
- API docs (`/docs`, `/redoc`) are only exposed when `DEBUG=true` — disabled in production

### Tool Execution Security

The agent's tool execution enforces a **two-layer security model**:

1. **Planning time** — the LLM only receives tool descriptions for tools that are in the user's `enabled_tools` list (via `bind_tools()` in `planner.py`)
2. **Execution time** — `tool_executor_node` independently calls `get_all_tools(enabled_tool_ids=state["enabled_tools"])`, so a crafted `tool_call_id` cannot bypass user preferences and trigger a disabled tool

Previously, only layer 1 existed — layer 2 is a security fix applied in v1.2.0.

### Human-in-the-Loop (HITL) for Write Operations

The agent **never autonomously modifies user financial data**. All write operations require explicit user confirmation:

- Adding or removing portfolio positions
- Logging expenses or income
- Creating, updating, or deleting tax records

The confirmation flow uses LangGraph's `interrupt_before` mechanism. If the graph is resumed with `{approved: false}`, the tools do not execute and no data is written. This prevents both accidental mutations and prompt-injection-driven data tampering.

### Database

- The **Supabase service role key** is used only server-side and is never exposed to the frontend
- The frontend only ever holds a short-lived JWT — it never has direct database access
- Row-Level Security (RLS) is enabled on Supabase tables as an additional isolation layer — even a compromised query cannot read another user's data
- All queries use the parameterized Supabase client — no raw SQL string concatenation
- Document chunks are scoped by `user_id` in both storage and retrieval — vector similarity search never crosses user boundaries

### Payments

- **Stripe webhook signatures** are verified using `stripe.WebhookSignature.verify_header` before any webhook payload is processed
- Card data never touches our servers — all payment UI is handled by Stripe's hosted checkout
- The `STRIPE_SECRET_KEY` is never logged or exposed in error messages

### Email

- Password reset tokens are sent via SendGrid (primary) or SMTP (fallback) and are **single-use**
- No sensitive user data is included in email bodies beyond the reset token itself
- Emails are only sent to the verified address on file

### Secrets Management

The following secrets must never be committed to the repository:

| Secret | Where It Lives |
|--------|---------------|
| `SECRET_KEY` | Backend `.env` / Render env vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend `.env` / Render env vars |
| `STRIPE_SECRET_KEY` | Backend `.env` / Render env vars |
| `STRIPE_WEBHOOK_SECRET` | Backend `.env` / Render env vars |
| `OPENAI_API_KEY` | Backend `.env` / Render env vars |
| `ANTHROPIC_API_KEY` | Backend `.env` / Render env vars |
| `GROQ_API_KEY` | Backend `.env` / Render env vars |
| `GOOGLE_API_KEY` | Backend `.env` / Render env vars |
| `SENDGRID_API_KEY` | Backend `.env` / Render env vars |
| `GOOGLE_CLIENT_SECRET` | Backend `.env` / Render env vars |
| `GITHUB_CLIENT_SECRET` | Backend `.env` / Render env vars |
| `MONO_SECRET_KEY` | Backend `.env` / Render env vars |
| `MOMO_API_KEY` | Backend `.env` / Render env vars |
| `FLUTTERWAVE_SECRET_KEY` | Backend `.env` / Render env vars |
| `LANGCHAIN_API_KEY` | Backend `.env` / Render env vars (LangSmith tracing) |

The `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local`. If you accidentally commit a secret, rotate it immediately — git history cannot be trusted after a secret has been pushed.

---

## Known Security Considerations

### LLM Prompt Injection

AI chat applications are inherently vulnerable to prompt injection — users may attempt to craft messages that alter the AI's behaviour or extract system prompts. We mitigate this by:

- Using a fixed system prompt in `src/agent/nodes/prompts/system_prompt.json` that is not user-editable
- Limiting the AI's tool access to only explicitly enabled plugins (dual-layer enforcement)
- Logging all AI interactions when LangSmith tracing is enabled
- The `requires_human_review` flag in `AgentState` allows the planner to escalate suspicious requests to the HITL gate independently of tool names

We do **not** consider prompt injection a security vulnerability in the traditional sense — it is an inherent property of LLM systems — but we take reports of novel attack vectors seriously.

### Rate Limiting Bypass

Rate limits are enforced server-side per authenticated user. Unauthenticated requests cannot reach chat or financial data endpoints. If you discover a way to bypass rate limits, please report it.

### Financial Data

FinAdvisor AI is a personal finance tool. Market prices and financial calculations are provided for informational purposes only. The application does not execute trades, hold funds, or have access to any brokerage or banking accounts.

---

## Dependency Security

We monitor dependencies for known vulnerabilities. You can run these checks locally:

```bash
# Backend Python dependencies
pip install pip-audit
pip-audit

# Frontend Node dependencies
cd frontend
npm audit
```

If you find a vulnerability in a dependency we use, please report it upstream to that project. If the vulnerability directly affects FinAdvisor AI in a meaningful way, also report it to us.

---

## Security Best Practices for Self-Hosting

If you deploy your own instance of FinAdvisor AI:

1. **Generate a strong `SECRET_KEY`** — at least 32 random characters:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **Set `DEBUG=false`** in production — this disables `/docs`, `/redoc`, and detailed error responses

3. **Restrict `ALLOWED_ORIGINS`** to your actual frontend domain — never use `*`

4. **Use HTTPS** everywhere — never deploy with plain HTTP in production

5. **Rotate all API keys** if you ever suspect they have been compromised

6. **Enable Supabase Row-Level Security** and run the provided migration before going live

7. **Set up Stripe webhook signature verification** — do not skip `STRIPE_WEBHOOK_SECRET`

8. **Set `LANGCHAIN_TRACING_V2=false`** in production unless you need tracing — when enabled, agent metadata is sent to LangSmith

9. **Use a strong Supabase database password** — the default is not sufficient for production

10. **Configure rate limits** appropriately for your expected traffic — the defaults (`RATE_LIMIT_PER_MINUTE=30`, `RATE_LIMIT_PER_HOUR=300`) are conservative for development

---

## Changelog

Security fixes are noted in the project changelog with the tag `[security]`.

Notable security changes:
- **v1.2.0** — `tool_executor_node` now enforces `enabled_tools` filter at execution time (was only enforced at planning time — a disabled tool could previously still execute via a crafted tool call)