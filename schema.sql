-- Run this once in the Supabase SQL editor. Then run the private seed SQL separately.
-- The private real/fake mapping must NEVER be committed to this public repository.
create table if not exists public.stimuli (
  training smallint not null check (training in (1,2)),
  pair_id smallint not null check (pair_id between 1 and 99),
  real_path text not null unique,
  fake_path text not null unique,
  primary key (training, pair_id)
);

create table if not exists public.responses (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  participant_code text not null,
  training smallint not null check (training in (1,2)),
  pair_id smallint not null,
  trial_index smallint not null check (trial_index between 1 and 40),
  a_path text not null,
  b_path text not null,
  ai_side char(1) not null check (ai_side in ('A','B')),
  chosen_side char(1) not null check (chosen_side in ('A','B')),
  is_correct boolean generated always as (ai_side = chosen_side) stored,
  confidence smallint not null check (confidence between 1 and 5),
  response_ms integer not null check (response_ms between 0 and 3600000),
  a_plays smallint not null check (a_plays between 1 and 99),
  b_plays smallint not null check (b_plays between 1 and 99),
  created_at timestamptz not null default now(),
  unique (session_id, training, pair_id),
  foreign key (training, pair_id) references public.stimuli(training, pair_id)
);
create index if not exists responses_training_pair_idx on public.responses(training,pair_id);
create index if not exists responses_session_idx on public.responses(session_id);

alter table public.stimuli enable row level security;
alter table public.responses enable row level security;
revoke all on public.stimuli from anon, authenticated;
revoke all on public.responses from anon, authenticated;
-- Admin access requires a verified Supabase Auth session for this account.
grant select on public.responses to authenticated;
create policy "research owner reads responses" on public.responses
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'dmsgp100412@gmail.com');

create or replace function public.submit_trial(
  p_session_id uuid,
  p_participant_code text,
  p_training smallint,
  p_pair_id smallint,
  p_trial_index smallint,
  p_a_path text,
  p_b_path text,
  p_chosen_side text,
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
     or p_training not in (1,2) or p_pair_id is null or p_trial_index not between 1 and 40
     or p_chosen_side not in ('A','B') or p_confidence not between 1 and 5
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
       and v_existing.a_path = p_a_path and v_existing.b_path = p_b_path
       and v_existing.chosen_side = p_chosen_side and v_existing.confidence = p_confidence then
      return jsonb_build_object('saved', true, 'duplicate', true);
    end if;
    raise exception 'This pair already has a different answer';
  end if;
  insert into public.responses(session_id,participant_code,training,pair_id,trial_index,
      a_path,b_path,ai_side,chosen_side,confidence,response_ms,a_plays,b_plays)
  values(p_session_id,p_participant_code,p_training,p_pair_id,p_trial_index,
      p_a_path,p_b_path,v_ai_side,p_chosen_side,p_confidence,p_response_ms,p_a_plays,p_b_plays);
  return jsonb_build_object('saved', true);
end $$;
revoke all on function public.submit_trial(uuid,text,smallint,smallint,smallint,text,text,text,smallint,integer,smallint,smallint) from public;
grant execute on function public.submit_trial(uuid,text,smallint,smallint,smallint,text,text,text,smallint,integer,smallint,smallint) to anon, authenticated;
