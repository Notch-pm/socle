import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRootApplications } from "@/features/organizations/useFreeMail";
import {
  accessApplications,
  mergeAgents,
  NO_ACCESS,
  planAccessChanges,
  SOCLE_APPLICATION_ID,
  type AccessApplication,
  type AccessRow,
  type MembershipRow,
  type OrgAgent,
  type UserStatus,
} from "@/features/users/agentAccess";

export type { OrgAgent } from "@/features/users/agentAccess";

const membersKey = (orgId: string) => ["org-users", orgId] as const;

const USER_COLUMNS = "id, email, first_name, last_name, status";

/**
 * Les agents d'un organisme : son accès au Socle (`user_organizations`) et ses
 * accès aux autres applications (`user_application_access`), fusionnés par
 * agent. Un agent dont tous les accès sont retirés reste dans la liste
 * (l'écran le masque par défaut) : on peut lui rendre ses accès.
 */
export function useOrgUsers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? membersKey(orgId) : ["org-users", "none"],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgAgent[]> => {
      const [memberships, accesses] = await Promise.all([
        supabase
          .from("user_organizations")
          .select(`id, role, users(${USER_COLUMNS})`)
          .eq("organization_id", orgId!),
        supabase
          .from("user_application_access")
          .select(`id, application_id, role_code, is_active, users!user_application_access_user_id_fkey(${USER_COLUMNS})`)
          .eq("organization_id", orgId!),
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
  organization_id: string;
  applications: { application_id: string; role_code: string }[];
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
  /** Rôle voulu par application (`socle` compris), ou `NO_ACCESS`. */
  roles: Record<string, string>;
}

export function useUpdateOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent, firstName, lastName, roles }: UpdateAgentInput) => {
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
      const socleRole = roles[SOCLE_APPLICATION_ID] ?? NO_ACCESS;
      const currentSocle = agent.socle?.role ?? NO_ACCESS;
      if (socleRole !== currentSocle) {
        if (agent.socle) {
          const { error } = await supabase.from("user_organizations").delete().eq("id", agent.socle.membershipId);
          if (error) throw error;
        }
        if (socleRole !== NO_ACCESS) {
          const { error } = await supabase
            .from("user_organizations")
            .insert({ organization_id: orgId, user_id: agent.userId, role: socleRole });
          if (error) throw error;
        }
      }

      // Accès aux autres applications : retirer = désactiver, jamais supprimer.
      for (const change of planAccessChanges(agent.access, roles)) {
        const { error } =
          change.kind === "insert"
            ? await supabase.from("user_application_access").insert({
                user_id: agent.userId,
                organization_id: orgId,
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
 * Retire l'agent de cet organisme : accès Socle supprimé, accès aux autres
 * applications DÉSACTIVÉS (l'application doit l'apprendre). Son compte et ses
 * rattachements à d'autres organismes ne bougent pas.
 */
export function useRemoveOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agent: OrgAgent) => {
      if (agent.socle) {
        const { error } = await supabase.from("user_organizations").delete().eq("id", agent.socle.membershipId);
        if (error) throw error;
      }
      const { error } = await supabase
        .from("user_application_access")
        .update({ is_active: false })
        .eq("organization_id", orgId)
        .eq("user_id", agent.userId)
        .eq("is_active", true);
      if (error) throw error;
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
 * Réémet le lien d'activation d'un compte encore inactif (`invite-user`,
 * action `resend`). Un courriel d'invitation perdu — relais absent au moment
 * de l'invitation, boîte pleine — laissait jusqu'ici un compte que personne
 * ne pouvait activer. Le serveur tranche : compte déjà actif → 409, compte
 * hors de l'organisation → 404 ; le message français remonte tel quel.
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
