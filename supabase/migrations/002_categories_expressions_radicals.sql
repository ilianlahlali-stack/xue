-- Migration du 2026-10-26 : catégories de mots, expressions, radicaux.
-- À lancer une fois dans Supabase (SQL Editor > New query > Run) sur une base
-- créée avec l'ancien schema.sql. Sans risque à relancer. Les tags existants
-- deviennent des catégories ; la colonne tags est conservée telle quelle.

-- Mots : expressions toutes faites / chengyu, avec leur sens littéral
alter table words add column if not exists kind text not null default 'word';
alter table words drop constraint if exists words_kind_check;
alter table words add constraint words_kind_check check (kind in ('word', 'expression'));
alter table words add column if not exists literal text not null default '';

-- Caractères qui ne sont que des radicaux (affichés avec un astérisque)
alter table characters add column if not exists is_radical boolean not null default false;

-- Catégories créées par l'utilisateur ; un mot peut en avoir plusieurs
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists word_categories (
  word_id uuid not null references words(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (word_id, category_id)
);

create index if not exists word_categories_category_idx on word_categories (category_id);

-- Les anciens tags deviennent des catégories
insert into categories (user_id, name)
select distinct w.user_id, trim(t.tag)
from words w
cross join lateral unnest(w.tags) as t(tag)
where trim(t.tag) <> ''
on conflict (user_id, name) do nothing;

insert into word_categories (word_id, category_id, user_id)
select w.id, c.id, w.user_id
from words w
cross join lateral unnest(w.tags) as t(tag)
join categories c on c.user_id = w.user_id and c.name = trim(t.tag)
on conflict do nothing;

-- Sécurité : chacun ne voit que ses catégories
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'word_categories']
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
