create table if not exists public.single_responses (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  participant_code text not null,
  participant_initials text not null check (participant_initials ~ '^[A-Z]{2,6}$'),
  birth_date date not null,
  gender text not null check (gender in ('male','female')),
  age_group text not null check (age_group in ('20s','30s')),
  experiment_mode text not null default 'single_training1' check (experiment_mode = 'single_training1'),
  trial_index smallint not null check (trial_index between 1 and 40),
  pair_id smallint not null,
  audio_path text not null,
  actual_label text not null check (actual_label in ('real','ai')),
  chosen_label text not null check (chosen_label in ('real','ai')),
  is_correct boolean generated always as (actual_label = chosen_label) stored,
  confidence smallint not null check (confidence between 1 and 5),
  response_ms integer not null check (response_ms between 0 and 3600000),
  plays smallint not null check (plays between 1 and 2),
  created_at timestamptz not null default now(),
  unique (session_id, trial_index),
  unique (session_id, pair_id, audio_path)
);

create index if not exists single_responses_session_idx on public.single_responses(session_id);
create index if not exists single_responses_item_idx on public.single_responses(pair_id, actual_label);

alter table public.single_responses enable row level security;
revoke all on public.single_responses from anon, authenticated;
grant select on public.single_responses to authenticated;

drop policy if exists "research owner reads single responses" on public.single_responses;
create policy "research owner reads single responses" on public.single_responses
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'dmsgp100412@gmail.com');

create or replace function public.create_single_trial_order(
  p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_has_adjacent_pair boolean := true;
  v_attempt integer := 0;
begin
  if p_session_id is null then
    raise exception 'Invalid session';
  end if;

  while v_has_adjacent_pair and v_attempt < 50 loop
    v_attempt := v_attempt + 1;

    with randomized_pairs as materialized (
      select
        s.pair_id,
        s.real_path,
        s.fake_path,
        row_number() over (order by random())::integer as rn
      from public.stimuli s
      where s.training = 1
    ), rotation as materialized (
      select (floor(random() * 19) + 1)::integer as shift_no
    ), clips as (
      select p.rn as block_no, p.pair_id, p.real_path as audio_path, 'real'::text as answer_label
      from randomized_pairs p
      union all
      select (((p.rn - 1 + r.shift_no) % 20) + 1)::integer as block_no,
             p.pair_id, p.fake_path as audio_path, 'ai'::text as answer_label
      from randomized_pairs p
      cross join rotation r
    ), flips as materialized (
      select block_no, random() < 0.5 as ai_first
      from clips
      group by block_no
    ), ordered as (
      select
        c.pair_id,
        c.audio_path,
        c.block_no,
        case when (c.answer_label = 'ai') = f.ai_first then 1 else 2 end as within_block
      from clips c
      join flips f using (block_no)
    )
    select jsonb_agg(
      jsonb_build_object('pairId', pair_id, 'audioPath', audio_path)
      order by block_no, within_block
    ) into v_result
    from ordered;

    select exists (
      select 1
      from jsonb_array_elements(v_result) with ordinality a(item, ord)
      join jsonb_array_elements(v_result) with ordinality b(item, ord)
        on b.ord = a.ord + 1
      where a.item ->> 'pairId' = b.item ->> 'pairId'
    ) into v_has_adjacent_pair;
  end loop;

  if v_result is null or jsonb_array_length(v_result) <> 40 or v_has_adjacent_pair then
    raise exception 'Training 1 stimuli are incomplete';
  end if;

  return v_result;
end $$;

revoke all on function public.create_single_trial_order(uuid) from public;
grant execute on function public.create_single_trial_order(uuid) to anon, authenticated;

create or replace function public.submit_single_trial(
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
     or v_age not between 20 and 39
     or p_age_group <> (case when v_age between 20 and 29 then '20s' else '30s' end)
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
    if v_existing.pair_id = p_pair_id
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
    p_gender, p_age_group, 'single_training1', p_trial_index, p_pair_id,
    p_audio_path, v_actual_label, p_chosen_label, p_confidence,
    p_response_ms, p_plays
  );

  return jsonb_build_object('saved', true);
end $$;

revoke all on function public.submit_single_trial(uuid,text,text,date,text,text,smallint,smallint,text,text,smallint,integer,smallint) from public;
grant execute on function public.submit_single_trial(uuid,text,text,date,text,text,smallint,smallint,text,text,smallint,integer,smallint) to anon, authenticated;
