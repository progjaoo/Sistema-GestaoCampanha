-- Migration aditiva do OAuth Google Calendar.
-- Aplicar primeiro em uma branch Neon de teste e depois em produção.
-- As tabelas guardam somente o envelope cifrado AES-GCM, nunca tokens em texto aberto.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_google_calendar_integration (
  id text PRIMARY KEY DEFAULT 'google_calendar',
  refresh_token_ciphertext text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_auth_tag text NOT NULL,
  encryption_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'connected',
  connected_by_user_id integer REFERENCES campaign_auth_users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_google_calendar_integration_singleton_check
    CHECK (id = 'google_calendar'),
  CONSTRAINT campaign_google_calendar_integration_status_check
    CHECK (status IN ('connected', 'reauthorization_required'))
);

CREATE TABLE IF NOT EXISTS campaign_google_calendar_oauth_states (
  state_hash text PRIMARY KEY,
  code_verifier_ciphertext text NOT NULL,
  code_verifier_iv text NOT NULL,
  code_verifier_auth_tag text NOT NULL,
  started_by_user_id integer NOT NULL REFERENCES campaign_auth_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_google_calendar_oauth_states_expires_idx
  ON campaign_google_calendar_oauth_states (expires_at);

COMMIT;
