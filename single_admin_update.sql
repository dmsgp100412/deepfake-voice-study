create or replace function public.admin_update_single_response(
  p_id bigint,
  p_chosen_label text,
  p_confidence smallint
) returns public.single_responses
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.single_responses%rowtype;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then
    raise exception 'Not allowed';
  end if;
  if p_chosen_label not in ('real','ai') or p_confidence not between 1 and 5 then
    raise exception 'Invalid update';
  end if;

  update public.single_responses
  set chosen_label = p_chosen_label,
      confidence = p_confidence
  where id = p_id
  returning * into v_row;

  if not found then raise exception 'Response not found'; end if;
  return v_row;
end $$;

revoke all on function public.admin_update_single_response(bigint,text,smallint) from public;
grant execute on function public.admin_update_single_response(bigint,text,smallint) to authenticated;

create or replace function public.admin_update_single_participant(
  p_session_id uuid,
  p_participant_initials text,
  p_birth_date date,
  p_gender text,
  p_age_group text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_age integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then
    raise exception 'Not allowed';
  end if;

  v_age := extract(year from age(current_date, p_birth_date));
  if p_participant_initials !~ '^[A-Z]{2,6}$'
     or p_birth_date is null
     or v_age not between 20 and 39
     or p_gender not in ('male','female')
     or p_age_group not in ('20s','30s')
     or p_age_group <> (case when v_age between 20 and 29 then '20s' else '30s' end) then
    raise exception 'Invalid participant information';
  end if;

  update public.single_responses
  set participant_initials = p_participant_initials,
      birth_date = p_birth_date,
      gender = p_gender,
      age_group = p_age_group
  where session_id = p_session_id;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.admin_update_single_participant(uuid,text,date,text,text) from public;
grant execute on function public.admin_update_single_participant(uuid,text,date,text,text) to authenticated;

create or replace function public.admin_delete_single_response(p_id bigint)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then
    raise exception 'Not allowed';
  end if;
  delete from public.single_responses where id = p_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.admin_delete_single_response(bigint) from public;
grant execute on function public.admin_delete_single_response(bigint) to authenticated;

create or replace function public.admin_delete_single_session(p_session_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then
    raise exception 'Not allowed';
  end if;
  delete from public.single_responses where session_id = p_session_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.admin_delete_single_session(uuid) from public;
grant execute on function public.admin_delete_single_session(uuid) to authenticated;
