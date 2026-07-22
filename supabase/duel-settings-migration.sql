-- Düello odasında ev sahibinin kategori/zorluk/rota güncellemesi
-- Supabase SQL Editor içinde bir kez çalıştırın (veya CLI ile).

create or replace function public.update_duel_settings(
  p_room_id uuid,
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
  if p_difficulty_id not in ('easy', 'medium', 'hard') then
    raise exception 'Geçersiz zorluk';
  end if;
  if char_length(trim(p_category_id)) < 2 then
    raise exception 'Geçersiz kategori';
  end if;
  if char_length(trim(p_start_title)) < 2 or char_length(trim(p_target_title)) < 2 then
    raise exception 'Geçersiz rota';
  end if;
  if lower(trim(p_start_title)) = lower(trim(p_target_title)) then
    raise exception 'Başlangıç ve hedef aynı olamaz';
  end if;

  select * into v_room
  from public.duel_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Oda bulunamadı';
  end if;
  if v_room.host_user_id <> v_user_id then
    raise exception 'Yalnızca ev sahibi ayar değiştirebilir';
  end if;
  if v_room.status not in ('waiting', 'ready') then
    raise exception 'Yarış başladıktan sonra ayar değiştirilemez';
  end if;
  if v_room.expires_at < now() then
    raise exception 'Oda süresi dolmuş';
  end if;

  update public.duel_rooms
  set
    category_id = trim(p_category_id),
    difficulty_id = p_difficulty_id,
    start_title = trim(p_start_title),
    target_title = trim(p_target_title),
    host_ready = false,
    guest_ready = false,
    status = case
      when guest_user_id is null then 'waiting'
      else 'ready'
    end
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.update_duel_settings(uuid, text, text, text, text)
  to authenticated;
