/**
 * Fazoo database type map for supabase-js.
 *
 * Hand-written to match supabase/migrations exactly. Once a live project
 * exists regenerate with:
 *   supabase gen types typescript --local > src/database.types.ts
 */

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          timezone: string;
          status: Database['public']['Enums']['organization_status'];
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          name: string;
          slug: string;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          timezone: string;
          status: Database['public']['Enums']['organization_status'];
          settings: Json;
        }>;
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          phone: string;
          profile_photo_path: string | null;
          role: Database['public']['Enums']['app_role'];
          account_status: Database['public']['Enums']['account_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          full_name: string;
          phone: string;
          profile_photo_path?: string | null;
          role?: Database['public']['Enums']['app_role'];
          account_status?: Database['public']['Enums']['account_status'];
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      campaigns: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          start_date: string;
          end_date: string | null;
          status: Database['public']['Enums']['campaign_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<
            Database['public']['Tables']['campaigns']['Row'],
            'id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'campaigns_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      stores: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          address: string | null;
          latitude: number;
          longitude: number;
          geofence_radius_metres: number;
          status: Database['public']['Enums']['store_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<
            Database['public']['Tables']['stores']['Row'],
            'id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['stores']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'stores_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      brand_ambassador_assignments: {
        Row: {
          id: string;
          organization_id: string;
          brand_ambassador_id: string;
          campaign_id: string;
          store_id: string;
          weekly_off_day: number;
          start_date: string;
          end_date: string | null;
          status: Database['public']['Enums']['assignment_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<
            Database['public']['Tables']['brand_ambassador_assignments']['Row'],
            'id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['brand_ambassador_assignments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'brand_ambassador_assignments_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brand_ambassador_assignments_brand_ambassador_id_fkey';
            columns: ['brand_ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brand_ambassador_assignments_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brand_ambassador_assignments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      skus: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          name: string;
          code: string;
          description: string | null;
          status: Database['public']['Enums']['sku_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<Database['public']['Tables']['skus']['Row'], 'id' | 'created_at' | 'updated_at'>
        >;
        Update: Partial<Database['public']['Tables']['skus']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'skus_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'skus_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_logs: {
        Row: {
          id: string;
          organization_id: string;
          campaign_id: string;
          brand_ambassador_id: string;
          store_id: string;
          attendance_date: string;
          attendance_status: Database['public']['Enums']['attendance_status'];
          checkin_at: string | null;
          checkout_at: string | null;
          checkin_latitude: number | null;
          checkin_longitude: number | null;
          checkout_latitude: number | null;
          checkout_longitude: number | null;
          checkin_distance_metres: number | null;
          checkout_distance_metres: number | null;
          notes: string | null;
          status: Database['public']['Enums']['daily_log_status'];
          flagged: boolean;
          reopened_by: string | null;
          client_request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<
            Database['public']['Tables']['daily_logs']['Row'],
            'id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['daily_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'daily_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_logs_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_logs_brand_ambassador_id_fkey';
            columns: ['brand_ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_logs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_logs_reopened_by_fkey';
            columns: ['reopened_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sales_entries: {
        Row: {
          id: string;
          organization_id: string;
          daily_log_id: string;
          sku_id: string;
          quantity: number;
          recorded_at: string;
          client_request_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<
          Omit<
            Database['public']['Tables']['sales_entries']['Row'],
            'id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['sales_entries']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'sales_entries_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_entries_daily_log_id_fkey';
            columns: ['daily_log_id'];
            isOneToOne: false;
            referencedRelation: 'daily_logs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_entries_sku_id_fkey';
            columns: ['sku_id'];
            isOneToOne: false;
            referencedRelation: 'skus';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_log_photos: {
        Row: {
          id: string;
          organization_id: string;
          daily_log_id: string;
          photo_type: Database['public']['Enums']['photo_type'];
          storage_path: string;
          captured_at: string;
          created_at: string;
        };
        Insert: Partial<
          Omit<Database['public']['Tables']['daily_log_photos']['Row'], 'id' | 'created_at'>
        >;
        Update: Partial<Database['public']['Tables']['daily_log_photos']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'daily_log_photos_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_log_photos_daily_log_id_fkey';
            columns: ['daily_log_id'];
            isOneToOne: false;
            referencedRelation: 'daily_logs';
            referencedColumns: ['id'];
          },
        ];
      };
      supervisor_scopes: {
        Row: {
          id: string;
          organization_id: string;
          supervisor_id: string;
          campaign_id: string | null;
          store_id: string | null;
          created_at: string;
        };
        Insert: Partial<
          Omit<Database['public']['Tables']['supervisor_scopes']['Row'], 'id' | 'created_at'>
        >;
        Update: Partial<Database['public']['Tables']['supervisor_scopes']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'supervisor_scopes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supervisor_scopes_supervisor_id_fkey';
            columns: ['supervisor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supervisor_scopes_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supervisor_scopes_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      operation_receipts: {
        Row: {
          id: string;
          organization_id: string;
          brand_ambassador_id: string;
          client_request_id: string;
          operation: string;
          result: Json | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          brand_ambassador_id: string;
          client_request_id: string;
          operation: string;
          result?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['operation_receipts']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'operation_receipts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operation_receipts_brand_ambassador_id_fkey';
            columns: ['brand_ambassador_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Partial<
          Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>
        >;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'audit_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ba_today: { Args: Record<string, never>; Returns: Json };
      ba_checkin: {
        Args: {
          p_latitude: number;
          p_longitude: number;
          p_stock_photo_path: string;
          p_uniform_selfie_path: string;
          p_client_request_id: string;
          p_accuracy_metres?: number | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      ba_checkout: {
        Args: {
          p_latitude: number;
          p_longitude: number;
          p_client_request_id: string;
          p_accuracy_metres?: number | null;
          p_checkout_photo_path?: string | null;
        };
        Returns: Json;
      };
      ba_record_sale: {
        Args: {
          p_sku_id: string;
          p_quantity: number;
          p_client_request_id: string;
          p_recorded_at_hint?: string | null;
        };
        Returns: Json;
      };
      ba_update_sale: {
        Args: { p_sales_entry_id: string; p_quantity: number; p_client_request_id: string };
        Returns: Json;
      };
      ba_delete_sale: {
        Args: { p_sales_entry_id: string; p_client_request_id: string };
        Returns: Json;
      };
      ba_mark_sick_leave: {
        Args: { p_note?: string | null; p_client_request_id?: string | null };
        Returns: Json;
      };
      admin_set_account_status: {
        Args: { p_profile_id: string; p_action: string; p_reason?: string | null };
        Returns: Json;
      };
      admin_upsert_assignment: {
        Args: {
          p_brand_ambassador_id: string;
          p_campaign_id: string;
          p_store_id: string;
          p_weekly_off_day: number;
          p_start_date: string;
          p_end_date?: string | null;
          p_status?: Database['public']['Enums']['assignment_status'];
          p_assignment_id?: string | null;
        };
        Returns: string;
      };
      admin_reopen_daily_log: { Args: { p_daily_log_id: string }; Returns: undefined };
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: 'super_admin' | 'organization_admin' | 'supervisor' | 'brand_ambassador';
      account_status: 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';
      organization_status: 'active' | 'suspended';
      campaign_status: 'draft' | 'active' | 'completed' | 'cancelled';
      store_status: 'active' | 'inactive';
      assignment_status: 'active' | 'ended' | 'cancelled';
      sku_status: 'active' | 'inactive';
      attendance_status: 'present' | 'sick_leave' | 'weekly_off' | 'absent';
      daily_log_status: 'open' | 'completed' | 'cancelled';
      photo_type: 'stock_shelf' | 'uniform_selfie' | 'checkout' | 'other';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
