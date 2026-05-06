-- Discover profiles v2 — run AFTER discover_tables.sql
-- Add optional profile enrichment columns
ALTER TABLE public.discover_profiles
  ADD COLUMN IF NOT EXISTS height       INTEGER,
  ADD COLUMN IF NOT EXISTS nationality  TEXT,
  ADD COLUMN IF NOT EXISTS education    TEXT,
  ADD COLUMN IF NOT EXISTS occupation   TEXT,
  ADD COLUMN IF NOT EXISTS religion     TEXT,
  ADD COLUMN IF NOT EXISTS children     TEXT,
  ADD COLUMN IF NOT EXISTS drinking     TEXT,
  ADD COLUMN IF NOT EXISTS zodiac       TEXT,
  ADD COLUMN IF NOT EXISTS languages    TEXT[] DEFAULT '{}';
