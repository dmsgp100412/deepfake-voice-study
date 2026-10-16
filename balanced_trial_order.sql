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
     or p_experiment_mode not in ('main','pilot_training1','pilot_training2') then
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
       or (p_experiment_mode = 'pilot_training1' and s.training = 1)
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
