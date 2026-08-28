export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ambassador_assignments: {
        Row: {
          brand_ambassador_id: string
          campaign_id: string
          created_at: string
          end_date: string | null
          id: string
          organization_id: string
          start_date: string
          status: Database["public"]["Enums"]["assignment_status"]
          store_id: string
          updated_at: string
          weekly_off_day: number
        }
        Insert: {
          brand_ambassador_id: string
          campaign_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id: string
          start_date: string
          status?: Database["public"]["Enums"]["assignment_status"]
          store_id: string
          updated_at?: string
          weekly_off_day: number
        }
        Update: {
          brand_ambassador_id?: string
          campaign_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          store_id?: string
          updated_at?: string
          weekly_off_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_ambassador_assignments_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ambassador_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ambassador_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ambassador_assignments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          organization_id: string
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organization_id: string
          start_date: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organization_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_log_photos: {
        Row: {
          captured_at: string
          created_at: string
          daily_log_id: string
          id: string
          organization_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          storage_path: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          daily_log_id: string
          id?: string
          organization_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          storage_path: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          daily_log_id?: string
          id?: string
          organization_id?: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_photos_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          attendance_date: string
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          brand_ambassador_id: string
          campaign_id: string
          checkin_at: string | null
          checkin_distance_metres: number | null
          checkin_latitude: number | null
          checkin_longitude: number | null
          checkout_at: string | null
          checkout_distance_metres: number | null
          checkout_latitude: number | null
          checkout_longitude: number | null
          client_request_id: string | null
          created_at: string
          flagged: boolean
          id: string
          notes: string | null
          organization_id: string
          reopened_by: string | null
          status: Database["public"]["Enums"]["daily_log_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          brand_ambassador_id: string
          campaign_id: string
          checkin_at?: string | null
          checkin_distance_metres?: number | null
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkout_at?: string | null
          checkout_distance_metres?: number | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          client_request_id?: string | null
          created_at?: string
          flagged?: boolean
          id?: string
          notes?: string | null
          organization_id: string
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["daily_log_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          brand_ambassador_id?: string
          campaign_id?: string
          checkin_at?: string | null
          checkin_distance_metres?: number | null
          checkin_latitude?: number | null
          checkin_longitude?: number | null
          checkout_at?: string | null
          checkout_distance_metres?: number | null
          checkout_latitude?: number | null
          checkout_longitude?: number | null
          client_request_id?: string | null
          created_at?: string
          flagged?: boolean
          id?: string
          notes?: string | null
          organization_id?: string
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["daily_log_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          assignment_id: string
          brand_ambassador_id: string
          client_request_id: string
          created_at: string
          end_date: string
          expected_return_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          organization_id: string
          policy_acknowledged_at: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          store_id: string
          supervisor_informed: boolean
          supervisor_not_informed_reason: string | null
          supporting_document_types: string[]
          updated_at: string
        }
        Insert: {
          assignment_id: string
          brand_ambassador_id: string
          client_request_id: string
          created_at?: string
          end_date: string
          expected_return_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          organization_id: string
          policy_acknowledged_at: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          store_id: string
          supervisor_informed: boolean
          supervisor_not_informed_reason?: string | null
          supporting_document_types?: string[]
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          brand_ambassador_id?: string
          client_request_id?: string
          created_at?: string
          end_date?: string
          expected_return_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          organization_id?: string
          policy_acknowledged_at?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          store_id?: string
          supervisor_informed?: boolean
          supervisor_not_informed_reason?: string | null
          supporting_document_types?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "brand_ambassador_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_receipts: {
        Row: {
          brand_ambassador_id: string
          client_request_id: string
          created_at: string
          id: string
          operation: string
          organization_id: string
          result: Json | null
        }
        Insert: {
          brand_ambassador_id: string
          client_request_id: string
          created_at?: string
          id?: string
          operation: string
          organization_id: string
          result?: Json | null
        }
        Update: {
          brand_ambassador_id?: string
          client_request_id?: string
          created_at?: string
          id?: string
          operation?: string
          organization_id?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_receipts_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          access_code_used: string | null
          account_status: Database["public"]["Enums"]["account_status"]
          code_granted_at: string | null
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_code_used?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          code_granted_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_code_used?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          code_granted_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          access_code: string | null
          created_at: string
          has_code_gate: boolean
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          created_at?: string
          has_code_gate?: boolean
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          created_at?: string
          has_code_gate?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          current_membership_id: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string
          profile_photo_path: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          current_membership_id?: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string
          profile_photo_path?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          current_membership_id?: string | null
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string
          profile_photo_path?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_entries: {
        Row: {
          client_request_id: string | null
          created_at: string
          daily_log_id: string
          id: string
          organization_id: string
          quantity: number
          recorded_at: string
          sku_id: string
          updated_at: string
        }
        Insert: {
          client_request_id?: string | null
          created_at?: string
          daily_log_id: string
          id?: string
          organization_id: string
          quantity: number
          recorded_at?: string
          sku_id: string
          updated_at?: string
        }
        Update: {
          client_request_id?: string | null
          created_at?: string
          daily_log_id?: string
          id?: string
          organization_id?: string
          quantity?: number
          recorded_at?: string
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["sku_status"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["sku_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["sku_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skus_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          geofence_radius_metres: number
          id: string
          latitude: number
          longitude: number
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          geofence_radius_metres?: number
          id?: string
          latitude: number
          longitude: number
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          geofence_radius_metres?: number
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_scopes: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          organization_id: string
          store_id: string | null
          supervisor_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          store_id?: string | null
          supervisor_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          store_id?: string | null
          supervisor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_scopes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_scopes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_scopes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_scopes_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      veda_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["veda_activity_type"]
          created_at: string
          id: string
          learner_count: number
          organization_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["veda_activity_type"]
          created_at?: string
          id?: string
          learner_count: number
          organization_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["veda_activity_type"]
          created_at?: string
          id?: string
          learner_count?: number
          organization_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veda_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veda_activities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "veda_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      veda_schools: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          legacy_id: number
          longitude: number | null
          name: string
          organization_id: string
          region: string | null
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          legacy_id: number
          longitude?: number | null
          name: string
          organization_id: string
          region?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          legacy_id?: number
          longitude?: number | null
          name?: string
          organization_id?: string
          region?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veda_schools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      veda_sessions: {
        Row: {
          brand_ambassador_id: string
          created_at: string
          id: string
          learner_count: number
          legacy_id: number
          organization_id: string
          school_id: string
          session_date: string
          status: Database["public"]["Enums"]["daily_log_status"]
          updated_at: string
        }
        Insert: {
          brand_ambassador_id: string
          created_at?: string
          id?: string
          learner_count: number
          legacy_id: number
          organization_id: string
          school_id: string
          session_date: string
          status?: Database["public"]["Enums"]["daily_log_status"]
          updated_at?: string
        }
        Update: {
          brand_ambassador_id?: string
          created_at?: string
          id?: string
          learner_count?: number
          legacy_id?: number
          organization_id?: string
          school_id?: string
          session_date?: string
          status?: Database["public"]["Enums"]["daily_log_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veda_sessions_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veda_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veda_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "veda_schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_status_active: { Args: never; Returns: boolean }
      admin_list_pending_memberships: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          brand_name: string
          created_at: string
          full_name: string
          membership_id: string
          phone: string
          user_id: string
        }[]
      }
      admin_reopen_daily_log: {
        Args: { p_daily_log_id: string }
        Returns: undefined
      }
      admin_review_leave_request: {
        Args: {
          p_decision: string
          p_leave_request_id: string
          p_review_note?: string
        }
        Returns: Json
      }
      admin_set_account_status: {
        Args: { p_action: string; p_profile_id: string; p_reason?: string }
        Returns: Json
      }
      admin_upsert_assignment: {
        Args: {
          p_assignment_id?: string
          p_brand_ambassador_id: string
          p_campaign_id: string
          p_end_date?: string
          p_start_date: string
          p_status?: Database["public"]["Enums"]["assignment_status"]
          p_store_id: string
          p_weekly_off_day: number
        }
        Returns: string
      }
      assert_active_ba: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          current_membership_id: string | null
          full_name: string
          id: string
          organization_id: string
          phone: string
          profile_photo_path: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ba_checkin: {
        Args: {
          p_accuracy_metres?: number
          p_client_request_id: string
          p_latitude: number
          p_longitude: number
          p_notes?: string
          p_stock_photo_path: string
          p_uniform_selfie_path: string
        }
        Returns: Json
      }
      ba_checkout: {
        Args: {
          p_accuracy_metres?: number
          p_checkout_photo_path?: string
          p_client_request_id: string
          p_latitude: number
          p_longitude: number
        }
        Returns: Json
      }
      ba_delete_sale: {
        Args: { p_client_request_id: string; p_sales_entry_id: string }
        Returns: Json
      }
      ba_mark_sick_leave: {
        Args: { p_client_request_id?: string; p_note?: string }
        Returns: Json
      }
      ba_record_sale: {
        Args: {
          p_client_request_id: string
          p_quantity: number
          p_recorded_at_hint?: string
          p_sku_id: string
        }
        Returns: Json
      }
      ba_request_org_membership: {
        Args: { p_org_code?: string; p_organization_id: string }
        Returns: {
          access_code_used: string | null
          account_status: Database["public"]["Enums"]["account_status"]
          code_granted_at: string | null
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ba_submit_leave_request: {
        Args: {
          p_client_request_id: string
          p_end_date: string
          p_expected_return_date: string
          p_leave_type: Database["public"]["Enums"]["leave_type"]
          p_policy_acknowledged: boolean
          p_reason: string
          p_start_date: string
          p_supervisor_informed: boolean
          p_supervisor_not_informed_reason: string
          p_supporting_document_types: string[]
        }
        Returns: Json
      }
      ba_switch_brand: { Args: { p_organization_id: string }; Returns: string }
      ba_today: { Args: never; Returns: Json }
      ba_unlock_brand: {
        Args: { p_code: string; p_organization_id: string }
        Returns: {
          access_code_used: string | null
          account_status: Database["public"]["Enums"]["account_status"]
          code_granted_at: string | null
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ba_update_sale: {
        Args: {
          p_client_request_id: string
          p_quantity: number
          p_sales_entry_id: string
        }
        Returns: Json
      }
      can_read_org: { Args: { p_organization_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      complete_receipt: {
        Args: { p_client_request_id: string; p_result: Json }
        Returns: undefined
      }
      create_brand: {
        Args: {
          p_access_code: string | null
          p_ba_user_ids: string[]
          p_brand_admin_user_id: string
          p_campaign_end: string | null
          p_campaign_name: string
          p_campaign_start: string
          p_name: string
          p_slug: string
          p_store_address: string | null
          p_store_lat: number | null
          p_store_lng: number | null
          p_store_name: string | null
          p_store_radius?: number
          p_timezone?: string
          p_weekly_off_day?: number
        }
        Returns: Json
      }
      current_profile: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      current_user_role_hint: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      distance_metres: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_client: { Args: never; Returns: boolean }
      is_org_admin: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_client: { Args: { p_organization_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      joinable_brands: {
        Args: never
        Returns: {
          has_code_gate: boolean
          logo_url: string | null
          organization_id: string
          organization_name: string
          organization_slug: string
        }[]
      }
      my_memberships: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          has_code_gate: boolean
          logo_url: string | null
          organization_id: string
          organization_name: string
          organization_slug: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      supervisor_can_see_campaign: {
        Args: { p_campaign_id: string; p_supervisor_id: string }
        Returns: boolean
      }
      supervisor_can_see_store: {
        Args: { p_store_id: string; p_supervisor_id: string }
        Returns: boolean
      }
      try_consume_receipt: {
        Args: {
          p_ba: Database["public"]["Tables"]["profiles"]["Row"]
          p_client_request_id: string
          p_operation: string
        }
        Returns: Json
      }
      write_audit: {
        Args: {
          p_action: string
          p_actor?: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_organization?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
        | "inactive"
      app_role:
        | "super_admin"
        | "organization_admin"
        | "supervisor"
        | "brand_ambassador"
        | "client"
      assignment_status: "active" | "ended" | "cancelled"
      attendance_status: "present" | "sick_leave" | "weekly_off" | "absent"
      campaign_status: "draft" | "active" | "completed" | "cancelled"
      daily_log_status: "open" | "completed" | "cancelled"
      leave_request_status: "pending" | "approved" | "denied" | "cancelled"
      leave_type:
        | "annual_leave"
        | "sick_leave"
        | "paternity_leave"
        | "maternity_leave"
        | "casual_leave"
        | "other"
      organization_status: "active" | "suspended"
      photo_type: "stock_shelf" | "uniform_selfie" | "checkout" | "other"
      sku_status: "active" | "inactive"
      store_status: "active" | "inactive"
      veda_activity_type:
        | "crayon_colouring"
        | "watercolour_painting"
        | "paper_crafts"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
        "inactive",
      ],
      app_role: [
        "super_admin",
        "organization_admin",
        "supervisor",
        "brand_ambassador",
        "client",
      ],
      assignment_status: ["active", "ended", "cancelled"],
      attendance_status: ["present", "sick_leave", "weekly_off", "absent"],
      campaign_status: ["draft", "active", "completed", "cancelled"],
      daily_log_status: ["open", "completed", "cancelled"],
      leave_request_status: ["pending", "approved", "denied", "cancelled"],
      leave_type: [
        "annual_leave",
        "sick_leave",
        "paternity_leave",
        "maternity_leave",
        "casual_leave",
        "other",
      ],
      organization_status: ["active", "suspended"],
      photo_type: ["stock_shelf", "uniform_selfie", "checkout", "other"],
      sku_status: ["active", "inactive"],
      store_status: ["active", "inactive"],
      veda_activity_type: [
        "crayon_colouring",
        "watercolour_painting",
        "paper_crafts",
      ],
    },
  },
} as const
