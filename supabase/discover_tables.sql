-- Discover feature tables for Chatrazze
-- Run this in your Supabase project's SQL Editor

-- 1. discover_profiles
CREATE TABLE IF NOT EXISTS public.discover_profiles (
  user_id     TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  age         INTEGER NOT NULL DEFAULT 0,
  gender      TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  bio         TEXT NOT NULL DEFAULT '',
  looking_for TEXT NOT NULL DEFAULT 'friendship',
  fitness     TEXT NOT NULL DEFAULT 'light',
  smoking     TEXT NOT NULL DEFAULT 'never',
  interests   TEXT[] NOT NULL DEFAULT '{}',
  photos      TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.discover_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_active_or_own" ON public.discover_profiles;
DROP POLICY IF EXISTS "manage_own" ON public.discover_profiles;
CREATE POLICY "read_active_or_own" ON public.discover_profiles
  FOR SELECT USING (is_active = TRUE OR user_id = auth.uid()::TEXT);
CREATE POLICY "manage_own" ON public.discover_profiles
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- 2. swipes
CREATE TABLE IF NOT EXISTS public.swipes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id  TEXT NOT NULL,
  swiped_id  TEXT NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('like','skip')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(swiper_id, swiped_id)
);

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manage_own_swipes" ON public.swipes;
DROP POLICY IF EXISTS "read_reverse" ON public.swipes;
CREATE POLICY "manage_own_swipes" ON public.swipes
  FOR ALL USING (swiper_id = auth.uid()::TEXT);
CREATE POLICY "read_reverse" ON public.swipes
  FOR SELECT USING (swiped_id = auth.uid()::TEXT);

-- 3. matches
CREATE TABLE IF NOT EXISTS public.matches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id   TEXT NOT NULL,
  user2_id   TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_matches" ON public.matches;
DROP POLICY IF EXISTS "create_matches" ON public.matches;
CREATE POLICY "read_own_matches" ON public.matches
  FOR SELECT USING (user1_id = auth.uid()::TEXT OR user2_id = auth.uid()::TEXT);
CREATE POLICY "create_matches" ON public.matches
  FOR INSERT WITH CHECK (user1_id = auth.uid()::TEXT OR user2_id = auth.uid()::TEXT);
