// Generated from the live Supabase project (qhrokbkyxgcvkbpmbmna) schema.
// Do not hand-edit — regenerate via the Supabase MCP/CLI when the schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string | null;
          icon: string | null;
          id: string;
          name: string;
          organization_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          organization_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_procedures: {
        Row: {
          custom_name: string | null;
          custom_order: number | null;
          id: string;
          is_enabled: boolean | null;
          metadata: Json | null;
          organization_id: string | null;
          procedure_id: string | null;
        };
        Insert: {
          custom_name?: string | null;
          custom_order?: number | null;
          id?: string;
          is_enabled?: boolean | null;
          metadata?: Json | null;
          organization_id?: string | null;
          procedure_id?: string | null;
        };
        Update: {
          custom_name?: string | null;
          custom_order?: number | null;
          id?: string;
          is_enabled?: boolean | null;
          metadata?: Json | null;
          organization_id?: string | null;
          procedure_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_procedures_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_procedures_procedure_id_fkey";
            columns: ["procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          created_at: string | null;
          email: string | null;
          id: string;
          logo_url: string | null;
          metadata: Json | null;
          name: string;
          parent_id: string | null;
          phone: string | null;
          slug: string | null;
          status: string;
          type: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          metadata?: Json | null;
          name: string;
          parent_id?: string | null;
          phone?: string | null;
          slug?: string | null;
          status?: string;
          type?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          metadata?: Json | null;
          name?: string;
          parent_id?: string | null;
          phone?: string | null;
          slug?: string | null;
          status?: string;
          type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      procedures: {
        Row: {
          agent_description: string | null;
          category_id: string | null;
          created_at: string | null;
          id: string;
          input_duration_minutes: number | null;
          is_active_global: boolean | null;
          keywords: string[] | null;
          name: string;
          order_index: number | null;
          organization_id: string | null;
          short_description: string | null;
          translations: Json | null;
          type: string;
          updated_at: string | null;
          user_description: string | null;
        };
        Insert: {
          agent_description?: string | null;
          category_id?: string | null;
          created_at?: string | null;
          id?: string;
          input_duration_minutes?: number | null;
          is_active_global?: boolean | null;
          keywords?: string[] | null;
          name: string;
          order_index?: number | null;
          organization_id?: string | null;
          short_description?: string | null;
          translations?: Json | null;
          type?: string;
          updated_at?: string | null;
          user_description?: string | null;
        };
        Update: {
          agent_description?: string | null;
          category_id?: string | null;
          created_at?: string | null;
          id?: string;
          input_duration_minutes?: number | null;
          is_active_global?: boolean | null;
          keywords?: string[] | null;
          name?: string;
          order_index?: number | null;
          organization_id?: string | null;
          short_description?: string | null;
          translations?: Json | null;
          type?: string;
          updated_at?: string | null;
          user_description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "procedures_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "procedures_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      smtp_settings: {
        Row: {
          created_at: string;
          from_email: string;
          from_name: string;
          host: string;
          id: string;
          organization_id: string;
          password: string;
          port: number;
          updated_at: string;
          use_tls: boolean;
          username: string;
        };
        Insert: {
          created_at?: string;
          from_email?: string;
          from_name?: string;
          host?: string;
          id?: string;
          organization_id: string;
          password?: string;
          port?: number;
          updated_at?: string;
          use_tls?: boolean;
          username?: string;
        };
        Update: {
          created_at?: string;
          from_email?: string;
          from_name?: string;
          host?: string;
          id?: string;
          organization_id?: string;
          password?: string;
          port?: number;
          updated_at?: string;
          use_tls?: boolean;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: "smtp_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_organizations: {
        Row: {
          id: string;
          organization_id: string | null;
          role: string;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          role: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string | null;
          email: string;
          first_name: string | null;
          global_role: string;
          id: string;
          last_name: string | null;
        };
        Insert: {
          created_at?: string | null;
          email: string;
          first_name?: string | null;
          global_role: string;
          id?: string;
          last_name?: string | null;
        };
        Update: {
          created_at?: string | null;
          email?: string;
          first_name?: string | null;
          global_role?: string;
          id?: string;
          last_name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_org_access: { Args: { org_id: string }; Returns: boolean };
      is_admin_of_self_or_ancestor: { Args: { org_id: string }; Returns: boolean };
      is_org_admin: { Args: { org_id: string }; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];
