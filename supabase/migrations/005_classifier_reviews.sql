-- Migration du 2026-10-26 : révisions des classificateurs.
-- À lancer une fois dans Supabase (SQL Editor > New query > Run). Sans risque à relancer.

-- Une carte de révision peut maintenant appartenir à un classificateur.
alter table review_cards add column if not exists classifier_id uuid references classifiers(id) on delete cascade;
alter table review_cards drop constraint if exists review_cards_check;
alter table review_cards drop constraint if exists review_cards_one_item;
alter table review_cards add constraint review_cards_one_item
  check (num_nonnulls(word_id, character_id, classifier_id) = 1);

do $$
begin
  alter table review_cards add constraint review_cards_classifier_id_mode_key unique (classifier_id, mode);
exception when duplicate_object or duplicate_table then null;
end;
$$;

-- Chaque classificateur ajouté reçoit sa carte (« quel classificateur pour… ? »).
create or replace function create_classifier_cards() returns trigger as $$
begin
  insert into review_cards (user_id, classifier_id, mode)
  values (new.user_id, new.id, 'production')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists classifiers_create_cards on classifiers;
create trigger classifiers_create_cards after insert on classifiers
  for each row execute function create_classifier_cards();

-- Rattrapage : une carte pour chaque classificateur déjà ajouté.
insert into review_cards (user_id, classifier_id, mode)
select user_id, id, 'production' from classifiers
on conflict do nothing;
