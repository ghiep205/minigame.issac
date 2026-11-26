-- =============================================================================
-- LIVE TEAM QUIZ MINIGAME - SUPABASE SCHEMA, RLS, REALTIME & ATOMIC RPCS
-- =============================================================================
-- Execute this entire script in the Supabase SQL Editor.
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ADMIN / OPERATOR PROFILES
-- -----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'admin' check (role in ('admin', 'mc')),
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;

-- Helper functions for authorization
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role in ('admin', 'mc')
  );
$$;

create policy "Users can view own profile"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Admins can manage all profiles"
  on public.admin_profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. QUESTIONS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  team text not null check (team in ('red', 'green', 'blue')),
  question_text text not null check (char_length(trim(question_text)) > 0),
  question_type text not null default 'oral',
  answer_text text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_questions_team_active on public.questions (team, is_active);
create index if not exists idx_questions_created_at on public.questions (created_at desc);

alter table public.questions enable row level security;

create policy "Operators can read all questions"
  on public.questions for select
  to authenticated
  using (public.is_operator());

create policy "Admins can insert questions"
  on public.questions for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update questions"
  on public.questions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete questions"
  on public.questions for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. GAME SESSIONS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  session_name text not null check (char_length(trim(session_name)) > 0),
  game_mode text not null default 'standard',
  questions_per_team integer not null default 15 check (questions_per_team >= 1 and questions_per_team <= 50),
  status text not null default 'pending' check (status in ('pending', 'playing', 'paused', 'completed')),
  current_team text not null default 'red' check (current_team in ('red', 'green', 'blue')),
  current_question_id uuid null references public.questions(id) on delete set null,
  current_session_question_id uuid null,
  current_question_number integer not null default 0,
  current_started_at timestamptz null,
  timer_duration integer not null default 25 check (timer_duration >= 5 and timer_duration <= 300),
  timer_running boolean not null default false,
  paused_remaining_seconds numeric(8, 2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_game_sessions_status on public.game_sessions (status);
create index if not exists idx_game_sessions_created_at on public.game_sessions (created_at desc);

alter table public.game_sessions enable row level security;

-- Public read-only access for projector display (/game)
create policy "Public can read game sessions"
  on public.game_sessions for select
  to anon, authenticated
  using (true);

create policy "Operators can update game sessions"
  on public.game_sessions for update
  to authenticated
  using (public.is_operator())
  with check (public.is_operator());

create policy "Admins can insert and delete game sessions"
  on public.game_sessions for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can delete game sessions"
  on public.game_sessions for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. SESSION QUESTIONS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  team text not null check (team in ('red', 'green', 'blue')),
  sequence_number integer not null check (sequence_number >= 1),
  status text not null default 'pending' check (status in ('pending', 'active', 'answered_correctly', 'skipped', 'expired')),
  used_at timestamptz null,
  result text null check (result in ('correct', 'incorrect', 'skipped', 'timeout')),
  constraint uq_session_question unique (session_id, question_id),
  constraint uq_session_team_seq unique (session_id, team, sequence_number)
);

create index if not exists idx_session_questions_lookup
  on public.session_questions (session_id, team, status, sequence_number);

alter table public.session_questions enable row level security;

create policy "Public can read session questions"
  on public.session_questions for select
  to anon, authenticated
  using (true);

create policy "Operators can update session questions"
  on public.session_questions for update
  to authenticated
  using (public.is_operator())
  with check (public.is_operator());

-- -----------------------------------------------------------------------------
-- 5. TEAM PROGRESS TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.team_progress (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  team text not null check (team in ('red', 'green', 'blue')),
  question_count integer not null default 15,
  completed_count integer not null default 0,
  correct_count integer not null default 0,
  skipped_count integer not null default 0,
  constraint uq_team_progress_session_team unique (session_id, team)
);

create index if not exists idx_team_progress_session on public.team_progress (session_id);

alter table public.team_progress enable row level security;

create policy "Public can read team progress"
  on public.team_progress for select
  to anon, authenticated
  using (true);

create policy "Operators can update team progress"
  on public.team_progress for update
  to authenticated
  using (public.is_operator())
  with check (public.is_operator());

-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_questions_updated_at on public.questions;
create trigger trg_questions_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_game_sessions_updated_at on public.game_sessions;
create trigger trg_game_sessions_updated_at
  before update on public.game_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. SERVER TIME & PUBLIC GAME STATE RPCS
-- -----------------------------------------------------------------------------
create or replace function public.get_server_time()
returns timestamptz
language sql
volatile
as $$
  select now();
$$;

grant execute on function public.get_server_time() to anon, authenticated;

-- Public-safe game state (omits answer_text and notes)
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
    -- Prefer active playing/paused session, then pending, then most recent completed
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
      'question_type', q.question_type
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

-- -----------------------------------------------------------------------------
-- 8. ATOMIC GAME LIFECYCLE & CONTROL RPCS
-- -----------------------------------------------------------------------------
create or replace function public.create_game_session(
  p_session_name text,
  p_questions_per_team integer default 15,
  p_timer_duration integer default 25,
  p_game_mode text default 'standard',
  p_auto_start boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_team text;
  v_count integer;
  v_first_sq public.session_questions%rowtype;
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  if trim(coalesce(p_session_name, '')) = '' then
    raise exception 'Session name is required';
  end if;

  -- Verify active question counts for all 3 teams
  foreach v_team in array array['red', 'green', 'blue'] loop
    select count(*) into v_count
    from public.questions
    where team = v_team and is_active = true;

    if v_count < p_questions_per_team then
      raise exception 'Insufficient active questions for team %: found %, need %',
        v_team, v_count, p_questions_per_team;
    end if;
  end loop;

  insert into public.game_sessions (
    session_name,
    game_mode,
    questions_per_team,
    status,
    current_team,
    current_question_number,
    timer_duration,
    timer_running,
    paused_remaining_seconds
  )
  values (
    trim(p_session_name),
    coalesce(nullif(trim(p_game_mode), ''), 'standard'),
    p_questions_per_team,
    'pending',
    'red',
    0,
    p_timer_duration,
    false,
    p_timer_duration
  )
  returning id into v_session_id;

  -- Randomly select & persist questions per team without duplicates
  foreach v_team in array array['red', 'green', 'blue'] loop
    insert into public.session_questions (session_id, question_id, team, sequence_number, status)
    select
      v_session_id,
      q.id,
      v_team,
      row_number() over (),
      'pending'
    from (
      select id
      from public.questions
      where team = v_team and is_active = true
      order by random()
      limit p_questions_per_team
    ) q;

    insert into public.team_progress (session_id, team, question_count, completed_count, correct_count, skipped_count)
    values (v_session_id, v_team, p_questions_per_team, 0, 0, 0);
  end loop;

  if p_auto_start then
    select * into v_first_sq
    from public.session_questions
    where session_id = v_session_id and team = 'red' and status = 'pending'
    order by sequence_number asc
    limit 1;

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
      paused_remaining_seconds = p_timer_duration
    where id = v_session_id;
  end if;

  return v_session_id;
end;
$$;

grant execute on function public.create_game_session(text, integer, integer, text, boolean) to authenticated;

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
    paused_remaining_seconds = v_session.timer_duration
  where id = p_session_id;

  return jsonb_build_object('started', true, 'session_id', p_session_id);
end;
$$;

grant execute on function public.start_game_session(uuid) to authenticated;

create or replace function public.control_timer(p_session_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.game_sessions%rowtype;
  v_remaining numeric(8, 2);
begin
  if not public.is_operator() then
    raise exception 'Unauthorized: operator role required';
  end if;

  if p_action not in ('start', 'pause', 'resume', 'reset') then
    raise exception 'Invalid timer action: %', p_action;
  end if;

  select * into v_session
  from public.game_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Game session not found';
  end if;

  if v_session.status in ('pending', 'completed') then
    raise exception 'Cannot control timer when session is %', v_session.status;
  end if;

  if p_action = 'start' then
    update public.game_sessions
    set
      status = 'playing',
      timer_running = true,
      current_started_at = now(),
      paused_remaining_seconds = null
    where id = p_session_id;
  elsif p_action = 'pause' then
    if v_session.timer_running and v_session.current_started_at is not null then
      v_remaining := greatest(
        0,
        round((v_session.timer_duration - extract(epoch from (now() - v_session.current_started_at)))::numeric, 2)
      );
    else
      v_remaining := coalesce(v_session.paused_remaining_seconds, v_session.timer_duration);
    end if;

    update public.game_sessions
    set
      status = 'paused',
      timer_running = false,
      current_started_at = null,
      paused_remaining_seconds = v_remaining
    where id = p_session_id;
  elsif p_action = 'resume' then
    v_remaining := coalesce(v_session.paused_remaining_seconds, v_session.timer_duration);

    update public.game_sessions
    set
      status = 'playing',
      timer_running = true,
      current_started_at = now() - ((v_session.timer_duration - v_remaining) * interval '1 second'),
      paused_remaining_seconds = null
    where id = p_session_id;
  elsif p_action = 'reset' then
    update public.game_sessions
    set
      status = 'playing',
      timer_running = false,
      current_started_at = null,
      paused_remaining_seconds = v_session.timer_duration
    where id = p_session_id;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'server_time', now());
end;
$$;

grant execute on function public.control_timer(uuid, text) to authenticated;

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

  -- Double-click / race-condition guard
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

  -- Determine next team in Red -> Green -> Blue order
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
      paused_remaining_seconds = v_session.timer_duration
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
      paused_remaining_seconds = 0
    where id = p_session_id;

    return jsonb_build_object(
      'advanced', true,
      'completed', true
    );
  end if;
end;
$$;

grant execute on function public.submit_question_result(uuid, uuid, text) to authenticated;

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
    paused_remaining_seconds = v_session.timer_duration
  where id = p_session_id;

  return jsonb_build_object('restarted', true);
end;
$$;

grant execute on function public.restart_game_session(uuid) to authenticated;

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
    paused_remaining_seconds = 0
  where id = p_session_id;

  return jsonb_build_object('ended', true);
end;
$$;

grant execute on function public.end_game_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. REALTIME PUBLICATION
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_sessions'
  ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_progress'
  ) then
    alter publication supabase_realtime add table public.team_progress;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_questions'
  ) then
    alter publication supabase_realtime add table public.session_questions;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 10. SCHEMA & TABLE GRANTS
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.game_sessions, public.session_questions, public.team_progress to anon;
notify pgrst, 'reload schema';

