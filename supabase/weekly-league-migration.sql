-- Mevcut VikiRota kurulumuna haftalık lig desteği ekler.
-- Supabase SQL Editor içinde bir kez çalıştırın.

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_entries_game_mode_check;
alter table public.leaderboard_entries
  add constraint leaderboard_entries_game_mode_check
  check (game_mode in ('normal', 'daily', 'weekly'));

alter table public.leaderboard_entries
  add column if not exists weekly_key text
  check (weekly_key is null or weekly_key ~ '^\d{4}-W\d{2}$');

alter table public.game_sessions
  drop constraint if exists game_sessions_game_mode_check;
alter table public.game_sessions
  add constraint game_sessions_game_mode_check
  check (game_mode in ('normal', 'daily', 'weekly'));

alter table public.game_sessions
  add column if not exists weekly_key text
  check (weekly_key is null or weekly_key ~ '^\d{4}-W\d{2}$');

create index if not exists leaderboard_weekly_idx
  on public.leaderboard_entries (weekly_key, steps, time_ms)
  where game_mode = 'weekly';

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
    game_mode, daily_key, weekly_key, start_title, target_title,
    route_history, steps, time_ms, verified
  ) values (
    v_session.user_id, p_client_record_id, v_session.player_name,
    v_session.category_id, v_session.difficulty_id, v_session.game_mode,
    v_session.daily_key, v_session.weekly_key, v_session.start_title,
    v_session.target_title, p_route_history, p_steps, p_time_ms, true
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
  weekly_key,
  start_title,
  target_title,
  route_history,
  steps,
  time_ms,
  created_at
from public.leaderboard_entries
where verified = true;

grant select on public.leaderboard_public to anon, authenticated;
