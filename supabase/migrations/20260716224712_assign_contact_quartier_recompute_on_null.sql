-- En mode automatique, recalcule aussi quand quartier_id arrive à NULL avec
-- des coordonnées présentes : un PATCH `quartier_id: null` (= retour à
-- l'assignation automatique via contacts-api) réassigne immédiatement, sans
-- attendre un changement d'adresse ou un recalcul de masse. Sans effet sur le
-- recalcul de masse (il pose une valeur non nulle, ou nulle → même résultat).
create or replace function public.assign_contact_quartier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quartier_auto then
    if new.address_lat is null or new.address_lon is null then
      new.quartier_id := null;
    elsif tg_op = 'INSERT' then
      new.quartier_id := public.quartier_for_point(new.organization_id, new.address_lon, new.address_lat);
    elsif new.address_lat is distinct from old.address_lat
       or new.address_lon is distinct from old.address_lon
       or not old.quartier_auto
       or new.quartier_id is null then
      new.quartier_id := public.quartier_for_point(new.organization_id, new.address_lon, new.address_lat);
    end if;
  elsif new.quartier_id is not null and not exists (
    select 1 from public.quartiers q
    where q.id = new.quartier_id and q.organization_id = new.organization_id
  ) then
    raise exception 'Le quartier doit appartenir a la meme organisation que le contact';
  end if;
  return new;
end;
$$;
