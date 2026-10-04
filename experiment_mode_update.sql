alter table public.responses add column if not exists experiment_mode text;

update public.responses r
set experiment_mode = 'pilot_training1'
where experiment_mode is null
  and r.session_id in (
    select session_id
    from public.responses
    group by session_id
    having bool_and(training = 1)
  );

update public.responses
set experiment_mode = 'main'
where experiment_mode is null;

alter table public.responses alter column experiment_mode set default 'main';
alter table public.responses alter column experiment_mode set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'responses_experiment_mode_check') then
    alter table public.responses add constraint responses_experiment_mode_check check (experiment_mode in ('main','pilot_training1'));
  end if;
end $$;

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
     or p_experiment_mode not in ('main','pilot_training1')
     or (p_experiment_mode = 'pilot_training1' and p_training <> 1)
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

create or replace function public.admin_update_participant(p_session_id uuid, p_gender text, p_age_group text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.jwt() ->> 'email','') <> 'dmsgp100412@gmail.com' then raise exception 'Not allowed'; end if;
  if p_gender not in ('male','female') or p_age_group not in ('20s','30s') then raise exception 'Invalid demographic'; end if;
  update public.responses set gender = p_gender, age_group = p_age_group where session_id = p_session_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.admin_update_participant(uuid,text,text) from public;
grant execute on function public.admin_update_participant(uuid,text,text) to authenticated;
