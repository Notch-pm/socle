-- Relations entre contacts du référentiel : <contact> est <rôle> de <related_contact>
-- (ex. Karim est Gérant de la Boulangerie du Forum). Le rôle vient du catalogue
-- contact_roles de l'organisation racine. Écriture uniquement via contacts-api
-- (service role) — comme contacts / assignments / external_references.

CREATE TABLE public.contact_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  related_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.contact_roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_relations_unique UNIQUE (contact_id, related_contact_id, role_id),
  CONSTRAINT contact_relations_not_self CHECK (contact_id <> related_contact_id)
);

CREATE INDEX idx_contact_relations_contact ON public.contact_relations (contact_id);
CREATE INDEX idx_contact_relations_related ON public.contact_relations (related_contact_id);
CREATE INDEX idx_contact_relations_org ON public.contact_relations (organization_id);

-- Dénormalise organization_id depuis le contact titulaire et impose que les
-- deux contacts et le rôle appartiennent à la même organisation racine.
CREATE OR REPLACE FUNCTION public.sync_contact_relation_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  related_org uuid;
  role_org uuid;
begin
  select organization_id into new.organization_id from public.contacts where id = new.contact_id;
  select organization_id into related_org from public.contacts where id = new.related_contact_id;
  select organization_id into role_org from public.contact_roles where id = new.role_id;
  if new.organization_id is null or related_org is null or role_org is null
     or new.organization_id <> related_org or new.organization_id <> role_org then
    raise exception 'Les deux contacts et le role doivent appartenir a la meme organisation';
  end if;
  return new;
end;
$function$;

CREATE TRIGGER contact_relations_sync_org
  BEFORE INSERT OR UPDATE ON public.contact_relations
  FOR EACH ROW EXECUTE FUNCTION public.sync_contact_relation_org();

ALTER TABLE public.contact_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_relations_select ON public.contact_relations
  FOR SELECT USING (public.has_org_access(organization_id));
-- Pas de policy d'écriture client : l'écriture passe exclusivement par contacts-api.

REVOKE EXECUTE ON FUNCTION public.sync_contact_relation_org() FROM public, anon, authenticated;
