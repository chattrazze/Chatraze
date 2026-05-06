# Chatrazze Workspace

Chatrazze is a full-featured WhatsApp-like chat app built with React + Vite + Supabase,
plus a Discover (Tinder-like swipe-to-match) feature.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/chatrazze exec tsc --noEmit` — typecheck chatrazze app only
- Workflows: `artifacts/chatrazze: web` (Vite dev), `artifacts/api-server: API Server`
- Required env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SESSION_SECRET`

## Stack

- **Monorepo**: pnpm workspaces, Node 24, TypeScript 5.9
- **Frontend**: React 19 + Vite 7, Tailwind CSS v4, lucide-react icons
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage), supabase-js client
- **API Server**: Express 5 + Drizzle ORM (separate artifact at `/api`)
- **Validation**: Zod v4, drizzle-zod

## Where things live

- `artifacts/chatrazze/src/` — main React app
  - `components/screens/` — tab screens (Chats, Status, Calls, Communities, Discover, Profile)
  - `lib/` — service layer (chatService, userService, discoverService, etc.)
  - `hooks/useLang.tsx` — i18n for 8 languages (EN/AR/FR/ES/DE/PT/IT/TR)
  - `components/BottomTabs.tsx` — 6-tab navigation
- `supabase/discover_tables.sql` — SQL migration for Discover feature tables

## Architecture decisions

- Supabase used directly (no ORM) for chatrazze; anon key in VITE_ env vars (client-side)
- All photos stored in `chatrazze-media` bucket (public); paths: `discover/{uid}/`, `avatars/{uid}`
- Discover: mutual swipe detection done in `discoverService.swipe()` by checking reverse swipe
- Tab navigation: 6 tabs (status|calls|communities|discover|chats|profile); `TabKey` union type
- Chat archive: persisted in localStorage (`chatrazze:archived_v1`)

## Product

- Real-time messaging (text, image, video, audio, file), reactions, replies, forwarding
- Group chats, Communities (channel-style), Status updates (24h ephemeral)
- WebRTC video/audio calls with call history
- **Discover**: Tinder-like swipe cards, profile wizard (4 steps), match detection, match chat
- Profile setup: avatar, bio, links, app lock (biometric/passcode), chat backgrounds
- Chat requests, block/unblock, starred messages, linked devices
- Multilingual: EN, AR, FR, ES, DE, PT, IT, TR

## Gotchas

- **Discover tables must be created manually**: run `supabase/discover_tables.sql` in Supabase SQL Editor
- Never add VITE_ secrets to server code — they are client-side only
- `pnpm run dev` at workspace root doesn't work; use workflow restart instead
- Proxy routes by path: `/api` → api-server, `/` → chatrazze

## Pointers

- See `.local/skills/pnpm-workspace/` for monorepo structure docs
- Supabase project ref: `mnbcnfdnuqmqusbudwef`; bucket: `chatrazze-media` (public)
- GitHub: `chattrazze/Chatraze`
