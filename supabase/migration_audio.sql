-- =============================================================================
-- MIGRATION: ADD 20s AUDIO CLIP SUPPORT FOR QUESTIONS & REALTIME PLAYBACK
-- =============================================================================
-- Run this in Supabase SQL Editor to upgrade an existing database.
-- =============================================================================

-- 1. Add audio columns to questions
alter table public.questions
  add column if not exists audio_url text null,
  add column if not exists audio_start_seconds numeric(8, 2) null,
  add column if not exists audio_duration_seconds numeric(6, 2) null;

-- 2. Add realtime audio playback state to game_sessions
alter table public.game_sessions
  add column if not exists audio_playing boolean not null default false,
  add column if not exists audio_started_at timestamptz null;

-- 3. Update get_public_game_state to return audio_url & audio_duration_seconds
create or replace function public.get_public_game_state(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_question jsonb := null;
  v_progress jsonb := '[]'::jsonb;
begin
  if p_session_id is not null then
    select * into v_session
    from public.game_sessions
    where id = p_session_id;
  else
    select * into v_session
    from public.game_sessions
    order by
      case status
        when 'playing' then 1
        when 'paused' then 2
        when 'pending' then 3
        else 4
      end,
      updated_at desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object(
      'session', null,
      'current_question', null,
      'team_progress', '[]'::jsonb,
      'server_time', now()
    );
  end if;

  if v_session.current_question_id is not null then
    select jsonb_build_object(
      'id', q.id,
      'team', q.team,
      'question_text', q.question_text,
      'question_type', q.question_type,
      'audio_url', q.audio_url,
      'audio_duration_seconds', q.audio_duration_seconds
    )
    into v_question
    from public.questions q
    where q.id = v_session.current_question_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tp.id,
        'session_id', tp.session_id,
        'team', tp.team,
        'question_count', tp.question_count,
        'completed_count', tp.completed_count,
        'correct_count', tp.correct_count,
        'skipped_count', tp.skipped_count
      )
      order by case tp.team when 'red' then 1 when 'green' then 2 else 3 end
    ),
    '[]'::jsonb
  )
  into v_progress
  from public.team_progress tp
  where tp.session_id = v_session.id;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'current_question', v_question,
    'team_progress', v_progress,
    'server_time', now()
  );
end;
$$;

grant execute on function public.get_public_game_state(uuid) to anon, authenticated;

-- 4. Audio playback control RPC for MC
create or replace function public.control_audio(p_session_id uuid, p_action text)
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

  if p_action not in ('play', 'stop') then
    raise exception 'Invalid audio action: %', p_action;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  if v_session.status not in ('playing', 'paused') then
    raise exception 'Cannot control audio when session is %', v_session.status;
  end if;

  if p_action = 'play' then
    update public.game_sessions
    set audio_playing = true, audio_started_at = now()
    where id = p_session_id;
  else
    update public.game_sessions
    set audio_playing = false, audio_started_at = null
    where id = p_session_id;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'server_time', now());
end;
$$;

grant execute on function public.control_audio(uuid, text) to authenticated;

-- 5. Reset audio state when advancing / restarting / ending questions
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
    audio_started_at = null
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
      audio_started_at = null
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
      audio_started_at = null
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
    audio_started_at = null
  where id = p_session_id;

  return jsonb_build_object('restarted', true);
end;
$$;

create or replace function public.end_game_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  update public.game_sessions
  set
    status = 'completed',
    current_question_id = null,
    current_session_question_id = null,
    timer_running = false,
    current_started_at = null,
    paused_remaining_seconds = 0,
    audio_playing = false,
    audio_started_at = null
  where id = p_session_id;

  return jsonb_build_object('ended', true);
end;
$$;

-- 6. Supabase Storage bucket for 20s trimmed question audio clips
insert into storage.buckets (id, name, public)
values ('question-audio', 'question-audio', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read question-audio" on storage.objects;
create policy "Public read question-audio"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'question-audio');

drop policy if exists "Admins upload question-audio" on storage.objects;
create policy "Admins upload question-audio"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'question-audio' and public.is_admin());

drop policy if exists "Admins update question-audio" on storage.objects;
create policy "Admins update question-audio"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'question-audio' and public.is_admin())
  with check (bucket_id = 'question-audio' and public.is_admin());

drop policy if exists "Admins delete question-audio" on storage.objects;
create policy "Admins delete question-audio"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'question-audio' and public.is_admin());

notify pgrst, 'reload schema';
