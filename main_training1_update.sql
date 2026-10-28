alter table public.responses drop constraint if exists responses_experiment_mode_check;
alter table public.responses add constraint responses_experiment_mode_check
  check (experiment_mode in ('main','main_training1','pilot_training1','pilot_training2'));

create or replace function public.submit_trial(
  p_session_id uuid,
  p_participant_code text,
  p_experiment_mode text,
  p_gender text,
  p_age_group text,
  p_training smallint,
  p_pair_id smallint,
  p_trial_index smallint,
  p_a_path text,
  p_b_path text,
  p_chosen_side text,
  p_first_chosen_side text,
  p_confidence smallint,
  p_response_ms integer,
  p_a_plays smallint,
  p_b_plays smallint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_real text; v_fake text; v_ai_side char(1); v_existing public.responses%rowtype;
begin
  if p_session_id is null or p_participant_code !~ '^P-[A-Z0-9]{8}$'
     or p_experiment_mode not in ('main','main_training1','pilot_training1','pilot_training2')
     or (p_experiment_mode in ('main_training1','pilot_training1') and p_training <> 1)
     or (p_experiment_mode = 'pilot_training2' and p_training <> 2)
     or p_gender not in ('male','female')
     or p_age_group not in ('20s','30s')
     or p_training not in (1,2) or p_pair_id is null or p_trial_index not between 1 and 40
     or p_chosen_side not in ('A','B') or p_first_chosen_side not in ('A','B')
     or p_confidence not between 1 and 5
     or p_response_ms not between 0 and 3600000
     or p_a_plays not between 1 and 99 or p_b_plays not between 1 and 99 then
    raise exception 'Invalid answer';
  end if;

  select real_path, fake_path into v_real, v_fake
  from public.stimuli where training = p_training and pair_id = p_pair_id;

  if v_real is null or not (
    (p_a_path = v_real and p_b_path = v_fake) or
    (p_a_path = v_fake and p_b_path = v_real)
  ) then raise exception 'Invalid stimulus pair'; end if;

  v_ai_side := case when p_a_path = v_fake then 'A' else 'B' end;

  select * into v_existing from public.responses
  where session_id = p_session_id and training = p_training and pair_id = p_pair_id;

  if found then
    if v_existing.participant_code = p_participant_code
       and v_existing.experiment_mode = p_experiment_mode
       and v_existing.a_path = p_a_path and v_existing.b_path = p_b_path
       and v_existing.chosen_side = p_chosen_side and v_existing.confidence = p_confidence then
      return jsonb_build_object('saved', true, 'duplicate', true);
    end if;
    raise exception 'This pair already has a different answer';
  end if;

  insert into public.responses(session_id,participant_code,experiment_mode,gender,age_group,training,pair_id,trial_index,
      a_path,b_path,ai_side,chosen_side,first_chosen_side,confidence,response_ms,a_plays,b_plays)
  values(p_session_id,p_participant_code,p_experiment_mode,p_gender,p_age_group,p_training,p_pair_id,p_trial_index,
      p_a_path,p_b_path,v_ai_side,p_chosen_side,p_first_chosen_side,p_confidence,p_response_ms,p_a_plays,p_b_plays);

  return jsonb_build_object('saved', true);
end $$;

revoke all on function public.submit_trial(uuid,text,text,text,text,smallint,smallint,smallint,text,text,text,text,smallint,integer,smallint,smallint) from public;
grant execute on function public.submit_trial(uuid,text,text,text,text,smallint,smallint,smallint,text,text,text,text,smallint,integer,smallint,smallint) to anon, authenticated;

create or replace function public.create_trial_order(
  p_session_id uuid,
  p_experiment_mode text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_expected integer;
begin
  if p_session_id is null
     or p_experiment_mode not in ('main','main_training1','pilot_training1','pilot_training2') then
    raise exception 'Invalid experiment mode';
  end if;

  v_expected := case when p_experiment_mode = 'main' then 40 else 20 end;

  with ranked as (
    select
      s.training,
      s.pair_id,
      s.real_path,
      s.fake_path,
      row_number() over (partition by s.training order by random()) as rn
    from public.stimuli s
    where p_experiment_mode = 'main'
       or (p_experiment_mode in ('main_training1','pilot_training1') and s.training = 1)
       or (p_experiment_mode = 'pilot_training2' and s.training = 2)
  ), blocked as (
    select *, floor((rn - 1) / 2.0)::integer as block_no
    from ranked
  ), block_flips as materialized (
    select training, block_no, random() < 0.5 as flip
    from blocked
    group by training, block_no
  ), oriented as (
    select
      b.training,
      b.pair_id,
      b.rn,
      case when ((mod(b.rn, 2) = 1) = f.flip) then b.fake_path else b.real_path end as a_path,
      case when ((mod(b.rn, 2) = 1) = f.flip) then b.real_path else b.fake_path end as b_path
    from blocked b
    join block_flips f using (training, block_no)
  )
  select jsonb_agg(
    jsonb_build_object(
      'training', training,
      'pairId', pair_id,
      'files', jsonb_build_array(a_path, b_path)
    )
    order by training, rn
  ) into v_result
  from oriented;

  if v_result is null or jsonb_array_length(v_result) <> v_expected then
    raise exception 'Stimulus configuration is incomplete';
  end if;

  return v_result;
end $$;

revoke all on function public.create_trial_order(uuid,text) from public;
grant execute on function public.create_trial_order(uuid,text) to anon, authenticated;
