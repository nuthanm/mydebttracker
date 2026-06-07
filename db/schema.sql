-- =====================================================================
-- My Debt Tracker · Postgres schema for Neon
-- Run this once in your Neon SQL editor (https://console.neon.tech).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);

-- ---------- Sessions ----------
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- Debts ----------
-- Tracks each debt: from whom borrowed, how much, at what monthly interest rate.
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL,          -- original borrowed amount
  current_principal NUMERIC(14,2) NOT NULL,  -- reduces as principal is repaid
  interest_rate NUMERIC(6,3) NOT NULL,       -- monthly interest rate in %
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE,                          -- optional target clearance date
  status TEXT NOT NULL DEFAULT 'active',     -- active | cleared
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

-- ---------- Debt Payments ----------
-- Every payment (interest, principal repayment, or full clearance) is logged here.
CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  payment_type TEXT NOT NULL,   -- 'interest' | 'principal' | 'clearance'
  amount NUMERIC(14,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_debt ON debt_payments(debt_id);
