import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRootApplications } from "@/features/organizations/useFreeMail";
import {
  accessApplications,
  managedOrganizations,
  managedRootId,
  mergeAgents,
  NO_ACCESS,
  planAccessChanges,
  planSocleChanges,
  SOCLE_APPLICATION_ID,
  type AccessApplication,
  type AccessDraft,
  type AccessRow,
  type ManagedOrganization,
  type MembershipRow,
  type OrgAgent,
  type UserStatus,
} from "@/features/users/agentAccess";

export type { OrgAgent } from "@/features/users/agentAccess";

const membersKey = (orgId: string) => ["org-users", orgId] as const;

const USER_COLUMNS = "id, email, first_name, last_name, status";

const NO_ORGANIZATIONS: ManagedOrganization[] = [];

/**
 * Le sous-arbre que gère l'administrateur : l'organisme de la page et tous ses
 * services, lus par RLS (un administrateur voit son sous-arbre). `rootId` est
 * la racine si l'organisme de la page en est une, sinon `null`.
 */
export function useManagedOrganizations(orgId: string | undefined) {
  const query = useQuery({
    queryKey: ["managed-organizations", orgId ?? "none"] as const,
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name, parent_id").order("name");
      if (error) throw error;
      return managedOrganizations(data, orgId!);
    },
  });
  const organizations = query.data ?? NO_ORGANIZATIONS;
  return {
    organizations,
    rootId: managedRootId(organizations),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Les agents du sous-arbre : leur accès au Socle (`user_organizations`) et
 * leurs accès aux autres applications (`user_application_access`), sur
 * l'organisme de la page ET ses services, fusionnés par agent. Un agent dont
 * tous les accès sont retirés reste dans la liste (l'écran le masque par
 * défaut) : on peut lui rendre ses accès.
 */
export function useOrgUsers(orgId: string | undefined) {
  const managed = useManagedOrganizations(orgId);
  const ids = managed.organizations.map((o) => o.id);
  return useQuery({
    queryKey: orgId ? [...membersKey(orgId), ids.length] : ["org-users", "none"],
    enabled: Boolean(orgId) && ids.length > 0,
    queryFn: async (): Promise<OrgAgent[]> => {
      const [memberships, accesses] = await Promise.all([
        supabase
          .from("user_organizations")
          .select(`id, role, organization_id, users(${USER_COLUMNS})`)
          .in("organization_id", ids),
        supabase
          .from("user_application_access")
          .select(
            `id, application_id, organization_id, role_code, is_active, users!user_application_access_user_id_fkey(${USER_COLUMNS})`,
          )
          .in("organization_id", ids),
      ]);
      if (memberships.error) throw memberships.error;
      if (accesses.error) throw accesses.error;
      return mergeAgents(
        memberships.data as unknown as MembershipRow[],
        accesses.data as unknown as AccessRow[],
      );
    },
  });
}

/**
 * Les applications dont cet organisme peut ouvrir l'accès : abonnées par sa
 * racine (RPC `organization_root_applications`) et déclarant des rôles.
 */
export function useAccessApplications(orgId: string | undefined) {
  const subscribed = useRootApplications(orgId);
  const catalogue = useQuery({
    queryKey: ["application-roles"] as const,
    queryFn: async () => {
      const [applications, roles] = await Promise.all([
        supabase.from("applications").select("id, name"),
        supabase.from("application_roles").select("application_id, code, label, is_admin, sort_order"),
      ]);
      if (applications.error) throw applications.error;
      if (roles.error) throw roles.error;
      return { applications: applications.data, roles: roles.data };
    },
  });
  // Mémoïsé : le dialogue d'édition se réinitialise quand la liste change.
  const data: AccessApplication[] | undefined = React.useMemo(
    () =>
      catalogue.data && subscribed.data
        ? accessApplications(catalogue.data.applications, catalogue.data.roles, subscribed.data)
        : undefined,
    [catalogue.data, subscribed.data],
  );
  return {
    data,
    isLoading: catalogue.isLoading || subscribed.isLoading,
    isError: catalogue.isError || subscribed.isError,
  };
}

export interface CreateUserInput {
  email: string;
  first_name: string;
  last_name: string;
  /** Rôle Socle, ou `NO_ACCESS` : l'agent n'utilise que d'autres applications. */
  role: string;
  /** Organisme de la page : périmètre de l'appelant et relais du message de bienvenue. */
  organization_id: string;
  /** Organismes où ouvrir l'accès au Socle (défaut : `organization_id`). */
  socle_organization_ids: string[];
  applications: { application_id: string; role_code: string; organization_ids: string[] }[];
}

export interface CreateUserResult {
  success: boolean;
  user_id: string;
  is_new_user: boolean;
  email_sent: boolean;
  email_error: string | null;
}

/** Lit le message français d'une réponse non-2xx de `invite-user`. */
async function functionErrorMessage(error: { message: string }): Promise<string> {
  // Une réponse non-2xx arrive en `FunctionsHttpError` : le message de la
  // fonction est dans le corps, pas dans `error.message`.
  let message = error.message;
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // corps illisible : on garde le message générique
  }
  return message;
}

export function useCreateOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput): Promise<CreateUserResult> => {
      const { data, error } = await supabase.functions.invoke<CreateUserResult>("invite-user", {
        body: input,
      });
      if (error) throw new Error(await functionErrorMessage(error));
      if (!data) throw new Error("Réponse invalide du serveur");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

export interface UpdateAgentInput {
  agent: OrgAgent;
  firstName: string;
  lastName: string;
  /** Par application (`socle` compris) : rôle voulu ou `NO_ACCESS`, et organismes cochés. */
  draft: AccessDraft;
  applications: AccessApplication[];
  rootId: string | null;
}

export function useUpdateOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent, firstName, lastName, draft, applications, rootId }: UpdateAgentInput) => {
      // .select() lets us detect RLS silently matching zero rows (no error is
      // thrown in that case — it just looks like a no-op update) instead of
      // reporting success when nothing actually changed.
      const { data: updatedRows, error: userError } = await supabase
        .from("users")
        .update({ first_name: firstName, last_name: lastName })
        .eq("id", agent.userId)
        .select("id");
      if (userError) throw userError;
      if (!updatedRows?.length) {
        throw new Error("Modification refusée : droits insuffisants sur cet utilisateur.");
      }

      // Accès au Socle. No UPDATE policy exists on user_organizations (only
      // SELECT/INSERT/DELETE), so a role change is applied as delete-then-insert.
      const socle = planSocleChanges(agent.socle, draft[SOCLE_APPLICATION_ID] ?? { role: NO_ACCESS, organizationIds: [] });
      if (socle.deleteMembershipIds.length > 0) {
        const { error } = await supabase.from("user_organizations").delete().in("id", socle.deleteMembershipIds);
        if (error) throw error;
      }
      if (socle.insertOrganizationIds.length > 0) {
        const { error } = await supabase.from("user_organizations").insert(
          socle.insertOrganizationIds.map((organization_id) => ({
            organization_id,
            user_id: agent.userId,
            role: socle.role,
          })),
        );
        if (error) throw error;
      }

      // Accès aux autres applications : retirer = désactiver, jamais supprimer.
      // Une requête par changement, dans l'ordre du plan (règle de la racine).
      for (const change of planAccessChanges(agent.access, draft, applications, rootId)) {
        const { error } =
          change.kind === "insert"
            ? await supabase.from("user_application_access").insert({
                user_id: agent.userId,
                organization_id: change.organizationId,
                application_id: change.applicationId,
                role_code: change.roleCode,
              })
            : await supabase
                .from("user_application_access")
                .update({ role_code: change.roleCode, is_active: change.isActive })
                .eq("id", change.accessId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

/**
 * Retire l'agent de l'organisme et de ses services : accès Socle supprimés,
 * accès aux autres applications DÉSACTIVÉS (l'application doit l'apprendre),
 * en une seule requête — la règle de la racine est vérifiée en fin de
 * transaction. Son compte et ses rattachements hors de ce sous-arbre ne
 * bougent pas.
 */
export function useRemoveOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agent: OrgAgent) => {
      const membershipIds = agent.socle?.memberships.map((m) => m.id) ?? [];
      if (membershipIds.length > 0) {
        const { error } = await supabase.from("user_organizations").delete().in("id", membershipIds);
        if (error) throw error;
      }
      const accessIds = Object.values(agent.access)
        .flat()
        .filter((a) => a.isActive)
        .map((a) => a.id);
      if (accessIds.length > 0) {
        const { error } = await supabase
          .from("user_application_access")
          .update({ is_active: false })
          .in("id", accessIds);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

/**
 * Suspend ou réactive l'agent dans TOUTE la gamme (RPC `set_user_status`).
 * Le serveur refuse si l'agent est rattaché hors du périmètre de l'appelant ;
 * son message s'affiche tel quel.
 */
export function useSetUserStatus(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: UserStatus }) => {
      const { error } = await supabase.rpc("set_user_status", { p_user_id: userId, p_status: status });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

export interface ResendInvitationResult {
  success: boolean;
  email_sent: boolean;
  email_error: string | null;
}

/**
 * Renvoie le message de bienvenue (`invite-user`, action `resend`) : les
 * applications ouvertes et la façon de s'y connecter (connexion unique, plus
 * de lien d'activation). Compte hors du périmètre de l'appelant → 404 ; le
 * message français remonte tel quel.
 */
export function useResendInvitation(orgId: string) {
  return useMutation({
    mutationFn: async (email: string): Promise<ResendInvitationResult> => {
      const { data, error } = await supabase.functions.invoke<ResendInvitationResult>("invite-user", {
        body: { action: "resend", email, organization_id: orgId },
      });
      if (error) throw new Error(await functionErrorMessage(error));
      if (!data) throw new Error("Réponse invalide du serveur");
      return data;
    },
  });
}
