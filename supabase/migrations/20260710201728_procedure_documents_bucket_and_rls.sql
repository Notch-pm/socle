-- Bucket privé pour les documents de la base de connaissances des démarches.
-- Multi-tenant strict : le premier segment du chemin de chaque objet est
-- l'organisation principale (racine) de la démarche → l'isolation par
-- organisation est portée par le RLS de storage.objects (comme `procedures`).
--
-- Convention de chemin : {organization_id}/{procedure_id}/{agent|training}/{fichier}
insert into storage.buckets (id, name, public, file_size_limit)
values ('procedure-documents', 'procedure-documents', false, 26214400) -- 25 MiB
on conflict (id) do nothing;

-- Lecture : tout membre de l'organisation (reflète la lecture des `procedures`).
create policy "read procedure documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'procedure-documents'
    and has_org_access(((storage.foldername(name))[1])::uuid)
  );

-- Écriture (INSERT/UPDATE/DELETE) : admin de l'organisation principale
-- (is_org_admin court-circuite déjà le super admin). Reflète l'écriture des
-- `procedures` : is_super_admin() OR is_org_admin(organization_id).
create policy "insert procedure documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'procedure-documents'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "update procedure documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'procedure-documents'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'procedure-documents'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "delete procedure documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'procedure-documents'
    and is_org_admin(((storage.foldername(name))[1])::uuid)
  );
