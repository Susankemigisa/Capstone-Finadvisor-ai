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
- The component or file(s) affected (e.g., `auth.py`, `/chat` endpoint)
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

- **Passwords** are hashed using bcrypt before storage — plaintext passwords are never written to the database
- **JWT access tokens** expire after 30 minutes
- **Refresh tokens** expire after 7 days and are stored in Supabase; they are invalidated on logout
- **Password reset tokens** are 6-character cryptographically random strings, valid for 1 hour, single-use
- **OAuth tokens** from Google/GitHub are never stored — only the user's profile data

### API Security

- All protected routes require a valid JWT in the `Authorization: Bearer <token>` header
- **Rate limiting** is enforced per user: configurable limits per minute and per hour
- **CORS** is restricted to explicitly configured origins — wildcard `*` is never used in production
- The `SECRET_KEY` must be at least 32 characters and is validated at application startup
- API docs (`/docs`, `/redoc`) are only exposed when `DEBUG=true` — disabled in production

### Database

- The **Supabase service role key** is used only server-side and is never exposed to the frontend
- The frontend only ever holds a short-lived JWT — it never has direct database access
- Row-Level Security (RLS) is enabled on Supabase tables as an additional layer of protection
- All queries are parameterized through the Supabase client — no raw SQL string concatenation

### Payments

- **Stripe webhook signatures** are verified using `stripe.WebhookSignature.verify_header` before any webhook payload is processed
- Card data never touches our servers — all payment UI is handled by Stripe's hosted checkout
- The `STRIPE_SECRET_KEY` is never logged or exposed in error messages

### Email

- Password reset tokens are sent via SendGrid or SMTP and are **single-use** — they are invalidated immediately after use
- No sensitive user data is included in email bodies beyond the reset token itself

### Secrets Management

The following secrets must never be committed to the repository:

| Secret | Where It Lives |
|--------|---------------|
| `SECRET_KEY` | Backend `.env` / Render env vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend `.env` / Render env vars |
| `STRIPE_SECRET_KEY` | Backend `.env` / Render env vars |
| `OPENAI_API_KEY` | Backend `.env` / Render env vars |
| `SENDGRID_API_KEY` | Backend `.env` / Render env vars |
| `GOOGLE_CLIENT_SECRET` | Backend `.env` / Render env vars |
| `GITHUB_CLIENT_SECRET` | Backend `.env` / Render env vars |

The `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local`. If you accidentally commit a secret, rotate it immediately — git history cannot be trusted after a secret has been pushed.

---

## Known Security Considerations

### LLM Prompt Injection

AI chat applications are inherently vulnerable to prompt injection — users may attempt to craft messages that alter the AI's behavior or extract system prompts. We mitigate this by:

- Using a fixed system prompt that is not user-editable
- Limiting the AI's tool access to only explicitly enabled plugins
- Logging all AI interactions for review when LangSmith tracing is enabled

We do **not** consider prompt injection a security vulnerability in the traditional sense, but we take reports of novel attack vectors seriously.

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

8. **Use a strong Supabase database password** — the default is not sufficient for production

---

## Changelog

Security fixes are noted in the project changelog with the tag `[security]`.
