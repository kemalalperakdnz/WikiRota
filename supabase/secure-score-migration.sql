-- Mevcut VikiRota kurulumunu sunucu doğrulamalı skor akışına geçirir.
-- Supabase SQL Editor içinde bir kez çalıştırın.

alter table public.leaderboard_entries
  add column if not exists verified boolean not null default false;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null
    check (char_length(trim(player_name)) between 2 and 24),
  category_id text not null
    check (char_length(category_id) between 2 and 32),
  difficulty_id text not null
    check (difficulty_id in ('easy', 'medium', 'hard')),
  game_mode text not null default 'normal'
    check (game_mode in ('normal', 'daily')),
  daily_key date,
  start_title text not null
    check (char_length(start_title) between 2 and 255),
  target_title text not null
    check (char_length(target_title) between 2 and 255),
  status text not null default 'active'
    check (status in ('active', 'finished', 'rejected', 'expired')),
  client_record_id text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.game_sessions
  add column if not exists client_record_id text;

create index if not exists game_sessions_user_status_idx
  on public.game_sessions (user_id, status, started_at desc);
create unique index if not exists game_sessions_client_record_idx
  on public.game_sessions (user_id, client_record_id)
  where client_record_id is not null;

alter table public.game_sessions enable row level security;
alter table public.leaderboard_entries enable row level security;
revoke all on public.game_sessions from anon, authenticated;

drop policy if exists "Oyuncular kendi skorlarını ekleyebilir"
  on public.leaderboard_entries;
revoke all on public.leaderboard_entries from anon, authenticated;
grant select (
  id, player_name, category_id, difficulty_id, game_mode, daily_key,
  start_title, target_title, route_history, steps, time_ms, verified, created_at
) on public.leaderboard_entries to anon, authenticated;

create or replace function public.finalize_verified_score(
  p_session_id uuid,
  p_user_id uuid,
  p_client_record_id text,
  p_route_history jsonb,
  p_steps integer,
  p_time_ms integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_entry_id bigint;
begin
  select *
    into v_session
    from public.game_sessions
   where id = p_session_id and user_id = p_user_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_session';
  end if;

  if v_session.status = 'finished'
     and v_session.client_record_id = p_client_record_id then
    select id into v_entry_id
      from public.leaderboard_entries
     where user_id = p_user_id and client_record_id = p_client_record_id;
    return v_entry_id;
  end if;

  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'session_not_active';
  end if;

  insert into public.leaderboard_entries (
    user_id, client_record_id, player_name, category_id, difficulty_id,
    game_mode, daily_key, start_title, target_title, route_history, steps, time_ms,
    verified
  ) values (
    v_session.user_id, p_client_record_id, v_session.player_name,
    v_session.category_id, v_session.difficulty_id, v_session.game_mode,
    v_session.daily_key, v_session.start_title, v_session.target_title,
    p_route_history, p_steps, p_time_ms, true
  )
  returning id into v_entry_id;

  update public.game_sessions
     set status = 'finished',
         client_record_id = p_client_record_id,
         finished_at = now()
   where id = p_session_id;

  return v_entry_id;
end;
$$;

revoke all on function public.finalize_verified_score(
  uuid, uuid, text, jsonb, integer, integer
) from public, anon, authenticated;
grant execute on function public.finalize_verified_score(
  uuid, uuid, text, jsonb, integer, integer
) to service_role;

create or replace view public.leaderboard_public
with (security_invoker = true)
as
select
  id,
  player_name,
  category_id,
  difficulty_id,
  game_mode,
  daily_key,
  start_title,
  target_title,
  route_history,
  steps,
  time_ms,
  created_at
from public.leaderboard_entries
where verified = true;

grant select on public.leaderboard_public to anon, authenticated;
