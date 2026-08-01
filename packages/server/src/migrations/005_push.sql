-- Push delivery: device tokens, and a record of what has already been sent.
--
-- Tokens are per *device*, not per account, because one officer may hold a
-- phone and a tablet and both should ring. FCM rotates them, so the token is
-- the primary key rather than the account — re-registering the same token from
-- a reinstalled app must update the row, not add a second one.

CREATE TABLE IF NOT EXISTS push_tokens (
  token       TEXT PRIMARY KEY,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_account_idx ON push_tokens (account_id);

-- The server's half of the send budget.
--
-- The client budget in `native/sendBudget.ts` cannot govern a push, because a
-- push is decided on a machine the client is not running on. The same two
-- rules therefore need enforcing here: a daily cap, and never twice for the
-- same event. `event_key` is the event ("death:<id>"), not the slot — the
-- primary key is what makes the second rule true rather than hoped for.

CREATE TABLE IF NOT EXISTS push_sends (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_key  TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, event_key)
);

CREATE INDEX IF NOT EXISTS push_sends_recent_idx ON push_sends (account_id, sent_at);

-- The sweep needs to find accounts that are away but still care.
--
-- Resolution is lazy: a recruit who dies while the phone is asleep does not
-- die, as far as the server is concerned, until the officer next opens the
-- app — by which point they are already looking at the screen and the push has
-- nothing to say. So the heartbeat resolves accounts that have a token and
-- have not been read recently. This index is what keeps that a bounded scan
-- rather than a table walk.
CREATE INDEX IF NOT EXISTS accounts_last_seen_idx ON accounts (last_seen_at);
