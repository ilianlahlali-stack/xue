-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Safe to re-run: every statement is idempotent.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Mots connus
-- ---------------------------------------------------------------------------
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hanzi text not null,
  pinyin text not null default '',
  translation text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'practice')),
  created_at timestamptz not null default now(),
  unique (user_id, hanzi)
);

-- ---------------------------------------------------------------------------
-- Caractères connus
-- ---------------------------------------------------------------------------
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hanzi text not null check (char_length(hanzi) = 1),
  pinyin text not null default '',
  meaning text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, hanzi)
);

-- ---------------------------------------------------------------------------
-- Cartes de révision (FSRS). Une carte appartient soit à un mot, soit à un
-- caractère ; elles sont créées par trigger et supprimées en cascade.
-- fsrs = null tant que la carte n'a jamais été révisée (carte "nouvelle").
-- ---------------------------------------------------------------------------
create table if not exists review_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id uuid references words(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  mode text not null check (mode in ('recognition', 'production', 'writing')),
  fsrs jsonb,
  due timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((word_id is null) <> (character_id is null)),
  unique (word_id, mode),
  unique (character_id, mode)
);

create index if not exists review_cards_user_due_idx on review_cards (user_id, due);

create table if not exists review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references review_cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now()
);

create index if not exists review_logs_user_time_idx on review_logs (user_id, reviewed_at);

create or replace function create_word_cards() returns trigger as $$
begin
  insert into review_cards (user_id, word_id, mode)
  values (new.user_id, new.id, 'recognition'), (new.user_id, new.id, 'production')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists words_create_cards on words;
create trigger words_create_cards after insert on words
  for each row execute function create_word_cards();

create or replace function create_character_cards() returns trigger as $$
begin
  insert into review_cards (user_id, character_id, mode)
  values (new.user_id, new.id, 'writing')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists characters_create_cards on characters;
create trigger characters_create_cards after insert on characters
  for each row execute function create_character_cards();

-- ---------------------------------------------------------------------------
-- Structure (grammaire) : arborescence libre de sections, contenu BlockNote.
-- ---------------------------------------------------------------------------
create table if not exists grammar_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references grammar_sections(id) on delete cascade,
  title text not null default 'Sans titre',
  icon text,
  content jsonb,
  position double precision not null default 0,
  include_in_practice boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grammar_sections_user_parent_idx on grammar_sections (user_id, parent_id);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists grammar_sections_touch on grammar_sections;
create trigger grammar_sections_touch before update on grammar_sections
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Practice : conversations avec l'IA
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  topic text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists conversations_touch on conversations;
create trigger conversations_touch before update on conversations
  for each row execute function touch_updated_at();

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security : chaque ligne n'est visible que par son propriétaire.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['words', 'characters', 'review_cards', 'review_logs',
                           'grammar_sections', 'conversations', 'messages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;
