-- Garde-fou de DÉBIT sur le guichet IA — la table.
--
-- ┌─ CE QUE LE PLAFOND MENSUEL NE DIT PAS ───────────────────────────────────┐
-- │ Il dit COMBIEN, jamais À QUELLE VITESSE.                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- Une boucle accidentelle — un `useEffect` mal gardé, un script partenaire, un
-- onglet laissé sur une relance — consomme le budget d'un mois en quelques
-- minutes. Le plafond finit par refuser, mais une fois l'argent dépensé : ce
-- n'est plus un refus, c'est un constat.
--
-- ⚠️ CETTE TABLE COMPTE LES **TENTATIVES**, PAS LES APPELS ABOUTIS. C'est la
-- décision qui structure tout le reste. Une boucle que le plafond mensuel
-- refuse continue de marteler le Socle ; si seuls les succès étaient comptés,
-- elle ne serait jamais coupée. Conséquences directes :
--   • la porte de débit passe AVANT la lecture du plafond, donc avant tout
--     incrément — il n'y a aucun retour en arrière à écrire ;
--   • elle s'applique AUSSI aux collectivités sans plafond mensuel, qui sont
--     précisément celles qui n'ont aucune borne aujourd'hui ;
--   • elle se vérifie SANS dépenser un jeton (plafond volontairement épuisé :
--     les tentatives se comptent quand même — voir le test SQL).
--
-- ⚠️ LE SEUIL N'EST PAS RÉGLABLE, et ce n'est pas un oubli (décision PO R3) :
-- un garde-fou de sécurité n'est pas un paramètre commercial. Le rendre
-- négociable, c'est le voir négocié le jour où il gêne — et il ne gêne que les
-- boucles. Les constantes vivent dans `reserve_ai_usage`, migration suivante.
--
-- ⚠️ Le passe-plat n'est pas entamé : aucune colonne de cette table ne peut
-- porter un prompt ni une réponse. Elle n'a que des compteurs, un horodatage
-- et des identifiants opaques.

create table if not exists public.ai_usage_rate (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- 'actor' = un agent identifié (le cas d'Iris, qui envoie toujours son
  -- `actor_id`) ; 'consumer' = le filet des appelants qui n'identifient
  -- personne. Les deux sont ALTERNATIFS, jamais cumulés — voir la fonction.
  subject_kind    text not null check (subject_kind in ('actor', 'consumer')),
  subject         text not null,
  -- Instant tronqué à la minute (`date_trunc('minute', now())`) : un
  -- timestamptz, jamais un `timestamp` recalé par le fuseau de session.
  window_start    timestamptz not null,
  attempts        int not null default 0 check (attempts >= 0),
  -- ⚠️ Clé primaire COMPOSITE, pas de colonne `id` — divergence délibérée avec
  -- les trois autres tables `ai_usage_*`. Ici la recherche EST la clé, et ces
  -- lignes sont éphémères (purgées à l'heure). Un uuid de substitution serait
  -- un second index à maintenir sur le chemin chaud de CHAQUE appel, pour
  -- n'être jamais lu.
  primary key (organization_id, subject_kind, subject, window_start)
);

comment on table public.ai_usage_rate is
  'Garde-fou de débit du guichet IA : tentatives par sujet et par fenêtre d''une minute. Compte les TENTATIVES, refus compris — sans quoi une boucle que le plafond refuse ne serait jamais coupée. Lignes éphémères, purgées par purge_ai_usage_rate.';
comment on column public.ai_usage_rate.subject is
  'Identifiant de l''agent (uuid opaque, nu, sans FK — motif external_actor_id) OU nom de l''application appelante. Texte, pour porter les deux avec un seul mécanisme.';
comment on column public.ai_usage_rate.window_start is
  'Début de la fenêtre, tronqué à la minute en UTC. Le passage à la minute suivante crée naturellement une nouvelle ligne — AUCUN reset destructif, motif ai_usage_counters.';
comment on column public.ai_usage_rate.attempts is
  'Tentatives, PAS appels aboutis : un refus de plafond incrémente aussi. C''est ce qui coupe une boucle qui se fait refuser en rafale.';

-- ---------------------------------------------------------------------------
-- Purge des fenêtres écoulées.
--
-- ⚠️ Purger DANS `reserve_ai_usage` aurait posé un DELETE sur le chemin chaud
-- de chaque appel : le genre de coût qu'on ne voit qu'une fois le volume
-- arrivé. Le balayage existant s'en charge (migration suivante, cron).
-- ---------------------------------------------------------------------------
create or replace function public.purge_ai_usage_rate(p_keep_minutes int default 60)
returns int
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count int;
begin
  delete from public.ai_usage_rate
   where window_start < (now() at time zone 'utc') - make_interval(mins => greatest(coalesce(p_keep_minutes, 60), 1));
  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

alter function public.purge_ai_usage_rate(int) owner to postgres;
comment on function public.purge_ai_usage_rate(int) is
  'Supprime les fenêtres de débit écoulées. Appelée par le job cron ; jamais depuis un client.';
-- ⚠️ Révoquer de PUBLIC **en plus** d'anon et authenticated : sans cela les
-- deux rôles héritent du droit accordé par défaut à la création, et la
-- fonction reste appelable via /rest/v1/rpc/ (advisors 0028/0029). À re-poser
-- à chaque `CREATE OR REPLACE` — le replace re-grante PUBLIC.
revoke all on function public.purge_ai_usage_rate(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS — lecture par le super admin (diagnostiquer « pourquoi ai-je été
-- freiné ? »), écriture par personne : `reserve_ai_usage` est l'unique porte,
-- et elle est SECURITY DEFINER donc hors RLS par construction.
-- ---------------------------------------------------------------------------
alter table public.ai_usage_rate enable row level security;

drop policy if exists ai_usage_rate_select on public.ai_usage_rate;
create policy ai_usage_rate_select on public.ai_usage_rate
  for select to authenticated
  using (public.is_super_admin());

