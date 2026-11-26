-- =============================================================================
-- MIGRATION: RECORD LAST QUESTION RESULT ON GAME_SESSIONS FOR STAGE FEEDBACK
-- =============================================================================
alter table public.game_sessions
  add column if not exists last_result text null check (last_result in ('correct', 'incorrect', 'skipped', 'timeout')),
  add column if not exists last_result_team text null check (last_result_team in ('red', 'green', 'blue')),
  add column if not exists last_result_at timestamptz null;

create or replace function public.start_game_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_first_sq public.session_questions%rowtype;
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  if v_session.status <> 'pending' then
    return jsonb_build_object('started', false, 'reason', 'Session is already ' || v_session.status);
  end if;

  select * into v_first_sq
  from public.session_questions
  where session_id = p_session_id and team = 'red' and status = 'pending'
  order by sequence_number asc
  limit 1;

  if not found then
    raise exception 'No pending questions found for session';
  end if;

  update public.session_questions
  set status = 'active'
  where id = v_first_sq.id;

  update public.game_sessions
  set
    status = 'playing',
    current_team = 'red',
    current_question_id = v_first_sq.question_id,
    current_session_question_id = v_first_sq.id,
    current_question_number = 1,
    timer_running = false,
    current_started_at = null,
    paused_remaining_seconds = v_session.timer_duration,
    audio_playing = false,
    audio_started_at = null,
    last_result = null,
    last_result_team = null,
    last_result_at = null
  where id = p_session_id;

  return jsonb_build_object('started', true, 'session_id', p_session_id);
end;
$$;

create or replace function public.submit_question_result(
  p_session_id uuid,
  p_expected_session_question_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_sq_status text;
  v_teams text[] := array['red', 'green', 'blue'];
  v_curr_idx integer;
  v_offset integer;
  v_candidate_team text;
  v_next_sq public.session_questions%rowtype;
  v_found_next boolean := false;
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  if p_outcome not in ('correct', 'incorrect', 'skipped', 'timeout') then
    raise exception 'Invalid outcome: %', p_outcome;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  if v_session.status not in ('playing', 'paused') then
    return jsonb_build_object('advanced', false, 'reason', 'session_not_active');
  end if;

  if v_session.current_session_question_id is distinct from p_expected_session_question_id then
    return jsonb_build_object('advanced', false, 'reason', 'already_advanced');
  end if;

  v_sq_status := case p_outcome
    when 'correct' then 'answered_correctly'
    when 'timeout' then 'expired'
    else 'skipped'
  end;

  update public.session_questions
  set
    status = v_sq_status,
    result = p_outcome,
    used_at = now()
  where id = p_expected_session_question_id;

  update public.team_progress
  set
    completed_count = completed_count + 1,
    correct_count = correct_count + (case when p_outcome = 'correct' then 1 else 0 end),
    skipped_count = skipped_count + (case when p_outcome <> 'correct' then 1 else 0 end)
  where session_id = p_session_id
    and team = v_session.current_team;

  v_curr_idx := case v_session.current_team
    when 'red' then 1
    when 'green' then 2
    else 3
  end;

  for v_offset in 1..3 loop
    v_candidate_team := v_teams[((v_curr_idx - 1 + v_offset) % 3) + 1];

    select * into v_next_sq
    from public.session_questions
    where session_id = p_session_id
      and team = v_candidate_team
      and status = 'pending'
    order by sequence_number asc
    limit 1;

    if found then
      v_found_next := true;
      exit;
    end if;
  end loop;

  if v_found_next then
    update public.session_questions
    set status = 'active'
    where id = v_next_sq.id;

    update public.game_sessions
    set
      status = 'playing',
      current_team = v_candidate_team,
      current_question_id = v_next_sq.question_id,
      current_session_question_id = v_next_sq.id,
      current_question_number = v_session.current_question_number + 1,
      timer_running = false,
      current_started_at = null,
      paused_remaining_seconds = v_session.timer_duration,
      audio_playing = false,
      audio_started_at = null,
      last_result = p_outcome,
      last_result_team = v_session.current_team,
      last_result_at = now()
    where id = p_session_id;

    return jsonb_build_object(
      'advanced', true,
      'completed', false,
      'next_team', v_candidate_team,
      'next_question_number', v_session.current_question_number + 1
    );
  else
    update public.game_sessions
    set
      status = 'completed',
      current_question_id = null,
      current_session_question_id = null,
      timer_running = false,
      current_started_at = null,
      paused_remaining_seconds = 0,
      audio_playing = false,
      audio_started_at = null,
      last_result = p_outcome,
      last_result_team = v_session.current_team,
      last_result_at = now()
    where id = p_session_id;

    return jsonb_build_object(
      'advanced', true,
      'completed', true
    );
  end if;
end;
$$;

create or replace function public.restart_game_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  update public.session_questions
  set status = 'pending', used_at = null, result = null
  where session_id = p_session_id;

  update public.team_progress
  set completed_count = 0, correct_count = 0, skipped_count = 0
  where session_id = p_session_id;

  update public.game_sessions
  set
    status = 'pending',
    current_team = 'red',
    current_question_id = null,
    current_session_question_id = null,
    current_question_number = 0,
    timer_running = false,
    current_started_at = null,
    paused_remaining_seconds = v_session.timer_duration,
    audio_playing = false,
    audio_started_at = null,
    last_result = null,
    last_result_team = null,
    last_result_at = null
  where id = p_session_id;

  return jsonb_build_object('restarted', true);
end;
$$;

notify pgrst, 'reload schema';

