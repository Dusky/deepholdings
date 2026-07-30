-- Deep Holdings initial schema.
-- Server-authoritative: every number a client can see lives here.

CREATE TABLE IF NOT EXISTS accounts (
  id           UUID PRIMARY KEY,
  device_id    TEXT UNIQUE NOT NULL,
  callsign     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id                  UUID PRIMARY KEY,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  recruit_num         INTEGER NOT NULL,
  level               INTEGER NOT NULL,
  xp                  INTEGER NOT NULL,
  hp                  INTEGER NOT NULL,
  max_hp              INTEGER NOT NULL,
  depth               INTEGER NOT NULL,
  permit_tier         INTEGER NOT NULL,
  gold                INTEGER NOT NULL,
  supplies            INTEGER NOT NULL,
  alive               BOOLEAN NOT NULL DEFAULT TRUE,
  last_resolved_tick  BIGINT NOT NULL,
  permit_applied_tick BIGINT,
  inventory           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  died_at             TIMESTAMPTZ
);

-- One living character per account; enforced rather than assumed.
CREATE UNIQUE INDEX IF NOT EXISTS characters_one_alive_per_account
  ON characters (account_id) WHERE alive;

CREATE TABLE IF NOT EXISTS standing_orders (
  account_id     UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  target_depth   INTEGER NOT NULL,
  retreat_pct    INTEGER NOT NULL,
  loot_priority  TEXT NOT NULL,
  spend_policy   TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal (
  id           BIGSERIAL PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tick         BIGINT NOT NULL,
  at           TIMESTAMPTZ NOT NULL,
  text         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS journal_character_tick ON journal (character_id, tick);

CREATE TABLE IF NOT EXISTS pensions (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  total      INTEGER NOT NULL DEFAULT 0,
  spent      INTEGER NOT NULL DEFAULT 0,
  unlocks    JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS deaths (
  id              UUID PRIMARY KEY,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_name  TEXT NOT NULL,
  depth           INTEGER NOT NULL,
  cause           TEXT NOT NULL,
  gold_handled    INTEGER NOT NULL,
  pension_awarded INTEGER NOT NULL,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deaths_at ON deaths (at DESC);

-- Single-row table: the shared world the heartbeat advances.
CREATE TABLE IF NOT EXISTS world (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  beat            BIGINT NOT NULL DEFAULT 0,
  event           TEXT NOT NULL,
  guild_name      TEXT NOT NULL,
  guild_objective TEXT NOT NULL,
  guild_progress  INTEGER NOT NULL DEFAULT 0,
  guild_target    INTEGER NOT NULL DEFAULT 500,
  market          JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_beat_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tavern_messages (
  id         BIGSERIAL PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tavern_messages_id ON tavern_messages (id DESC);
