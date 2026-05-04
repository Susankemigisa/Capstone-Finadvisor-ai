
-- ── Notification prefs: new columns added for savings/transactions/watchlist emails ──
-- Run these in Supabase SQL Editor if your notification_prefs table already exists:
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_savings_rules BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_transactions BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_prefs ADD COLUMN IF NOT EXISTS email_watchlist_alerts BOOLEAN DEFAULT TRUE;
