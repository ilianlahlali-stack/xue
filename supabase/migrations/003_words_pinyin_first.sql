-- Migration du 2026-10-26 : mots en pinyin seul, et caractères qui deviennent des mots.
-- À lancer une fois dans Supabase (SQL Editor > New query > Run). Sans risque à relancer.

-- Un mot peut n'avoir que son pinyin (caractères pas encore appris) ;
-- le pinyin, lui, devient obligatoire pour les nouveaux mots.
alter table words alter column hanzi drop not null;
alter table words drop constraint if exists words_pinyin_required;
alter table words add constraint words_pinyin_required check (btrim(pinyin) <> '') not valid;

-- Un caractère qui s'emploie seul (sans astérisque) est aussi un mot.
-- L'inverse n'est pas vrai : ajouter un mot n'ajoute pas ses caractères.
create or replace function character_to_word() returns trigger as $$
begin
  if not new.is_radical and btrim(new.pinyin) <> '' then
    insert into words (user_id, hanzi, pinyin, translation, created_at)
    values (new.user_id, new.hanzi, new.pinyin, new.meaning, new.created_at)
    on conflict (user_id, hanzi) do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists characters_to_words on characters;
create trigger characters_to_words after insert or update of is_radical on characters
  for each row execute function character_to_word();

-- Rattrapage : les caractères déjà ajoutés qui s'emploient seuls deviennent des mots
-- (un mot qui existe déjà n'est pas modifié).
insert into words (user_id, hanzi, pinyin, translation, created_at)
select user_id, hanzi, pinyin, meaning, created_at
from characters
where not is_radical and btrim(pinyin) <> ''
on conflict (user_id, hanzi) do nothing;
