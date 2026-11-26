-- =============================================================================
-- MIGRATION: ALLOW DELETING QUESTIONS REFERENCED BY PAST SESSIONS
-- =============================================================================
-- Run this in Supabase SQL Editor.
-- =============================================================================

alter table public.session_questions
  drop constraint if exists session_questions_question_id_fkey;

alter table public.session_questions
  add constraint session_questions_question_id_fkey
  foreign key (question_id)
  references public.questions(id)
  on delete cascade;

drop policy if exists "Admins can delete session questions" on public.session_questions;
create policy "Admins can delete session questions"
  on public.session_questions for delete
  to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';
