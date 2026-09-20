export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage_counters: {
        Row: {
          id: string
          organization_id: string
          period: string
          provider: string
          reserved_tokens: number
          updated_at: string
          used_tokens: number
        }
        Insert: {
          id?: string
          organization_id: string
          period: string
          provider?: string
          reserved_tokens?: number
          updated_at?: string
          used_tokens?: number
        }
        Update: {
          id?: string
          organization_id?: string
          period?: string
          provider?: string
          reserved_tokens?: number
          updated_at?: string
          used_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          actual_tokens: number | null
          api_key_id: string | null
          consumer: string
          counter_provider: string | null
          created_at: string
          estimated_tokens: number
          external_actor_id: string | null
          external_ref_id: string | null
          external_ref_kind: string | null
          feature: string | null
          id: string
          organization_id: string
          period: string
          provider: string
          resource_type: string
          settled_at: string | null
          status: string
        }
        Insert: {
          actual_tokens?: number | null
          api_key_id?: string | null
          consumer: string
          counter_provider?: string | null
          created_at?: string
          estimated_tokens: number
          external_actor_id?: string | null
          external_ref_id?: string | null
          external_ref_kind?: string | null
          feature?: string | null
          id?: string
          organization_id: string
          period: string
          provider: string
          resource_type: string
          settled_at?: string | null
          status?: string
        }
        Update: {
          actual_tokens?: number | null
          api_key_id?: string | null
          consumer?: string
          counter_provider?: string | null
          created_at?: string
          estimated_tokens?: number
          external_actor_id?: string | null
          external_ref_id?: string | null
          external_ref_kind?: string | null
          feature?: string | null
          id?: string
          organization_id?: string
          period?: string
          provider?: string
          resource_type?: string
          settled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_quotas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_limit_tokens: number
          organization_id: string
          period_unit: string
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit_tokens: number
          organization_id: string
          period_unit?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_limit_tokens?: number
          organization_id?: string
          period_unit?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_quotas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_rate: {
        Row: {
          attempts: number
          bucket: string
          organization_id: string
          subject: string
          subject_kind: string
          window_start: string
        }
        Insert: {
          attempts?: number
          bucket?: string
          organization_id: string
          subject: string
          subject_kind: string
          window_start: string
        }
        Update: {
          attempts?: number
          bucket?: string
          organization_id?: string
          subject?: string
          subject_kind?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_rate_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          consumer: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string | null
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          consumer?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          consumer?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_consumer_fkey"
            columns: ["consumer"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          id: string
          name: string
          scope: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          scope?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          scope?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          name: string
          organization_id: string | null
          translations: Json
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          organization_id?: string | null
          translations?: Json
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          translations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consents: {
        Row: {
          collected_at: string
          contact_id: string
          created_at: string
          granted: boolean
          id: string
          kind: string
          organization_id: string
          source_app: string
          source_reference: string | null
          statement: string
          updated_at: string
        }
        Insert: {
          collected_at?: string
          contact_id: string
          created_at?: string
          granted: boolean
          id?: string
          kind: string
          organization_id: string
          source_app: string
          source_reference?: string | null
          statement: string
          updated_at?: string
        }
        Update: {
          collected_at?: string
          contact_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          kind?: string
          organization_id?: string
          source_app?: string
          source_reference?: string | null
          statement?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_external_references: {
        Row: {
          contact_id: string
          created_at: string
          external_id: string
          id: string
          organization_id: string
          source: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          external_id: string
          id?: string
          organization_id: string
          source: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          external_id?: string
          id?: string
          organization_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_external_references_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_external_references_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_relations: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          organization_id: string
          related_contact_id: string
          role_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          organization_id: string
          related_contact_id: string
          role_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          related_contact_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_relations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_relations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_relations_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_relations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_role_assignments: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          role_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          role_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_role_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_roles: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_lat: number | null
          address_line1: string | null
          address_line2: string | null
          address_lon: number | null
          birth_date: string | null
          city: string | null
          civility: string | null
          consent_email: boolean
          consent_partage: boolean
          consent_partage_at: string | null
          consent_sms: boolean
          consent_traitement: boolean
          consent_traitement_at: string | null
          contact_type: string
          country: string
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          internal_notes: string | null
          landline_phone: string | null
          landline_phone_normalized: string | null
          last_name: string | null
          legal_name: string | null
          mobile_phone: string | null
          mobile_phone_normalized: string | null
          organization_id: string
          postal_code: string | null
          preferred_channel: string | null
          quartier_auto: boolean
          quartier_id: string | null
          siret: string | null
          status: string
          updated_at: string
          usage_name: string | null
        }
        Insert: {
          address_lat?: number | null
          address_line1?: string | null
          address_line2?: string | null
          address_lon?: number | null
          birth_date?: string | null
          city?: string | null
          civility?: string | null
          consent_email?: boolean
          consent_partage?: boolean
          consent_partage_at?: string | null
          consent_sms?: boolean
          consent_traitement?: boolean
          consent_traitement_at?: string | null
          contact_type: string
          country?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          internal_notes?: string | null
          landline_phone?: string | null
          landline_phone_normalized?: string | null
          last_name?: string | null
          legal_name?: string | null
          mobile_phone?: string | null
          mobile_phone_normalized?: string | null
          organization_id: string
          postal_code?: string | null
          preferred_channel?: string | null
          quartier_auto?: boolean
          quartier_id?: string | null
          siret?: string | null
          status?: string
          updated_at?: string
          usage_name?: string | null
        }
        Update: {
          address_lat?: number | null
          address_line1?: string | null
          address_line2?: string | null
          address_lon?: number | null
          birth_date?: string | null
          city?: string | null
          civility?: string | null
          consent_email?: boolean
          consent_partage?: boolean
          consent_partage_at?: string | null
          consent_sms?: boolean
          consent_traitement?: boolean
          consent_traitement_at?: string | null
          contact_type?: string
          country?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          internal_notes?: string | null
          landline_phone?: string | null
          landline_phone_normalized?: string | null
          last_name?: string | null
          legal_name?: string | null
          mobile_phone?: string | null
          mobile_phone_normalized?: string | null
          organization_id?: string
          postal_code?: string | null
          preferred_channel?: string | null
          quartier_auto?: boolean
          quartier_id?: string | null
          siret?: string | null
          status?: string
          updated_at?: string
          usage_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_quartier_id_fkey"
            columns: ["quartier_id"]
            isOneToOne: false
            referencedRelation: "quartiers"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          id: string
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_agent_guidance: {
        Row: {
          created_at: string
          guidance: Json
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guidance?: Json
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guidance?: Json
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_agent_guidance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_applications: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          organization_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          organization_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_applications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          organization_id: string
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          organization_id: string
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_procedures: {
        Row: {
          custom_name: string | null
          custom_order: number | null
          id: string
          is_enabled: boolean | null
          metadata: Json | null
          organization_id: string | null
          procedure_id: string | null
        }
        Insert: {
          custom_name?: string | null
          custom_order?: number | null
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          organization_id?: string | null
          procedure_id?: string | null
        }
        Update: {
          custom_name?: string | null
          custom_order?: number | null
          id?: string
          is_enabled?: boolean | null
          metadata?: Json | null
          organization_id?: string | null
          procedure_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_procedures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_procedures_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          branding_inherit_parent: boolean
          created_at: string | null
          email: string | null
          email_sender_name: string | null
          email_sender_override: boolean
          enabled_languages: string[]
          favicon_url: string | null
          id: string
          is_internal_service: boolean
          logo_url: string | null
          logo_white_url: string | null
          metadata: Json | null
          name: string
          parent_id: string | null
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string | null
          status: string
          type: string | null
        }
        Insert: {
          address?: string | null
          branding_inherit_parent?: boolean
          created_at?: string | null
          email?: string | null
          email_sender_name?: string | null
          email_sender_override?: boolean
          enabled_languages?: string[]
          favicon_url?: string | null
          id?: string
          is_internal_service?: boolean
          logo_url?: string | null
          logo_white_url?: string | null
          metadata?: Json | null
          name: string
          parent_id?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          status?: string
          type?: string | null
        }
        Update: {
          address?: string | null
          branding_inherit_parent?: boolean
          created_at?: string | null
          email?: string | null
          email_sender_name?: string | null
          email_sender_override?: boolean
          enabled_languages?: string[]
          favicon_url?: string | null
          id?: string
          is_internal_service?: boolean
          logo_url?: string | null
          logo_white_url?: string | null
          metadata?: Json | null
          name?: string
          parent_id?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string | null
          status?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          default_ai_monthly_tokens: number | null
          id: boolean
          portal_cname_target: string | null
          portal_domain_suffix: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_ai_monthly_tokens?: number | null
          id?: boolean
          portal_cname_target?: string | null
          portal_domain_suffix?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_ai_monthly_tokens?: number | null
          id?: boolean
          portal_cname_target?: string | null
          portal_domain_suffix?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_assistant_settings: {
        Row: {
          created_at: string
          deposit_enabled: boolean
          enabled: boolean
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          deposit_enabled?: boolean
          enabled?: boolean
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          deposit_enabled?: boolean
          enabled?: boolean
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_assistant_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_assistant_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_audience_breakdown: {
        Row: {
          day: string
          dimension: string
          organization_id: string
          value: string
          views: number
          visits: number
        }
        Insert: {
          day: string
          dimension: string
          organization_id: string
          value: string
          views?: number
          visits?: number
        }
        Update: {
          day?: string
          dimension?: string
          organization_id?: string
          value?: string
          views?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_audience_breakdown_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_audience_pages: {
        Row: {
          day: string
          deposits: number
          organization_id: string
          page: string
          procedure_id: string | null
          views: number
          visits: number
        }
        Insert: {
          day: string
          deposits?: number
          organization_id: string
          page: string
          procedure_id?: string | null
          views?: number
          visits?: number
        }
        Update: {
          day?: string
          deposits?: number
          organization_id?: string
          page?: string
          procedure_id?: string | null
          views?: number
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_audience_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_contents: {
        Row: {
          created_at: string
          draft: Json
          id: string
          organization_id: string
          published: Json | null
          published_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft: Json
          id?: string
          organization_id: string
          published?: Json | null
          published_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          id?: string
          organization_id?: string
          published?: Json | null
          published_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_contents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_pages: {
        Row: {
          created_at: string
          draft: Json
          id: string
          organization_id: string
          published: Json | null
          published_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft: Json
          id?: string
          organization_id: string
          published?: Json | null
          published_at?: string | null
          slug?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          id?: string
          organization_id?: string
          published?: Json | null
          published_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_themes: {
        Row: {
          created_at: string
          draft: Json
          id: string
          organization_id: string
          published: Json | null
          published_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft: Json
          id?: string
          organization_id: string
          published?: Json | null
          published_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft?: Json
          id?: string
          organization_id?: string
          published?: Json | null
          published_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_themes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          access_mode: string
          agent_description: string | null
          category_id: string | null
          communication_config: Json | null
          created_at: string | null
          form_schema: Json | null
          id: string
          input_duration_minutes: number | null
          is_active_global: boolean | null
          keywords: string[] | null
          knowledge_base: Json | null
          name: string
          order_index: number | null
          organization_id: string | null
          requester_config: Json | null
          short_description: string | null
          status: string
          translations: Json | null
          type: string
          updated_at: string | null
          user_communication: Json | null
          user_description: string | null
        }
        Insert: {
          access_mode?: string
          agent_description?: string | null
          category_id?: string | null
          communication_config?: Json | null
          created_at?: string | null
          form_schema?: Json | null
          id?: string
          input_duration_minutes?: number | null
          is_active_global?: boolean | null
          keywords?: string[] | null
          knowledge_base?: Json | null
          name: string
          order_index?: number | null
          organization_id?: string | null
          requester_config?: Json | null
          short_description?: string | null
          status?: string
          translations?: Json | null
          type?: string
          updated_at?: string | null
          user_communication?: Json | null
          user_description?: string | null
        }
        Update: {
          access_mode?: string
          agent_description?: string | null
          category_id?: string | null
          communication_config?: Json | null
          created_at?: string | null
          form_schema?: Json | null
          id?: string
          input_duration_minutes?: number | null
          is_active_global?: boolean | null
          keywords?: string[] | null
          knowledge_base?: Json | null
          name?: string
          order_index?: number | null
          organization_id?: string | null
          requester_config?: Json | null
          short_description?: string | null
          status?: string
          translations?: Json | null
          type?: string
          updated_at?: string | null
          user_communication?: Json | null
          user_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quartiers: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          geom: unknown
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          geom: unknown
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          geom?: unknown
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quartiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      smtp_settings: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          host: string
          id: string
          inherit_parent: boolean
          organization_id: string
          password: string
          port: number
          updated_at: string
          use_tls: boolean
          username: string
        }
        Insert: {
          created_at?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          inherit_parent?: boolean
          organization_id: string
          password?: string
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          inherit_parent?: boolean
          organization_id?: string
          password?: string
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "smtp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_organizations: {
        Row: {
          id: string
          organization_id: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          id?: string
          organization_id?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          first_name: string | null
          global_role: string
          id: string
          last_name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name?: string | null
          global_role: string
          id?: string
          last_name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string | null
          global_role?: string
          id?: string
          last_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_usage_breakdown: {
        Args: { p_org_id: string; p_period?: string }
        Returns: {
          calls: number
          consumer: string
          feature: string
          tokens: number
        }[]
      }
      application_scope_ids: {
        Args: { p_application: string }
        Returns: string[]
      }
      contacts_outside_quartiers: {
        Args: { p_org_id: string }
        Returns: {
          address_lat: number
          address_lon: number
          display_name: string
          id: string
        }[]
      }
      create_quartier_from_geojson: {
        Args: {
          p_color: string
          p_geojson: Json
          p_name: string
          p_org_id: string
        }
        Returns: string
      }
      create_quartiers_batch: {
        Args: { p_items: Json; p_org_id: string; p_replace?: boolean }
        Returns: {
          quartier_id: string
          quartier_name: string
        }[]
      }
      delete_ai_usage_quota: {
        Args: { p_org_id: string; p_provider?: string }
        Returns: Json
      }
      dns_label_from_slug: { Args: { p_slug: string }; Returns: string }
      has_org_access: { Args: { org_id: string }; Returns: boolean }
      immutable_unaccent: { Args: { value: string }; Returns: string }
      internal_service_bearer: { Args: { p_org_id: string }; Returns: string }
      internal_service_offer_conflicts: {
        Args: { p_org_id: string }
        Returns: {
          bearer_id: string
          bearer_name: string
          organization_names: string[]
          procedure_id: string
          procedure_name: string
        }[]
      }
      is_admin_of_self_or_ancestor: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_language_set: { Args: { codes: string[] }; Returns: boolean }
      list_quartiers_geojson: {
        Args: { p_org_id: string }
        Returns: {
          color: string
          geojson: Json
          id: string
          name: string
        }[]
      }
      match_contacts: {
        Args: {
          p_birth_date?: string
          p_contact_type?: string
          p_email?: string
          p_exclude_ids?: string[]
          p_first_name?: string
          p_last_name?: string
          p_legal_name?: string
          p_limit?: number
          p_org_id: string
          p_phones?: string[]
          p_siret?: string
          p_status?: string
          p_usage_name?: string
        }
        Returns: {
          contact_id: string
          reasons: string[]
          score: number
        }[]
      }
      match_full_name: {
        Args: { family: string; given: string }
        Returns: string
      }
      normalize_name: { Args: { value: string }; Returns: string }
      normalize_phone: { Args: { raw: string }; Returns: string }
      org_subtree_ids: { Args: { root: string }; Returns: string[] }
      organization_dashboard: { Args: { p_org_id: string }; Returns: Json }
      parent_branding: {
        Args: { p_org_id: string }
        Returns: {
          configured: boolean
          favicon_url: string
          logo_url: string
          logo_white_url: string
          primary_color: string
          secondary_color: string
          source_organization_id: string
          source_organization_name: string
        }[]
      }
      parent_smtp_settings: {
        Args: { p_org_id: string }
        Returns: {
          configured: boolean
          from_email: string
          from_name: string
          host: string
          port: number
          source_organization_id: string
          source_organization_name: string
          use_tls: boolean
          username: string
        }[]
      }
      portal_audience: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: Json
      }
      provision_existing_roots: { Args: never; Returns: Json }
      provision_root: { Args: { p_org_id: string }; Returns: Json }
      purge_ai_usage_rate: {
        Args: { p_keep_minutes?: number }
        Returns: number
      }
      quartier_for_point: {
        Args: { p_lat: number; p_lon: number; p_org_id: string }
        Returns: string
      }
      recalculate_contact_quartiers: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      record_portal_deposit: {
        Args: { p_organization_id: string; p_procedure_id: string }
        Returns: boolean
      }
      record_portal_page_view: {
        Args: {
          p_device?: string
          p_entry?: boolean
          p_lang?: string
          p_organization_id: string
          p_page: string
          p_procedure_id?: string
        }
        Returns: boolean
      }
      release_stale_ai_reservations: {
        Args: { p_max_age_minutes?: number }
        Returns: number
      }
      reserve_ai_usage: {
        Args: {
          p_api_key_id?: string
          p_consumer: string
          p_estimated_tokens: number
          p_external_actor_id?: string
          p_external_ref_id?: string
          p_external_ref_kind?: string
          p_feature?: string
          p_org_id: string
          p_provider: string
          p_resource_type: string
        }
        Returns: {
          allowed: boolean
          event_id: string
          limit_tokens: number
          reason: string
          renews_at: string
          reserved_tokens: number
          usage_period: string
          used_tokens: number
        }[]
      }
      reset_orphan_manual_quartiers: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      resolve_agent_guidance: {
        Args: { p_org_id: string }
        Returns: {
          guidance: Json
          source_organization_id: string
          updated_at: string
        }[]
      }
      resolve_branding: {
        Args: { p_org_id: string }
        Returns: {
          favicon_url: string
          logo_url: string
          logo_white_url: string
          primary_color: string
          secondary_color: string
          source_organization_id: string
        }[]
      }
      resolve_org_languages: { Args: { p_org_id: string }; Returns: string[] }
      resolve_portal_assistant: {
        Args: { p_org_id: string }
        Returns: {
          deposit_enabled: boolean
          enabled: boolean
          source_organization_id: string
        }[]
      }
      resolve_smtp_settings: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          from_email: string
          from_name: string
          host: string
          id: string
          inherit_parent: boolean
          organization_id: string
          password: string
          port: number
          updated_at: string
          use_tls: boolean
          username: string
        }[]
        SetofOptions: {
          from: "*"
          to: "smtp_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      root_onboarding_status: { Args: { p_org_id: string }; Returns: Json }
      set_ai_usage_quota: {
        Args: {
          p_is_active?: boolean
          p_monthly_limit_tokens: number
          p_org_id: string
          p_provider?: string
        }
        Returns: Json
      }
      settle_ai_usage: {
        Args: { p_actual_tokens: number; p_event_id: string; p_status: string }
        Returns: undefined
      }
      stats_contacts_by_quartier: {
        Args: { p_org_id: string }
        Returns: {
          color: string
          count: number
          quartier_id: string
          quartier_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
