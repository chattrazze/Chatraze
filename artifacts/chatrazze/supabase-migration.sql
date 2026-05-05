-- Run this SQL in your Supabase SQL Editor
-- It drops the old broken table (if any) and recreates it correctly

-- Step 1: Drop old broken table if it exists
DROP TABLE IF EXISTS chat_requests CASCADE;

-- Step 2: Create the table with correct UUID types
CREATE TABLE chat_requests (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_uid   UUID        NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
  to_uid     UUID        NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_uid, to_uid)
);

-- Step 3: Enable Row Level Security
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;

-- Step 4: Policies
CREATE POLICY "read own requests"
  ON chat_requests FOR SELECT
  USING (auth.uid() = from_uid OR auth.uid() = to_uid);

CREATE POLICY "insert own request"
  ON chat_requests FOR INSERT
  WITH CHECK (auth.uid() = from_uid);

CREATE POLICY "update own request"
  ON chat_requests FOR UPDATE
  USING (auth.uid() = to_uid OR auth.uid() = from_uid);

-- Step 5: Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_requests;
