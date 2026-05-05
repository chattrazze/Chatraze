-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)
-- Project: mnbcnfdnuqmqusbudwef

CREATE TABLE IF NOT EXISTS chat_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_uid   UUID NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
  to_uid     UUID NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_uid, to_uid)
);

-- Allow all authenticated users to read requests where they are from or to
ALTER TABLE chat_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their own requests"
  ON chat_requests FOR SELECT
  USING (auth.uid() = from_uid OR auth.uid() = to_uid);

CREATE POLICY "users can insert their own requests"
  ON chat_requests FOR INSERT
  WITH CHECK (auth.uid() = from_uid);

CREATE POLICY "recipient can update (accept/reject)"
  ON chat_requests FOR UPDATE
  USING (auth.uid() = to_uid OR auth.uid() = from_uid);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE chat_requests;
