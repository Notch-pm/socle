-- Annuaire des agents, lot 3 Iris : le Socle OUVRE l'accès à Iris, sans rôle.
--
-- Décision du 2026-10-30 : dans Iris, ce que voit et fait un agent vient de ses
-- profils de droits (périmètre × démarches), attribués dans Iris par ses
-- administrateurs ; le rôle `organization_members.role` en est DÉRIVÉ. Le Socle
-- ne donne donc aucun profil par défaut : il déclare pour Iris un seul rôle de
-- base, « Accès ». Aucun accès Iris n'existait encore (vérifié avant migration).

delete from public.application_roles where application_id = 'iris';

insert into public.application_roles (application_id, code, label, is_admin, sort_order)
select 'iris', 'acces', 'Accès', false, 10
where exists (select 1 from public.applications where id = 'iris')
on conflict do nothing;
