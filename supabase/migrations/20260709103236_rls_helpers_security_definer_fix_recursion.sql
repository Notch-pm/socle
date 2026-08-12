-- Break the latent RLS recursion cycle: helper predicates must read their
-- backing tables WITHOUT re-triggering RLS. They only ever check the current
-- caller's identity (auth.uid()) and return a boolean, so SECURITY DEFINER is safe.
alter function public.is_super_admin() security definer;
alter function public.is_super_admin() set search_path = public;

alter function public.is_org_admin(uuid) security definer;
alter function public.is_org_admin(uuid) set search_path = public;

alter function public.has_org_access(uuid) security definer;
alter function public.has_org_access(uuid) set search_path = public;
