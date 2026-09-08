import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";
import type { OrgStatus } from "./orgTree";

// Logique d'arbre pure (testable sans la couche données) déplacée dans ./orgTree.
// Ré-exportée ici pour préserver les imports existants.
export {
  MAX_ORG_DEPTH,
  bearerByOrganization,
  buildOrgTree,
  collectDescendantIds,
  collectDescendantIdsFlat,
  findRootAncestor,
  sortedRootOrganizations,
  visibleRootOrganizations,
} from "./orgTree";
export type { Organization, OrgStatus, OrgNode } from "./orgTree";

const ORGS_KEY = ["superadmin-organizations"] as const;

export function useAllOrganizations() {
  return useQuery({
    queryKey: ORGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ["organization", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useChildOrganizations(parentId: string | undefined) {
  return useQuery({
    queryKey: ["organization-children", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("parent_id", parentId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"organizations">) => {
      const { error } = await supabase.from("organizations").insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization-children"] });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TablesUpdate<"organizations"> & { id: string }) => {
      const { error } = await supabase.from("organizations").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["organization-children"] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organizations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization-children"] });
    },
  });
}

export function useSetOrganizationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrgStatus }) => {
      const { error } = await supabase.from("organizations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ORGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["organization-children"] });
    },
  });
}
