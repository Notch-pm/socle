import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface OrgUser {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

const membersKey = (orgId: string) => ["org-users", orgId] as const;

export function useOrgUsers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? membersKey(orgId) : ["org-users", "none"],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgUser[]> => {
      const { data, error } = await supabase
        .from("user_organizations")
        .select("id, role, users(id, email, first_name, last_name)")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data
        .filter((row) => row.users !== null)
        .map((row) => ({
          membershipId: row.id,
          userId: row.users!.id,
          email: row.users!.email,
          firstName: row.users!.first_name,
          lastName: row.users!.last_name,
          role: row.role,
        }));
    },
  });
}

export interface CreateUserInput {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  organization_id: string;
}

export interface CreateUserResult {
  success: boolean;
  user_id: string;
  is_new_user: boolean;
  email_sent: boolean;
  email_error: string | null;
}

export function useCreateOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput): Promise<CreateUserResult> => {
      const { data, error } = await supabase.functions.invoke<CreateUserResult>("invite-user", {
        body: input,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Réponse invalide du serveur");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

export function useUpdateOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      membershipId,
      firstName,
      lastName,
      role,
    }: {
      userId: string;
      membershipId: string;
      firstName: string;
      lastName: string;
      role: string;
    }) => {
      // .select() lets us detect RLS silently matching zero rows (no error is
      // thrown in that case — it just looks like a no-op update) instead of
      // reporting success when nothing actually changed.
      const { data: updatedRows, error: userError } = await supabase
        .from("users")
        .update({ first_name: firstName, last_name: lastName })
        .eq("id", userId)
        .select("id");
      if (userError) throw userError;
      if (!updatedRows?.length) {
        throw new Error("Modification refusée : droits insuffisants sur cet utilisateur.");
      }

      // No UPDATE policy exists on user_organizations (only SELECT/INSERT/DELETE),
      // so a role change is applied as delete-then-insert — see ARCHITECTURE.md.
      const { error: deleteError } = await supabase
        .from("user_organizations")
        .delete()
        .eq("id", membershipId);
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("user_organizations")
        .insert({ organization_id: orgId, user_id: userId, role });
      if (insertError) throw insertError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(orgId) }),
  });
}

export function useRemoveOrgUser(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("user_organizations").delete().eq("id", membershipId);
      if (error) throw error;
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
      if (error) {
        // Une réponse non-2xx arrive en `FunctionsHttpError` : le message de
        // la fonction est dans le corps, pas dans `error.message`.
        let message = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {
          // corps illisible : on garde le message générique
        }
        throw new Error(message);
      }
      if (!data) throw new Error("Réponse invalide du serveur");
      return data;
    },
  });
}
