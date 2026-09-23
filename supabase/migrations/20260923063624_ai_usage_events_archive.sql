-- Archivage du grand livre IA — décision PO du 2026-09-23 (audit purge /
-- performance de la gamme, avant mise en production).
--
-- `ai_usage_events` reçoit une ligne par appel IA de toute la gamme, et depuis
-- le 2026-09-20 par message d'un visiteur ANONYME de l'assistant du portail :
-- son volume n'est plus borné par un nombre de comptes. Aucune purge n'existait.
--
-- C'est une preuve de consommation facturée (docs/data-model.md : « aucune
-- cascade n'efface une consommation facturée ») : on ARCHIVE, on ne supprime pas.
-- Les périodes (mois UTC) de plus de 13 mois partent dans la table froide
-- `ai_usage_events_archive`, par mois entiers — une période n'est jamais coupée
-- en deux entre table chaude et archive. Les réservations encore ouvertes
-- (`reserved`) restent en place, quel que soit leur âge.
--
-- Conséquence assumée : `ai_usage_breakdown` (qui lit la table chaude) rend une
-- ventilation vide pour une période archivée. Les compteurs agrégés
-- (`ai_usage_counters`) ne sont pas touchés.
--
-- ⚠️ L'insertion recopie `e.*` : une colonne ajoutée à `ai_usage_events` doit
-- l'être aussi, à la même position, dans l'archive — sinon l'archivage échoue
-- (bruyamment, sans rien déplacer : DELETE et INSERT sont dans la même requête).

create table if not exists public.ai_usage_events_archive (
  like public.ai_usage_events including defaults including constraints
);
alter table public.ai_usage_events_archive
  add column if not exists archived_at timestamptz not null default now();

create index if not exists ai_usage_events_archive_org_period_idx
  on public.ai_usage_events_archive (organization_id, period);

-- Table froide : aucune lecture cliente. RLS activé sans policy = service seul.
alter table public.ai_usage_events_archive enable row level security;
revoke all on table public.ai_usage_events_archive from anon, authenticated;

comment on table public.ai_usage_events_archive is
  'Archive froide de ai_usage_events (périodes > 13 mois). Alimentée par archive_ai_usage_events(), cron mensuel. Jamais purgée.';

create or replace function public.archive_ai_usage_events(p_keep_months int default 13)
returns int language plpgsql security definer set search_path to '' as $fn$
declare
  v_cutoff text := to_char((now() at time zone 'utc') - make_interval(months => greatest(p_keep_months, 1)), 'YYYY-MM');
  v_count  int;
begin
  with moved as (
    delete from public.ai_usage_events
     where period < v_cutoff
       and status <> 'reserved'
    returning *
  )
  insert into public.ai_usage_events_archive
  select m.*, now() from moved m;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;
revoke all on function public.archive_ai_usage_events(int) from public, anon, authenticated;

select cron.schedule(
  'archive-ai-usage-events',
  '0 3 2 * *',
  $job$ select public.archive_ai_usage_events(13); $job$
);
