-- Migration du 2026-10-26 : classificateurs (量词).
-- À lancer une fois dans Supabase (SQL Editor > New query > Run). Sans risque à relancer.

create table if not exists classifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pinyin text not null check (btrim(pinyin) <> ''),
  hanzi text, -- facultatif, comme pour les mots
  applies_to text not null default '', -- ce à quoi il s'applique : « animaux », « livres »…
  examples text not null default '', -- une phrase d'exemple par ligne
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists classifiers_user_idx on classifiers (user_id, created_at);

alter table classifiers enable row level security;
drop policy if exists "own rows" on classifiers;
create policy "own rows" on classifiers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
