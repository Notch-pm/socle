import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  resolveEmailTemplates,
  type EmailTemplateApplicationRow,
  type EmailTemplateOrganizationRow,
  type EmailTemplateRow,
  type ResolvedEmailTemplate,
} from "@/features/email-templates/emailTemplates";

const EMAIL_TEMPLATES_KEY = ["email-templates"] as const;
const EMAIL_TEMPLATE_DEFAULTS_KEY = ["email-template-defaults"] as const;

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

/** Le catalogue plateforme des courriels système (lecture seule). */
export function useEmailTemplateDefaults() {
  return useQuery({
    queryKey: EMAIL_TEMPLATE_DEFAULTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_template_defaults")
        .select("*")
        .order("position");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * La liste résolue d'une racine : courriels système (texte du catalogue ou
 * personnalisé) puis modèles créés. Deux lectures, une fusion pure
 * (`resolveEmailTemplates`, miroir de l'API).
 */
export function useEmailTemplates(organizationId: string | null | undefined) {
  const defaults = useEmailTemplateDefaults();
  const rows = useQuery({
    queryKey: [...EMAIL_TEMPLATES_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select(
          "*, email_template_applications(application_id), email_template_organizations(organization_id)",
        )
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data;
    },
  });

  const data: ResolvedEmailTemplate[] | undefined =
    organizationId && defaults.data && rows.data
      ? resolveEmailTemplates(
          organizationId,
          defaults.data,
          rows.data as EmailTemplateRow[],
          rows.data.flatMap((row): EmailTemplateApplicationRow[] =>
            (row.email_template_applications ?? []).map((link) => ({
              email_template_id: row.id,
              application_id: link.application_id,
            })),
          ),
          rows.data.flatMap((row): EmailTemplateOrganizationRow[] =>
            (row.email_template_organizations ?? []).map((link) => ({
              email_template_id: row.id,
              organization_id: link.organization_id,
            })),
          ),
        )
      : undefined;

  return {
    data,
    isLoading: defaults.isLoading || rows.isLoading,
    isError: defaults.isError || rows.isError,
  };
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
}

/**
 * Enregistre le texte d'un courriel SYSTÈME pour une racine : met à jour la
 * surcharge si elle existe, la crée sinon. Seuls l'objet et le corps se
 * personnalisent — titre et applications restent ceux du catalogue.
 */
export function useSaveSystemEmailTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      key: string;
      overrideId: string | null;
      subject: string;
      body: string;
    }) => {
      if (input.overrideId) {
        const { error } = await supabase
          .from("email_templates")
          .update({ subject: input.subject, body: input.body })
          .eq("id", input.overrideId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("email_templates").insert({
        organization_id: input.organizationId,
        system_key: input.key,
        subject: input.subject,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** « Rétablir le texte d'origine » : la surcharge part, le texte du catalogue revient. */
export function useResetSystemEmailTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", overrideId)
        .not("system_key", "is", null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export interface CustomEmailTemplateInput {
  name: string;
  description: string | null;
  subject: string;
  body: string;
  applications: string[];
  /** Organismes où le modèle est proposé (aucune descendance implicite). */
  organizationIds: string[];
}

async function syncApplications(templateId: string, wanted: string[], current: string[]) {
  const toRemove = current.filter((app) => !wanted.includes(app));
  const toAdd = wanted.filter((app) => !current.includes(app));
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("email_template_applications")
      .delete()
      .eq("email_template_id", templateId)
      .in("application_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("email_template_applications")
      .insert(toAdd.map((application_id) => ({ email_template_id: templateId, application_id })));
    if (error) throw error;
  }
}

async function syncOrganizations(templateId: string, wanted: string[], current: string[]) {
  const toRemove = current.filter((id) => !wanted.includes(id));
  const toAdd = wanted.filter((id) => !current.includes(id));
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("email_template_organizations")
      .delete()
      .eq("email_template_id", templateId)
      .in("organization_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("email_template_organizations")
      .insert(toAdd.map((organization_id) => ({ email_template_id: templateId, organization_id })));
    if (error) throw error;
  }
}

/** Crée un modèle et ses applications ; si les liens échouent, le modèle est retiré. */
export function useCreateEmailTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CustomEmailTemplateInput & { organizationId: string }) => {
      const { data, error } = await supabase
        .from("email_templates")
        .insert({
          organization_id: input.organizationId,
          name: input.name,
          description: input.description,
          subject: input.subject,
          body: input.body,
        })
        .select("id")
        .single();
      if (error) throw error;
      try {
        await syncApplications(data.id, input.applications, []);
        await syncOrganizations(data.id, input.organizationIds, []);
      } catch (linkError) {
        await supabase.from("email_templates").delete().eq("id", data.id);
        throw linkError;
      }
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEmailTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (
      input: CustomEmailTemplateInput & {
        id: string;
        currentApplications: string[];
        currentOrganizationIds: string[];
      },
    ) => {
      const { error } = await supabase
        .from("email_templates")
        .update({
          name: input.name,
          description: input.description,
          subject: input.subject,
          body: input.body,
        })
        .eq("id", input.id)
        .is("system_key", null);
      if (error) throw error;
      await syncApplications(input.id, input.applications, input.currentApplications);
      await syncOrganizations(input.id, input.organizationIds, input.currentOrganizationIds);
    },
    onSuccess: invalidate,
  });
}

/** Supprime un modèle CRÉÉ — jamais un courriel système (garde `system_key is null`). */
export function useDeleteEmailTemplate() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", id)
        .is("system_key", null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
