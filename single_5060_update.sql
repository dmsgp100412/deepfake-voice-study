alter table public.single_responses drop constraint if exists single_responses_age_group_check;
alter table public.single_responses add constraint single_responses_age_group_check
  check (age_group in ('20s','30s','50s','60s'));

alter table public.single_responses drop constraint if exists single_responses_experiment_mode_check;
alter table public.single_responses add constraint single_responses_experiment_mode_check
  check (experiment_mode in ('single_training1','single_training1_50_60'));

create index if not exists single_responses_mode_session_idx
  on public.single_responses(experiment_mode, session_id);

create or replace function public.submit_single_trial_5060(
  p_session_id uuid,
  p_participant_code text,
  p_participant_initials text,
  p_birth_date date,
  p_gender text,
  p_age_group text,
  p_trial_index smallint,
  p_pair_id smallint,
  p_audio_path text,
  p_chosen_label text,
  p_confidence smallint,
  p_response_ms integer,
  p_plays smallint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_real text;
  v_fake text;
  v_actual_label text;
  v_age integer;
  v_existing public.single_responses%rowtype;
begin
  v_age := extract(year from age(current_date, p_birth_date));

  if p_session_id is null
     or p_participant_code !~ '^P-[A-Z0-9]{8}$'
     or p_participant_initials !~ '^[A-Z]{2,6}$'
     or p_birth_date is null
     or v_age not between 50 and 69
     or p_age_group <> (case when v_age between 50 and 59 then '50s' else '60s' end)
     or p_gender not in ('male','female')
     or p_trial_index not between 1 and 40
     or p_pair_id is null
     or p_audio_path is null
     or p_chosen_label not in ('real','ai')
     or p_confidence not between 1 and 5
     or p_response_ms not between 0 and 3600000
     or p_plays not between 1 and 2 then
    raise exception 'Invalid answer';
  end if;

  select real_path, fake_path into v_real, v_fake
  from public.stimuli
  where training = 1 and pair_id = p_pair_id;

  if p_audio_path = v_real then
    v_actual_label := 'real';
  elsif p_audio_path = v_fake then
    v_actual_label := 'ai';
  else
    raise exception 'Invalid stimulus';
  end if;

  select * into v_existing
  from public.single_responses
  where session_id = p_session_id and trial_index = p_trial_index;

  if found then
    if v_existing.experiment_mode = 'single_training1_50_60'
       and v_existing.pair_id = p_pair_id
       and v_existing.audio_path = p_audio_path
       and v_existing.chosen_label = p_chosen_label
       and v_existing.confidence = p_confidence then
      return jsonb_build_object('saved', true, 'duplicate', true);
    end if;
    raise exception 'This trial already has a different answer';
  end if;

  insert into public.single_responses(
    session_id, participant_code, participant_initials, birth_date,
    gender, age_group, experiment_mode, trial_index, pair_id,
    audio_path, actual_label, chosen_label, confidence,
    response_ms, plays
  ) values (
    p_session_id, p_participant_code, p_participant_initials, p_birth_date,
    p_gender, p_age_group, 'single_training1_50_60', p_trial_index, p_pair_id,
    p_audio_path, v_actual_label, p_chosen_label, p_confidence,
    p_response_ms, p_plays
  );

  return jsonb_build_object('saved', true);
end $$;

revoke all on function public.submit_single_trial_5060(uuid,text,text,date,text,text,smallint,smallint,text,text,smallint,integer,smallint) from public;
grant execute on function public.submit_single_trial_5060(uuid,text,text,date,text,text,smallint,smallint,text,text,smallint,integer,smallint) to anon, authenticated;

create or replace function public.admin_update_single_5060_response(
  p_id bigint,
  p_chosen_label text,
  p_confidence smallint
) returns public.single_responses
language plpgsql security definer set search_path = ''
as $$
declare v_row public.single_responses%rowtype;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then raise exception 'Not allowed'; end if;
  if p_chosen_label not in ('real','ai') or p_confidence not between 1 and 5 then raise exception 'Invalid update'; end if;
  update public.single_responses
  set chosen_label = p_chosen_label, confidence = p_confidence
  where id = p_id and experiment_mode = 'single_training1_50_60'
  returning * into v_row;
  if not found then raise exception 'Response not found'; end if;
  return v_row;
end $$;
revoke all on function public.admin_update_single_5060_response(bigint,text,smallint) from public;
grant execute on function public.admin_update_single_5060_response(bigint,text,smallint) to authenticated;

create or replace function public.admin_update_single_5060_participant(
  p_session_id uuid,
  p_participant_initials text,
  p_birth_date date,
  p_gender text,
  p_age_group text
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer; v_age integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then raise exception 'Not allowed'; end if;
  v_age := extract(year from age(current_date, p_birth_date));
  if p_participant_initials !~ '^[A-Z]{2,6}$'
     or p_birth_date is null
     or v_age not between 50 and 69
     or p_gender not in ('male','female')
     or p_age_group not in ('50s','60s')
     or p_age_group <> (case when v_age between 50 and 59 then '50s' else '60s' end) then
    raise exception 'Invalid participant information';
  end if;
  update public.single_responses
  set participant_initials = p_participant_initials,
      birth_date = p_birth_date,
      gender = p_gender,
      age_group = p_age_group
  where session_id = p_session_id and experiment_mode = 'single_training1_50_60';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.admin_update_single_5060_participant(uuid,text,date,text,text) from public;
grant execute on function public.admin_update_single_5060_participant(uuid,text,date,text,text) to authenticated;

create or replace function public.admin_delete_single_5060_response(p_id bigint)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then raise exception 'Not allowed'; end if;
  delete from public.single_responses where id = p_id and experiment_mode = 'single_training1_50_60';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.admin_delete_single_5060_response(bigint) from public;
grant execute on function public.admin_delete_single_5060_response(bigint) to authenticated;

create or replace function public.admin_delete_single_5060_session(p_session_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then raise exception 'Not allowed'; end if;
  delete from public.single_responses
  where session_id = p_session_id and experiment_mode = 'single_training1_50_60';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.admin_delete_single_5060_session(uuid) from public;
grant execute on function public.admin_delete_single_5060_session(uuid) to authenticated;
