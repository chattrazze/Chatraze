-- Chatrazze Supabase schema, realtime, RLS, and storage policies.
-- Run this in the Supabase SQL editor for the project used by VITE_SUPABASE_URL.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  display_name text not null default 'User',
  photo_url text,
  online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'private' check (type in ('private', 'group')),
  name text,
  avatar_url text,
  private_key text unique,
  created_by uuid references public.profiles(uid) on delete set null,
  last_message text,
  last_message_type text,
  last_message_at timestamptz,
  last_message_by uuid,
  unread jsonb not null default '{}'::jsonb,
  typing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(uid) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(uid) on delete cascade,
  type text not null default 'text',
  text text not null default '',
  media_url text not null default '',
  media_name text not null default '',
  media_mime text not null default '',
  media_size bigint not null default 0,
  duration integer not null default 0,
  read_by uuid[] not null default '{}',
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(uid) on delete cascade,
  user_name text not null,
  user_avatar text,
  type text not null check (type in ('text', 'image', 'video')),
  content text,
  media_url text,
  background_color text not null default '#1a1a2e',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.status_views (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.user_status(id) on delete cascade,
  viewer_id uuid not null references public.profiles(uid) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (status_id, viewer_id)
);

create table if not exists public.status_interactions (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.user_status(id) on delete cascade,
  sender_id uuid not null references public.profiles(uid) on delete cascade,
  recipient_id uuid not null references public.profiles(uid) on delete cascade,
  chat_id uuid references public.chats(id) on delete set null,
  kind text not null check (kind in ('reply', 'reaction')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id text not null,
  signal_type text not null check (signal_type in ('offer', 'answer', 'ice', 'hangup', 'decline')),
  from_uid uuid not null references public.profiles(uid) on delete cascade,
  from_name text not null,
  to_uid uuid not null references public.profiles(uid) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_display_name_idx on public.profiles using gin (display_name gin_trgm_ops);
create index if not exists chats_private_key_idx on public.chats (private_key) where private_key is not null;
create index if not exists chat_members_user_idx on public.chat_members (user_id, chat_id);
create index if not exists messages_chat_created_idx on public.messages (chat_id, created_at);
create index if not exists user_status_expires_idx on public.user_status (expires_at);
create index if not exists status_views_viewer_idx on public.status_views (viewer_id);
create index if not exists status_interactions_status_idx on public.status_interactions (status_id, created_at desc);
create index if not exists status_interactions_recipient_idx on public.status_interactions (recipient_id, created_at desc);
create index if not exists call_signals_to_created_idx on public.call_signals (to_uid, created_at desc);
create index if not exists call_signals_call_created_idx on public.call_signals (call_id, created_at);

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_status enable row level security;
alter table public.status_views enable row level security;
alter table public.status_interactions enable row level security;
alter table public.call_signals enable row level security;

create or replace function public.is_chat_member(target_chat_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members cm
    where cm.chat_id = target_chat_id and cm.user_id = target_user_id
  );
$$;

create or replace function public.is_chat_admin(target_chat_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members cm
    where cm.chat_id = target_chat_id and cm.user_id = target_user_id and cm.role = 'admin'
  );
$$;

drop policy if exists "profiles are readable by signed in users" on public.profiles;
create policy "profiles are readable by signed in users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = uid);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = uid)
  with check (auth.uid() = uid);

drop policy if exists "members read chats" on public.chats;
create policy "members read chats"
  on public.chats for select
  to authenticated
  using (created_by = auth.uid() or public.is_chat_member(id, auth.uid()));

drop policy if exists "members create chats" on public.chats;
create policy "members create chats"
  on public.chats for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "members update chats" on public.chats;
create policy "members update chats"
  on public.chats for update
  to authenticated
  using (public.is_chat_member(id, auth.uid()))
  with check (public.is_chat_member(id, auth.uid()));

drop policy if exists "members delete chats" on public.chats;
create policy "members delete chats"
  on public.chats for delete
  to authenticated
  using (public.is_chat_admin(id, auth.uid()));

drop policy if exists "members read chat memberships" on public.chat_members;
create policy "members read chat memberships"
  on public.chat_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "users join chats they create" on public.chat_members;
create policy "users join chats they create"
  on public.chat_members for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_chat_admin(chat_id, auth.uid()));

drop policy if exists "admins update chat memberships" on public.chat_members;
create policy "admins update chat memberships"
  on public.chat_members for update
  to authenticated
  using (public.is_chat_admin(chat_id, auth.uid()))
  with check (public.is_chat_admin(chat_id, auth.uid()));

drop policy if exists "admins remove chat memberships" on public.chat_members;
create policy "admins remove chat memberships"
  on public.chat_members for delete
  to authenticated
  using (user_id = auth.uid() or public.is_chat_admin(chat_id, auth.uid()));

drop policy if exists "members read messages" on public.messages;
create policy "members read messages"
  on public.messages for select
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id and public.is_chat_member(chat_id, auth.uid())
  );

drop policy if exists "members update message metadata" on public.messages;
create policy "members update message metadata"
  on public.messages for update
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "members clear messages" on public.messages;
create policy "members clear messages"
  on public.messages for delete
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "signed in users read active statuses" on public.user_status;
create policy "signed in users read active statuses"
  on public.user_status for select
  to authenticated
  using (expires_at > now());

drop policy if exists "users create own status" on public.user_status;
create policy "users create own status"
  on public.user_status for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own status" on public.user_status;
create policy "users update own status"
  on public.user_status for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own status" on public.user_status;
create policy "users delete own status"
  on public.user_status for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "status views readable for owner or viewer" on public.status_views;
create policy "status views readable for owner or viewer"
  on public.status_views for select
  to authenticated
  using (
    auth.uid() = viewer_id or exists (
      select 1 from public.user_status s
      where s.id = status_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "users insert own status views" on public.status_views;
create policy "users insert own status views"
  on public.status_views for insert
  to authenticated
  with check (auth.uid() = viewer_id);

drop policy if exists "users update own status views" on public.status_views;
create policy "users update own status views"
  on public.status_views for update
  to authenticated
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id);

drop policy if exists "status interactions readable by sender or recipient" on public.status_interactions;
create policy "status interactions readable by sender or recipient"
  on public.status_interactions for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "users insert own status interactions" on public.status_interactions;
create policy "users insert own status interactions"
  on public.status_interactions for insert
  to authenticated
  with check (
    auth.uid() = sender_id and exists (
      select 1 from public.user_status s
      where s.id = status_id and s.user_id = recipient_id
    )
  );

drop policy if exists "call participants read signals addressed to them or from them" on public.call_signals;
create policy "call participants read signals addressed to them or from them"
  on public.call_signals for select
  to authenticated
  using (auth.uid() = to_uid or auth.uid() = from_uid);

drop policy if exists "users create their own call signals" on public.call_signals;
create policy "users create their own call signals"
  on public.call_signals for insert
  to authenticated
  with check (auth.uid() = from_uid);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mpeg', 'application/pdf', 'application/octet-stream']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat media public read" on storage.objects;
create policy "chat media public read"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-media');

drop policy if exists "authenticated users upload chat media" on storage.objects;
create policy "authenticated users upload chat media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-media');

drop policy if exists "authenticated users update chat media" on storage.objects;
create policy "authenticated users update chat media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'chat-media')
  with check (bucket_id = 'chat-media');

drop policy if exists "authenticated users delete chat media" on storage.objects;
create policy "authenticated users delete chat media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-media');

do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chats;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.user_status;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.status_views;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.status_interactions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.call_signals;
  exception when duplicate_object then null;
  end;
end $$;
