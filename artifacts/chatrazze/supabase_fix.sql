-- ============================================================
-- Chatrazze — Supabase Schema + RLS Fix
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add lang column to profiles if it doesn't exist (default English)
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en';

ALTER TABLE IF EXISTS profiles
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en';

-- ============================================================
-- 1. CHATS TABLE
-- id is TEXT so it accepts both proper UUIDs (new chats) and
-- any legacy IDs that may already exist.
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
  id              TEXT        PRIMARY KEY,
  members         TEXT[]      NOT NULL DEFAULT '{}',
  last_message    TEXT,
  last_message_type TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_by TEXT,
  unread          JSONB       DEFAULT '{}',
  typing          JSONB       DEFAULT '{}',
  is_group        BOOLEAN     DEFAULT FALSE,
  group_name      TEXT,
  group_photo     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- If the table already exists with id UUID, convert it to TEXT safely:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chats' AND column_name = 'id'
      AND data_type = 'uuid'
  ) THEN
    -- Drop FK constraints from messages before altering chats.id
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_chat_id_fkey;
    -- Change id column type
    ALTER TABLE chats  ALTER COLUMN id TYPE TEXT USING id::TEXT;
    ALTER TABLE messages ALTER COLUMN chat_id TYPE TEXT USING chat_id::TEXT;
  END IF;
END $$;

-- ============================================================
-- 2. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     TEXT        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id   TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'text',
  text        TEXT        DEFAULT '',
  media_url   TEXT        DEFAULT '',
  media_name  TEXT        DEFAULT '',
  media_mime  TEXT        DEFAULT '',
  media_size  BIGINT      DEFAULT 0,
  duration    INTEGER     DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  read_by     TEXT[]      DEFAULT '{}',
  reactions   JSONB       DEFAULT '{}'
);

-- Ensure chat_id column exists with correct type (migration safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'chat_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN chat_id TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- ============================================================
-- 3. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS chats_members_gin    ON chats    USING GIN(members);
CREATE INDEX IF NOT EXISTS chats_last_msg_at    ON chats    (last_message_at DESC);
CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at ASC);
CREATE INDEX IF NOT EXISTS messages_sender_idx  ON messages (sender_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop old policies so we can recreate them cleanly
DROP POLICY IF EXISTS "Users can read their chats"          ON chats;
DROP POLICY IF EXISTS "Users can insert chats"              ON chats;
DROP POLICY IF EXISTS "Users can update their chats"        ON chats;
DROP POLICY IF EXISTS "Users can delete their chats"        ON chats;

DROP POLICY IF EXISTS "Users can read messages"             ON messages;
DROP POLICY IF EXISTS "Users can insert messages"           ON messages;
DROP POLICY IF EXISTS "Users can update messages"           ON messages;
DROP POLICY IF EXISTS "Users can read messages in their chats" ON messages;

-- ── chats ────────────────────────────────────────────────────
-- SELECT: user must be in members array
CREATE POLICY "Users can read their chats" ON chats
  FOR SELECT
  USING (auth.uid()::text = ANY(members));

-- INSERT: inserting user must include themselves in members
CREATE POLICY "Users can insert chats" ON chats
  FOR INSERT
  WITH CHECK (auth.uid()::text = ANY(members));

-- UPDATE: any member can update messaging metadata (unread, typing, last_message*)
DROP POLICY IF EXISTS "Members can update chat metadata" ON chats;
CREATE POLICY "Members can update chat metadata" ON chats
  FOR UPDATE
  USING (auth.uid()::text = ANY(members));

-- Trigger: block non-admin mutation of admin-protected fields at DB level
CREATE OR REPLACE FUNCTION chats_admin_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Protect ownership / identity fields unconditionally
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable after creation';
  END IF;
  -- Protect admin-only group settings
  IF (
    NEW.name                IS DISTINCT FROM OLD.name                OR
    NEW.description         IS DISTINCT FROM OLD.description         OR
    NEW.avatar_url          IS DISTINCT FROM OLD.avatar_url          OR
    NEW.self_destruct_timer IS DISTINCT FROM OLD.self_destruct_timer OR
    NEW.invite_token        IS DISTINCT FROM OLD.invite_token
  ) THEN
    IF OLD.created_by IS NULL OR OLD.created_by IS DISTINCT FROM auth.uid()::text THEN
      RAISE EXCEPTION 'Only the group admin can update group settings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chats_admin_field_guard_trigger ON chats;
CREATE TRIGGER chats_admin_field_guard_trigger
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION chats_admin_field_guard();

-- ============================================================
-- ADMIN-ONLY GROUP SETTINGS (SECURITY DEFINER RPC)
-- Only the group creator (admin) can update protected fields.
-- This function is called instead of a direct UPDATE for
-- name / description / avatar_url / self_destruct_timer / invite_token.
-- ============================================================
DROP FUNCTION IF EXISTS update_group_settings(TEXT,TEXT,TEXT,TEXT,INTEGER,UUID);
CREATE OR REPLACE FUNCTION update_group_settings(
  p_chat_id            TEXT,
  p_name               TEXT    DEFAULT NULL,
  p_description        TEXT    DEFAULT NULL,
  p_avatar_url         TEXT    DEFAULT NULL,
  p_self_destruct_timer INTEGER DEFAULT NULL,
  p_invite_token       UUID    DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is the group admin
  IF NOT EXISTS (
    SELECT 1 FROM chats
    WHERE id = p_chat_id
      AND created_by = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the group admin can update group settings';
  END IF;

  UPDATE chats SET
    name                = COALESCE(p_name,                name),
    description         = COALESCE(p_description,         description),
    avatar_url          = COALESCE(p_avatar_url,          avatar_url),
    self_destruct_timer = COALESCE(p_self_destruct_timer, self_destruct_timer),
    invite_token        = COALESCE(p_invite_token,        invite_token)
  WHERE id = p_chat_id;
END;
$$;

-- ── messages ─────────────────────────────────────────────────
-- SELECT: user must be a member of the chat
CREATE POLICY "Users can read messages" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.members)
    )
  );

-- INSERT: sender_id must match the authenticated user AND they must be a chat member
CREATE POLICY "Users can insert messages" ON messages
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = sender_id
    AND EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.members)
    )
  );

-- UPDATE: user must be a member (for read_by, reactions updates)
CREATE POLICY "Users can update messages" ON messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = ANY(chats.members)
    )
  );

-- ============================================================
-- 5. USERS TABLE (for presence / profile — if not already set)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  uid         TEXT        PRIMARY KEY,
  email       TEXT,
  display_name TEXT,
  photo_url   TEXT,
  phone       TEXT,
  online      BOOLEAN     DEFAULT FALSE,
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read all profiles"  ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can read all profiles" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid()::text = uid);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = uid);

-- ============================================================
-- 6. STATUSES TABLE (if not already set)
-- ============================================================
CREATE TABLE IF NOT EXISTS statuses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL,
  user_name  TEXT,
  user_photo TEXT,
  type       TEXT        NOT NULL DEFAULT 'text',
  text       TEXT,
  media_url  TEXT,
  bg_color   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read statuses" ON statuses;
DROP POLICY IF EXISTS "Users can insert own status"           ON statuses;
DROP POLICY IF EXISTS "Users can delete own status"           ON statuses;

CREATE POLICY "Authenticated users can read statuses" ON statuses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own status" ON statuses
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own status" ON statuses
  FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================================
-- 7. EXTRA GROUP COLUMNS (safe to re-run)
-- ============================================================
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS invite_token        UUID        DEFAULT NULL;
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS self_destruct_timer INTEGER     DEFAULT 0;
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS description         TEXT        DEFAULT NULL;
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS name                TEXT        DEFAULT NULL;
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS avatar_url          TEXT        DEFAULT NULL;
ALTER TABLE chats    ADD COLUMN IF NOT EXISTS created_by          TEXT        DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id         TEXT        DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_text       TEXT        DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender     TEXT        DEFAULT NULL;

-- ============================================================
-- 8. CHAT_MEMBERS TABLE (starred_chats column per spec)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id       TEXT        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id       TEXT        NOT NULL,
  starred_chats BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

-- Idempotent: add starred_chats if the table already existed without it
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS starred_chats BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read chat_members"      ON chat_members;
DROP POLICY IF EXISTS "Members can manage their own row"   ON chat_members;

CREATE POLICY "Members can read chat_members" ON chat_members
  FOR SELECT USING (
    auth.uid()::text = user_id
    OR EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = chat_id
        AND auth.uid()::text = ANY(chats.members)
    )
  );

CREATE POLICY "Members can manage their own row" ON chat_members
  FOR ALL USING (auth.uid()::text = user_id);

-- ============================================================
-- 9. ADMIN-ONLY MESSAGE DELETE POLICY
-- Only the chat creator (admin) may bulk-delete all messages.
-- ============================================================
DROP POLICY IF EXISTS "Admin can clear group messages" ON messages;
CREATE POLICY "Admin can clear group messages" ON messages
  FOR DELETE USING (
    auth.uid()::text = sender_id
    OR EXISTS (
      SELECT 1 FROM chats
      WHERE chats.id = messages.chat_id
        AND auth.uid()::text = chats.created_by
    )
  );

-- ============================================================
-- 10. CHAT BACKGROUND — per-user setting stored in profile
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_bg TEXT NOT NULL DEFAULT 'default';

-- ============================================================
-- Done! Run this and then test your app.
-- ============================================================
