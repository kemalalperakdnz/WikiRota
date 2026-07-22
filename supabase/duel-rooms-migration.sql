-- VikiRota arkadaş düellosu odaları
-- Supabase SQL Editor içinde bir kez çalıştırın.

create table if not exists public.duel_rooms (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting'
    check (status in ('waiting', 'ready', 'racing', 'finished', 'cancelled')),
  category_id text not null
    check (char_length(category_id) between 2 and 32),
  difficulty_id text not null
    check (difficulty_id in ('easy', 'medium', 'hard')),
  start_title text not null
    check (char_length(start_title) between 2 and 255),
  target_title text not null
    check (char_length(target_title) between 2 and 255),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null
    check (char_length(trim(host_name)) between 2 and 24),
  host_ready boolean not null default false,
  host_finished boolean not null default false,
  host_steps integer
    check (host_steps is null or host_steps between 1 and 1000),
  host_time_ms integer
    check (host_time_ms is null or host_time_ms between 100 and 86400000),
  host_route jsonb
    check (host_route is null or jsonb_typeof(host_route) = 'array'),
  guest_user_id uuid references auth.users(id) on delete set null,
  guest_name text
    check (guest_name is null or char_length(trim(guest_name)) between 2 and 24),
  guest_ready boolean not null default false,
  guest_finished boolean not null default false,
  guest_steps integer
    check (guest_steps is null or guest_steps between 1 and 1000),
  guest_time_ms integer
    check (guest_time_ms is null or guest_time_ms between 100 and 86400000),
  guest_route jsonb
    check (guest_route is null or jsonb_typeof(guest_route) = 'array'),
  race_started_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  constraint duel_rooms_distinct_players check (
    guest_user_id is null or guest_user_id <> host_user_id
  ),
  constraint duel_rooms_distinct_titles check (
    lower(start_title) <> lower(target_title)
  )
);

create index if not exists duel_rooms_status_idx
  on public.duel_rooms (status, created_at desc);
create index if not exists duel_rooms_host_idx
  on public.duel_rooms (host_user_id, created_at desc);
create index if not exists duel_rooms_guest_idx
  on public.duel_rooms (guest_user_id, created_at desc);

alter table public.duel_rooms enable row level security;

drop policy if exists "Düello odaları herkese okunabilir"
  on public.duel_rooms;
create policy "Düello odaları herkese okunabilir"
  on public.duel_rooms
  for select
  to anon, authenticated
  using (true);

revoke all on public.duel_rooms from anon, authenticated;
grant select on public.duel_rooms to anon, authenticated;

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.duel_rooms;
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.create_duel_room(
  p_player_name text,
  p_category_id text,
  p_difficulty_id text,
  p_start_title text,
  p_target_title text
)
returns public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.duel_rooms;
begin
  if v_user_id is null then
    raise exception 'Oturum gerekli';
  end if;
  if char_length(trim(p_player_name)) < 2 or char_length(trim(p_player_name)) > 24 then
    raise exception 'Geçersiz oyuncu adı';
  end if;
  if p_difficulty_id not in ('easy', 'medium', 'hard') then
    raise exception 'Geçersiz zorluk';
  end if;
  if char_length(trim(p_start_title)) < 2 or char_length(trim(p_target_title)) < 2 then
    raise exception 'Geçersiz rota';
  end if;
  if lower(trim(p_start_title)) = lower(trim(p_target_title)) then
    raise exception 'Başlangıç ve hedef aynı olamaz';
  end if;

  insert into public.duel_rooms (
    category_id,
    difficulty_id,
    start_title,
    target_title,
    host_user_id,
    host_name
  ) values (
    trim(p_category_id),
    p_difficulty_id,
    trim(p_start_title),
    trim(p_target_title),
    v_user_id,
    trim(p_player_name)
  )
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.join_duel_room(
  p_room_id uuid,
  p_player_name text
)
returns public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.duel_rooms;
begin
  if v_user_id is null then
    raise exception 'Oturum gerekli';
  end if;
  if char_length(trim(p_player_name)) < 2 or char_length(trim(p_player_name)) > 24 then
    raise exception 'Geçersiz oyuncu adı';
  end if;

  select * into v_room
  from public.duel_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Oda bulunamadı';
  end if;
  if v_room.expires_at < now() or v_room.status = 'cancelled' then
    raise exception 'Oda süresi dolmuş veya iptal edilmiş';
  end if;
  if v_room.host_user_id = v_user_id then
    return v_room;
  end if;
  if v_room.guest_user_id = v_user_id then
    return v_room;
  end if;
  if v_room.guest_user_id is not null then
    raise exception 'Oda dolu';
  end if;
  if v_room.status <> 'waiting' then
    raise exception 'Odaya artık katılınamaz';
  end if;

  update public.duel_rooms
  set
    guest_user_id = v_user_id,
    guest_name = trim(p_player_name),
    status = 'ready'
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.set_duel_ready(
  p_room_id uuid,
  p_ready boolean default true
)
returns public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.duel_rooms;
  v_is_host boolean;
begin
  if v_user_id is null then
    raise exception 'Oturum gerekli';
  end if;

  select * into v_room
  from public.duel_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Oda bulunamadı';
  end if;
  if v_room.expires_at < now() then
    raise exception 'Oda süresi dolmuş';
  end if;
  if v_room.status not in ('waiting', 'ready') then
    raise exception 'Hazırlık aşaması kapandı';
  end if;
  if v_room.guest_user_id is null then
    raise exception 'Rakip henüz katılmadı';
  end if;

  v_is_host := v_room.host_user_id = v_user_id;
  if not v_is_host and v_room.guest_user_id <> v_user_id then
    raise exception 'Bu odanın oyuncusu değilsin';
  end if;

  if v_is_host then
    update public.duel_rooms
    set host_ready = coalesce(p_ready, true)
    where id = p_room_id
    returning * into v_room;
  else
    update public.duel_rooms
    set guest_ready = coalesce(p_ready, true)
    where id = p_room_id
    returning * into v_room;
  end if;

  if v_room.host_ready and v_room.guest_ready then
    update public.duel_rooms
    set
      status = 'racing',
      race_started_at = now()
    where id = p_room_id
    returning * into v_room;
  end if;

  return v_room;
end;
$$;

create or replace function public.finish_duel(
  p_room_id uuid,
  p_steps integer,
  p_time_ms integer,
  p_route jsonb default '[]'::jsonb
)
returns public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.duel_rooms;
  v_is_host boolean;
begin
  if v_user_id is null then
    raise exception 'Oturum gerekli';
  end if;
  if p_steps is null or p_steps < 1 or p_steps > 1000 then
    raise exception 'Geçersiz adım';
  end if;
  if p_time_ms is null or p_time_ms < 100 or p_time_ms > 86400000 then
    raise exception 'Geçersiz süre';
  end if;
  if p_route is null or jsonb_typeof(p_route) <> 'array' then
    raise exception 'Geçersiz rota';
  end if;

  select * into v_room
  from public.duel_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Oda bulunamadı';
  end if;
  if v_room.status not in ('racing', 'finished') then
    raise exception 'Yarış henüz başlamadı';
  end if;

  v_is_host := v_room.host_user_id = v_user_id;
  if not v_is_host and v_room.guest_user_id <> v_user_id then
    raise exception 'Bu odanın oyuncusu değilsin';
  end if;

  if v_is_host then
    if v_room.host_finished then
      return v_room;
    end if;
    update public.duel_rooms
    set
      host_finished = true,
      host_steps = p_steps,
      host_time_ms = p_time_ms,
      host_route = p_route
    where id = p_room_id
    returning * into v_room;
  else
    if v_room.guest_finished then
      return v_room;
    end if;
    update public.duel_rooms
    set
      guest_finished = true,
      guest_steps = p_steps,
      guest_time_ms = p_time_ms,
      guest_route = p_route
    where id = p_room_id
    returning * into v_room;
  end if;

  if v_room.host_finished and v_room.guest_finished then
    update public.duel_rooms
    set status = 'finished'
    where id = p_room_id
    returning * into v_room;
  end if;

  return v_room;
end;
$$;

create or replace function public.cancel_duel_room(p_room_id uuid)
returns public.duel_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.duel_rooms;
begin
  if v_user_id is null then
    raise exception 'Oturum gerekli';
  end if;

  select * into v_room
  from public.duel_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Oda bulunamadı';
  end if;
  if v_room.host_user_id <> v_user_id and v_room.guest_user_id is distinct from v_user_id then
    raise exception 'Bu odanın oyuncusu değilsin';
  end if;
  if v_room.status in ('racing', 'finished') then
    raise exception 'Başlamış düello iptal edilemez';
  end if;

  update public.duel_rooms
  set status = 'cancelled'
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.create_duel_room(text, text, text, text, text)
  to authenticated;
grant execute on function public.join_duel_room(uuid, text)
  to authenticated;
grant execute on function public.set_duel_ready(uuid, boolean)
  to authenticated;
grant execute on function public.finish_duel(uuid, integer, integer, jsonb)
  to authenticated;
grant execute on function public.cancel_duel_room(uuid)
  to authenticated;
