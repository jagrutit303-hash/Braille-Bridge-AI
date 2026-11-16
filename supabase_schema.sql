-- ==============================================================================
-- BrailleBridge AI — Complete Supabase PostgreSQL Schema
-- Project Ref: gxpywyprztshyzpyidnx
-- Paste & Run this entire script in:
-- https://supabase.com/dashboard/project/gxpywyprztshyzpyidnx/sql/new
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Study Plans & Timetable (study_plans)
-- ------------------------------------------------------------------------------
create table if not exists public.study_plans (
  id text primary key default uuid_generate_v4()::text,
  user_id text not null default 'guest_user',
  title text not null,
  date date not null default current_date,
  time text not null default '15:00',
  duration_minutes integer not null default 60,
  subject text not null default 'General Study',
  completed boolean not null default false,
  notes text not null default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_study_plans_user_date on public.study_plans (user_id, date);

-- ------------------------------------------------------------------------------
-- 2. Braille Learning Game Progress (game_progress)
-- ------------------------------------------------------------------------------
create table if not exists public.game_progress (
  id text primary key default 'default_progress',
  user_id text not null default 'guest_user',
  attempts integer not null default 0,
  correct integer not null default 0,
  streak integer not null default 0,
  best_streak integer not null default 0,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_game_progress_user on public.game_progress (user_id);

-- ------------------------------------------------------------------------------
-- 3. Study Notes & Tutoring Summaries (study_notes)
-- ------------------------------------------------------------------------------
create table if not exists public.study_notes (
  id text primary key default uuid_generate_v4()::text,
  user_id text not null default 'guest_user',
  filename text not null,
  title text not null,
  content text not null,
  summary text not null default '',
  takeaways jsonb not null default '[]'::jsonb,
  word_count integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_study_notes_user on public.study_notes (user_id);

-- ------------------------------------------------------------------------------
-- 4. College Notices & Circulars (college_notices)
-- ------------------------------------------------------------------------------
create table if not exists public.college_notices (
  id text primary key default uuid_generate_v4()::text,
  user_id text not null default 'guest_user',
  title text not null,
  summary text not null,
  deadlines jsonb not null default '[]'::jsonb,
  eligibility jsonb not null default '[]'::jsonb,
  required_documents jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_college_notices_user on public.college_notices (user_id);

-- ------------------------------------------------------------------------------
-- 5. User Accessibility & Colorblind Preferences (user_preferences)
-- ------------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id text primary key default 'guest_user',
  is_high_contrast boolean not null default false,
  color_vision_mode text not null default 'standard',
  font_scale numeric not null default 1.0,
  speech_speed numeric not null default 1.0,
  speech_pitch numeric not null default 1.0,
  preferred_voice text not null default '',
  preferred_language text not null default 'en-US',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_preferences
  add column if not exists color_vision_mode text not null default 'standard';

-- ------------------------------------------------------------------------------
-- 6. One-Time Student Accounts (student_accounts)
-- ------------------------------------------------------------------------------
create table if not exists public.student_accounts (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  salt text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_student_accounts_email on public.student_accounts (email);

-- ------------------------------------------------------------------------------
-- 7. Student Login Sessions (student_sessions)
-- ------------------------------------------------------------------------------
create table if not exists public.student_sessions (
  token text primary key,
  user_id text not null references public.student_accounts(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_student_sessions_user on public.student_sessions (user_id);

-- ------------------------------------------------------------------------------
-- 8. Script Knowledge Vault Bookmarks (script_vault_bookmarks)
-- ------------------------------------------------------------------------------
create table if not exists public.script_vault_bookmarks (
  user_id text primary key default 'guest_user',
  items jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- Schema & Data API Permissions + Row-Level Security (RLS)
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.study_plans to anon, authenticated;
grant select, insert, update, delete on public.game_progress to anon, authenticated;
grant select, insert, update, delete on public.study_notes to anon, authenticated;
grant select, insert, update, delete on public.college_notices to anon, authenticated;
grant select, insert, update, delete on public.user_preferences to anon, authenticated;
grant select, insert, update, delete on public.student_accounts to anon, authenticated;
grant select, insert, update, delete on public.student_sessions to anon, authenticated;
grant select, insert, update, delete on public.script_vault_bookmarks to anon, authenticated;

alter table public.study_plans enable row level security;
alter table public.game_progress enable row level security;
alter table public.study_notes enable row level security;
alter table public.college_notices enable row level security;
alter table public.user_preferences enable row level security;
alter table public.student_accounts enable row level security;
alter table public.student_sessions enable row level security;
alter table public.script_vault_bookmarks enable row level security;

drop policy if exists "Allow all operations for study_plans" on public.study_plans;
create policy "Allow all operations for study_plans"
  on public.study_plans for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for game_progress" on public.game_progress;
create policy "Allow all operations for game_progress"
  on public.game_progress for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for study_notes" on public.study_notes;
create policy "Allow all operations for study_notes"
  on public.study_notes for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for college_notices" on public.college_notices;
create policy "Allow all operations for college_notices"
  on public.college_notices for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for user_preferences" on public.user_preferences;
create policy "Allow all operations for user_preferences"
  on public.user_preferences for all to anon, authenticated using (true) with check (true);

-- Note: For production deployment, set SUPABASE_SERVICE_ROLE_KEY in .env
-- and restrict student_accounts / student_sessions policies away from anon.
drop policy if exists "Allow all operations for student_accounts" on public.student_accounts;
create policy "Allow all operations for student_accounts"
  on public.student_accounts for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for student_sessions" on public.student_sessions;
create policy "Allow all operations for student_sessions"
  on public.student_sessions for all to anon, authenticated using (true) with check (true);

drop policy if exists "Allow all operations for script_vault_bookmarks" on public.script_vault_bookmarks;
create policy "Allow all operations for script_vault_bookmarks"
  on public.script_vault_bookmarks for all to anon, authenticated using (true) with check (true);

-- Reload PostgREST schema cache immediately
notify pgrst, 'reload schema';
