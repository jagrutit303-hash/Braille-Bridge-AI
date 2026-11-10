-- ==============================================================================
-- BrailleBridge AI — Supabase Database Schema
-- Run this script in the Supabase SQL Editor to set up all tables and security policies.
-- ==============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Study Plans & Timetable (study_plans)
-- Stores scheduled study sessions, topics, completion status, and notes.
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
  notes text default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast user queries
create index if not exists idx_study_plans_user_date on public.study_plans (user_id, date);

-- ------------------------------------------------------------------------------
-- 2. Braille Learning Game Progress (game_progress)
-- Stores attempts, accuracy, current streak, best streak, and recent answer records.
-- ------------------------------------------------------------------------------
create table if not exists public.game_progress (
  id text primary key default 'default_progress',
  user_id text not null default 'guest_user',
  attempts integer not null default 0,
  correct integer not null default 0,
  streak integer not null default 0,
  best_streak integer not null default 0,
  history jsonb default '[]'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_game_progress_user on public.game_progress (user_id);

-- ------------------------------------------------------------------------------
-- 3. Study Notes & Tutoring Summaries (study_notes)
-- Stores extracted study notes, key takeaways, and Q&A history.
-- ------------------------------------------------------------------------------
create table if not exists public.study_notes (
  id text primary key default uuid_generate_v4()::text,
  user_id text not null default 'guest_user',
  filename text not null,
  title text not null,
  content text not null,
  summary text default '',
  takeaways jsonb default '[]'::jsonb,
  word_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_study_notes_user on public.study_notes (user_id);

-- ------------------------------------------------------------------------------
-- 4. College Notices & Circulars (college_notices)
-- Stores analyzed university notices, extracted deadlines, and required document checklists.
-- ------------------------------------------------------------------------------
create table if not exists public.college_notices (
  id text primary key default uuid_generate_v4()::text,
  user_id text not null default 'guest_user',
  title text not null,
  summary text not null,
  deadlines jsonb default '[]'::jsonb,
  eligibility jsonb default '[]'::jsonb,
  required_documents jsonb default '[]'::jsonb,
  next_steps jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_college_notices_user on public.college_notices (user_id);

-- ------------------------------------------------------------------------------
-- 5. User Accessibility Preferences (user_preferences)
-- Stores high contrast theme, font scale, speech speed, preferred voice and language.
-- ------------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id text primary key default 'guest_user',
  is_high_contrast boolean not null default false,
  font_scale numeric not null default 1.0,
  speech_speed numeric not null default 1.0,
  speech_pitch numeric not null default 1.0,
  preferred_voice text default '',
  preferred_language text not null default 'en-US',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- Row-Level Security (RLS)
-- Enables secure client-side access for both anonymous and authenticated users.
-- ------------------------------------------------------------------------------
alter table public.study_plans enable row level security;
alter table public.game_progress enable row level security;
alter table public.study_notes enable row level security;
alter table public.college_notices enable row level security;
alter table public.user_preferences enable row level security;

-- Permissive public policies for demo & student ease-of-use
create policy "Allow all operations for study_plans" on public.study_plans for all using (true) with check (true);
create policy "Allow all operations for game_progress" on public.game_progress for all using (true) with check (true);
create policy "Allow all operations for study_notes" on public.study_notes for all using (true) with check (true);
create policy "Allow all operations for college_notices" on public.college_notices for all using (true) with check (true);
create policy "Allow all operations for user_preferences" on public.user_preferences for all using (true) with check (true);

