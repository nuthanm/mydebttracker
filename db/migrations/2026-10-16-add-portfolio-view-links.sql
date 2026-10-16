-- Private read-only debt view links.
-- The app also creates these tables on first use. Run this in Neon if you apply migrations by hand.

CREATE TABLE IF NOT EXISTS portfolio_view_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_view_links_active_user
  ON portfolio_view_links (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS portfolio_view_sessions (
  token_hash TEXT PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES portfolio_view_links(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_view_sessions_link ON portfolio_view_sessions(link_id);
