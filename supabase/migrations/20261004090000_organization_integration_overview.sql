-- Vue de l'administrateur de collectivité sur ses intégrations — LECTURE SEULE.
--
-- Jusqu'ici, `organization_integrations` était réservée au super administrateur
-- (verrou du 2026-10-02) : une collectivité ne savait pas à quoi elle était
-- branchée. On ouvre une vue sur l'ÉTAT, pas sur la configuration :
--   • aucune policy n'est ajoutée à `organization_integrations` — la table
--     reste super admin seul, en lecture comme en écriture ;
--   • la fonction ne rend que des FAITS d'état : activée, dernier test (réussi
--     ou non, et quand), et les NOMS des champs renseignés (paramètres non vides
--     et secrets présents) — de quoi dériver le statut à l'écran
--     (`integrationStatus.ts`) sans que la règle de complétude soit recopiée en
--     SQL. Jamais une valeur : ni URL, ni identifiant, ni secret, ni le message
--     d'erreur du dernier test (technique, destiné au super admin).
--
-- Garde : administrateur DIRECT de la racine (`is_org_admin`, super admin
-- compris) — le prédicat de `useAdminRootOrganizations`, qui peuple le
-- sélecteur de la page. Une sous-organisation n'a pas de configuration : elle
-- reçoit un ensemble vide, pas une erreur.

create or replace function public.organization_integration_overview(p_organization_id uuid)
returns table (
  integration_id uuid,
  is_active      boolean,
  last_test_ok   boolean,
  last_tested_at timestamptz,
  present_keys   text[]
)
    language plpgsql stable security definer
    set search_path to 'public'
as $$
begin
  if not public.is_org_admin(p_organization_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    select oi.integration_id,
           oi.is_active,
           oi.last_test_ok,
           oi.last_tested_at,
           array(
             select k from (
               select e.k from jsonb_each(oi.settings) as e(k, v)
               where jsonb_typeof(e.v) = 'string' and btrim(e.v #>> '{}') <> ''
               union
               select e.k from jsonb_each_text(coalesce(s.secrets, '{}'::jsonb)) as e(k, v)
               where e.v <> ''
             ) keys
             order by k
           )
    from public.organization_integrations oi
    left join public.organization_integration_secrets s on s.organization_integration_id = oi.id
    where oi.organization_id = p_organization_id;
end;
$$;

alter function public.organization_integration_overview(uuid) owner to postgres;
revoke all on function public.organization_integration_overview(uuid) from public, anon;
grant execute on function public.organization_integration_overview(uuid) to authenticated;

comment on function public.organization_integration_overview(uuid) is
  'État des intégrations d''une racine pour son administrateur (lecture seule) : activation, dernier test, NOMS des champs renseignés. Aucune valeur, aucun secret.';
