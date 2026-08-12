-- Une relation ne peut pas cibler une personne physique : la cible est toujours
-- une structure (entreprise, association, administration). Garantit qu'aucun
-- lien ne relie deux personnes (règle produit du 2026-07-16).
CREATE OR REPLACE FUNCTION public.sync_contact_relation_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  related_org uuid;
  related_type text;
  role_org uuid;
begin
  select organization_id into new.organization_id from public.contacts where id = new.contact_id;
  select organization_id, contact_type into related_org, related_type from public.contacts where id = new.related_contact_id;
  select organization_id into role_org from public.contact_roles where id = new.role_id;
  if new.organization_id is null or related_org is null or role_org is null
     or new.organization_id <> related_org or new.organization_id <> role_org then
    raise exception 'Les deux contacts et le role doivent appartenir a la meme organisation';
  end if;
  if related_type = 'personne' then
    raise exception 'Une relation ne peut pas cibler une personne physique';
  end if;
  return new;
end;
$function$;
