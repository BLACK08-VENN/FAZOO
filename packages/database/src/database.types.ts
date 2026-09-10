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
      ba_school_targets: {
        Row: {
          agency: Database["public"]["Enums"]["ba_agency"] | null
          brand_ambassador_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          period_end: string
          period_start: string
          target_schools: number
          updated_at: string
        }
        Insert: {
          agency?: Database["public"]["Enums"]["ba_agency"] | null
          brand_ambassador_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          target_schools: number
          updated_at?: string
        }
        Update: {
          agency?: Database["public"]["Enums"]["ba_agency"] | null
          brand_ambassador_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          target_schools?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ba_school_targets_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_school_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ba_school_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      booklist_documents: {
        Row: {
          captured_on_site: boolean
          client_request_id: string | null
          created_at: string
          file_size_bytes: number | null
          id: string
          is_current: boolean
          job_id: string
          kind: Database["public"]["Enums"]["booklist_document_kind"]
          mime_type: string | null
          ocr_confidence: number | null
          ocr_error: string | null
          ocr_finished_at: string | null
          ocr_provider: string | null
          ocr_started_at: string | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          organization_id: string
          page_count: number | null
          source_format: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          captured_on_site?: boolean
          client_request_id?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_current?: boolean
          job_id: string
          kind: Database["public"]["Enums"]["booklist_document_kind"]
          mime_type?: string | null
          ocr_confidence?: number | null
          ocr_error?: string | null
          ocr_finished_at?: string | null
          ocr_provider?: string | null
          ocr_started_at?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          organization_id: string
          page_count?: number | null
          source_format?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          captured_on_site?: boolean
          client_request_id?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          is_current?: boolean
          job_id?: string
          kind?: Database["public"]["Enums"]["booklist_document_kind"]
          mime_type?: string | null
          ocr_confidence?: number | null
          ocr_error?: string | null
          ocr_finished_at?: string | null
          ocr_provider?: string | null
          ocr_started_at?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          organization_id?: string
          page_count?: number | null
          source_format?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booklist_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "booklist_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_documents_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "school_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      booklist_jobs: {
        Row: {
          approved_by_school_at: string | null
          cancelled_reason: string | null
          completed_at: string | null
          converted_at: string | null
          converted_by: string | null
          copies_confirmed_at: string | null
          copies_confirmed_by: string | null
          copies_requested: number | null
          copies_to_print: number | null
          created_at: string
          dispatched_at: string | null
          document_received_at: string | null
          formatted_at: string | null
          formatted_document_id: string | null
          grade_notes: string | null
          id: string
          is_per_grade: boolean
          latest_visit_id: string | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          on_hold_reason: string | null
          organization_id: string
          owner_ba_id: string | null
          raw_document_id: string | null
          received_at: string | null
          school_acknowledged_by: string | null
          school_id: string
          stage: Database["public"]["Enums"]["booklist_stage"]
          stage_updated_at: string
          stage_updated_by: string | null
          stamped_document_id: string | null
          updated_at: string
        }
        Insert: {
          approved_by_school_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          converted_at?: string | null
          converted_by?: string | null
          copies_confirmed_at?: string | null
          copies_confirmed_by?: string | null
          copies_requested?: number | null
          copies_to_print?: number | null
          created_at?: string
          dispatched_at?: string | null
          document_received_at?: string | null
          formatted_at?: string | null
          formatted_document_id?: string | null
          grade_notes?: string | null
          id?: string
          is_per_grade?: boolean
          latest_visit_id?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          on_hold_reason?: string | null
          organization_id: string
          owner_ba_id?: string | null
          raw_document_id?: string | null
          received_at?: string | null
          school_acknowledged_by?: string | null
          school_id: string
          stage?: Database["public"]["Enums"]["booklist_stage"]
          stage_updated_at?: string
          stage_updated_by?: string | null
          stamped_document_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_by_school_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          converted_at?: string | null
          converted_by?: string | null
          copies_confirmed_at?: string | null
          copies_confirmed_by?: string | null
          copies_requested?: number | null
          copies_to_print?: number | null
          created_at?: string
          dispatched_at?: string | null
          document_received_at?: string | null
          formatted_at?: string | null
          formatted_document_id?: string | null
          grade_notes?: string | null
          id?: string
          is_per_grade?: boolean
          latest_visit_id?: string | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          on_hold_reason?: string | null
          organization_id?: string
          owner_ba_id?: string | null
          raw_document_id?: string | null
          received_at?: string | null
          school_acknowledged_by?: string | null
          school_id?: string
          stage?: Database["public"]["Enums"]["booklist_stage"]
          stage_updated_at?: string
          stage_updated_by?: string | null
          stamped_document_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booklist_jobs_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_copies_confirmed_by_fkey"
            columns: ["copies_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_formatted_document_id_fkey"
            columns: ["formatted_document_id"]
            isOneToOne: false
            referencedRelation: "booklist_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_latest_visit_id_fkey"
            columns: ["latest_visit_id"]
            isOneToOne: false
            referencedRelation: "school_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_owner_ba_id_fkey"
            columns: ["owner_ba_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_raw_document_id_fkey"
            columns: ["raw_document_id"]
            isOneToOne: false
            referencedRelation: "booklist_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "veda_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_stage_updated_by_fkey"
            columns: ["stage_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_jobs_stamped_document_id_fkey"
            columns: ["stamped_document_id"]
            isOneToOne: false
            referencedRelation: "booklist_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      booklist_stage_events: {
        Row: {
          changed_by: string | null
          changed_by_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          from_stage: Database["public"]["Enums"]["booklist_stage"] | null
          id: number
          job_id: string
          note: string | null
          organization_id: string
          to_stage: Database["public"]["Enums"]["booklist_stage"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["booklist_stage"] | null
          id?: never
          job_id: string
          note?: string | null
          organization_id: string
          to_stage: Database["public"]["Enums"]["booklist_stage"]
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["booklist_stage"] | null
          id?: never
          job_id?: string
          note?: string | null
          organization_id?: string
          to_stage?: Database["public"]["Enums"]["booklist_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "booklist_stage_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_stage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "booklist_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booklist_stage_events_organization_id_fkey"
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
          store_id: string | null
          updated_at: string
          weekly_off_day: number[]
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
          store_id?: string | null
          updated_at?: string
          weekly_off_day?: number[]
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
          store_id?: string | null
          updated_at?: string
          weekly_off_day?: number[]
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
      campaign_unlocks: {
        Row: {
          campaign_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_unlocks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_unlocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          access_code: string | null
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
          access_code?: string | null
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
          access_code?: string | null
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
          kind: string
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
          kind?: string
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
          kind?: string
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
      print_orders: {
        Row: {
          cancelled_reason: string | null
          client_request_id: string | null
          created_at: string
          dispatch_carrier: string | null
          dispatch_means: Database["public"]["Enums"]["dispatch_means"] | null
          dispatch_notes: string | null
          dispatch_tracking_ref: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          includes_stamped_copy: boolean
          job_id: string
          ordered_at: string | null
          ordered_by: string | null
          organization_id: string
          printer_name: string | null
          production_started_at: string | null
          quantity: number
          ready_at: string | null
          receipt_notes: string | null
          received_at: string | null
          received_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["print_order_status"]
          updated_at: string
        }
        Insert: {
          cancelled_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          dispatch_carrier?: string | null
          dispatch_means?: Database["public"]["Enums"]["dispatch_means"] | null
          dispatch_notes?: string | null
          dispatch_tracking_ref?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          includes_stamped_copy?: boolean
          job_id: string
          ordered_at?: string | null
          ordered_by?: string | null
          organization_id: string
          printer_name?: string | null
          production_started_at?: string | null
          quantity: number
          ready_at?: string | null
          receipt_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["print_order_status"]
          updated_at?: string
        }
        Update: {
          cancelled_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          dispatch_carrier?: string | null
          dispatch_means?: Database["public"]["Enums"]["dispatch_means"] | null
          dispatch_notes?: string | null
          dispatch_tracking_ref?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          includes_stamped_copy?: boolean
          job_id?: string
          ordered_at?: string | null
          ordered_by?: string | null
          organization_id?: string
          printer_name?: string | null
          production_started_at?: string | null
          quantity?: number
          ready_at?: string | null
          receipt_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["print_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_orders_dispatched_by_fkey"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "booklist_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          agency: Database["public"]["Enums"]["ba_agency"] | null
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
          agency?: Database["public"]["Enums"]["ba_agency"] | null
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
          agency?: Database["public"]["Enums"]["ba_agency"] | null
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
      school_visits: {
        Row: {
          accuracy_metres: number | null
          agency: Database["public"]["Enums"]["ba_agency"] | null
          arrived_at: string
          brand_ambassador_id: string
          client_request_id: string | null
          contact_person_name: string | null
          contact_person_phone: string | null
          contact_person_role: string | null
          created_at: string
          declined_reason_code: string | null
          declined_reason_notes: string | null
          distance_metres: number | null
          geofence_status: Database["public"]["Enums"]["geofence_outcome"]
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          organization_id: string
          outcome: Database["public"]["Enums"]["visit_outcome"]
          school_id: string
          selfie_captured_at: string | null
          selfie_photo_path: string | null
          selfie_required: boolean
          updated_at: string
          visit_date: string
        }
        Insert: {
          accuracy_metres?: number | null
          agency?: Database["public"]["Enums"]["ba_agency"] | null
          arrived_at?: string
          brand_ambassador_id: string
          client_request_id?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          contact_person_role?: string | null
          created_at?: string
          declined_reason_code?: string | null
          declined_reason_notes?: string | null
          distance_metres?: number | null
          geofence_status?: Database["public"]["Enums"]["geofence_outcome"]
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id: string
          outcome?: Database["public"]["Enums"]["visit_outcome"]
          school_id: string
          selfie_captured_at?: string | null
          selfie_photo_path?: string | null
          selfie_required?: boolean
          updated_at?: string
          visit_date: string
        }
        Update: {
          accuracy_metres?: number | null
          agency?: Database["public"]["Enums"]["ba_agency"] | null
          arrived_at?: string
          brand_ambassador_id?: string
          client_request_id?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          contact_person_role?: string | null
          created_at?: string
          declined_reason_code?: string | null
          declined_reason_notes?: string | null
          distance_metres?: number | null
          geofence_status?: Database["public"]["Enums"]["geofence_outcome"]
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id?: string
          outcome?: Database["public"]["Enums"]["visit_outcome"]
          school_id?: string
          selfie_captured_at?: string | null
          selfie_photo_path?: string | null
          selfie_required?: boolean
          updated_at?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_visits_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_visits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "veda_schools"
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
      veda_assignments: {
        Row: {
          brand_ambassador_id: string
          created_at: string
          end_date: string | null
          id: string
          organization_id: string
          region: string | null
          start_date: string
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
          weekly_off_day: number[] | null
        }
        Insert: {
          brand_ambassador_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id: string
          region?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          weekly_off_day?: number[] | null
        }
        Update: {
          brand_ambassador_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          region?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          weekly_off_day?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "veda_assignments_brand_ambassador_id_fkey"
            columns: ["brand_ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veda_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      veda_grades: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          status: Database["public"]["Enums"]["sku_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["sku_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["sku_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veda_grades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      veda_schools: {
        Row: {
          address: string | null
          assigned_ba_name: string | null
          booklist_collection_visit: string | null
          booklist_print_response: string | null
          contact_person_designation: string | null
          contact_person_name: string | null
          contact_person_phone: string | null
          created_at: string
          geofence_radius_metres: number
          id: string
          latitude: number | null
          legacy_id: number | null
          longitude: number | null
          max_total_population: number | null
          name: string
          organization_id: string
          region: string | null
          school_type: string | null
          source_code: string | null
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_ba_name?: string | null
          booklist_collection_visit?: string | null
          booklist_print_response?: string | null
          contact_person_designation?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          created_at?: string
          geofence_radius_metres?: number
          id?: string
          latitude?: number | null
          legacy_id?: number | null
          longitude?: number | null
          max_total_population?: number | null
          name: string
          organization_id: string
          region?: string | null
          school_type?: string | null
          source_code?: string | null
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_ba_name?: string | null
          booklist_collection_visit?: string | null
          booklist_print_response?: string | null
          contact_person_designation?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          created_at?: string
          geofence_radius_metres?: number
          id?: string
          latitude?: number | null
          legacy_id?: number | null
          longitude?: number | null
          max_total_population?: number | null
          name?: string
          organization_id?: string
          region?: string | null
          school_type?: string | null
          source_code?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_status_active: { Args: never; Returns: boolean }
      admin_advance_stage: {
        Args: {
          p_job_id: string
          p_note?: string
          p_stage: Database["public"]["Enums"]["booklist_stage"]
        }
        Returns: Json
      }
      admin_ba_performance: {
        Args: {
          p_agency?: Database["public"]["Enums"]["ba_agency"]
          p_period_end?: string
          p_period_start?: string
        }
        Returns: Json
      }
      admin_booklist_queue: {
        Args: {
          p_limit?: number
          p_ocr_status?: Database["public"]["Enums"]["ocr_status"]
        }
        Returns: Json
      }
      admin_create_ba: {
        Args: {
          p_end_date?: string
          p_start_date: string
          p_user_id: string
          p_weekly_off_day: number[]
        }
        Returns: Json
      }
      admin_create_campaign: {
        Args: {
          p_description?: string
          p_end_date?: string
          p_name: string
          p_organization_id: string
          p_start_date?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_create_print_order: {
        Args: {
          p_client_request_id?: string
          p_job_id: string
          p_note?: string
          p_printer_name?: string
          p_quantity: number
          p_reference?: string
        }
        Returns: Json
      }
      admin_delete_ba: { Args: { p_profile_id: string }; Returns: Json }
      admin_delete_campaign: { Args: { p_campaign_id: string }; Returns: Json }
      admin_delete_organization: { Args: { p_org_id: string }; Returns: Json }
      admin_delete_sku: { Args: { p_sku_id: string }; Returns: Json }
      admin_delete_store: { Args: { p_store_id: string }; Returns: Json }
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
      admin_pipeline_board: {
        Args: {
          p_agency?: Database["public"]["Enums"]["ba_agency"]
          p_ba_id?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_region?: string
          p_stage?: Database["public"]["Enums"]["booklist_stage"]
          p_to?: string
        }
        Returns: Json
      }
      admin_publish_formatted_document: {
        Args: {
          p_file_size_bytes?: number
          p_is_per_grade?: boolean
          p_job_id: string
          p_mime_type?: string
          p_note?: string
          p_page_count?: number
          p_storage_path: string
        }
        Returns: Json
      }
      admin_record_ocr_result: {
        Args: {
          p_actor_id?: string
          p_confidence?: number
          p_draft_mime_type?: string
          p_draft_size_bytes?: number
          p_draft_storage_path?: string
          p_error?: string
          p_job_id: string
          p_page_count?: number
          p_provider?: string
          p_status: Database["public"]["Enums"]["ocr_status"]
        }
        Returns: Json
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
      admin_school_dossier: { Args: { p_school_id: string }; Returns: Json }
      admin_set_account_status: {
        Args: { p_action: string; p_profile_id: string; p_reason?: string }
        Returns: Json
      }
      admin_set_ba_agency: {
        Args: {
          p_agency: Database["public"]["Enums"]["ba_agency"]
          p_ba_id: string
        }
        Returns: Json
      }
      admin_set_ba_target: {
        Args: {
          p_ba_id: string
          p_period_end: string
          p_period_start: string
          p_target_id?: string
          p_target_schools: number
        }
        Returns: Json
      }
      admin_set_organization_status: {
        Args: { p_org_id: string; p_status: string }
        Returns: Json
      }
      admin_update_print_order: {
        Args: {
          p_cancelled_reason?: string
          p_client_request_id?: string
          p_dispatch_carrier?: string
          p_dispatch_means?: Database["public"]["Enums"]["dispatch_means"]
          p_dispatch_notes?: string
          p_dispatch_tracking_ref?: string
          p_dispatched_at?: string
          p_note?: string
          p_order_id: string
          p_printer_name?: string
          p_quantity?: number
          p_receipt_notes?: string
          p_received_at?: string
          p_reference?: string
          p_status?: Database["public"]["Enums"]["print_order_status"]
        }
        Returns: Json
      }
      admin_update_school: {
        Args: {
          p_address?: string
          p_contact_person_designation?: string
          p_contact_person_name?: string
          p_contact_person_phone?: string
          p_geofence_radius_metres?: number
          p_latitude?: number
          p_longitude?: number
          p_name?: string
          p_region?: string
          p_school_id: string
          p_school_type?: string
          p_status?: Database["public"]["Enums"]["store_status"]
        }
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
          p_weekly_off_day: number[]
        }
        Returns: string
      }
      assert_active_ba: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          agency: Database["public"]["Enums"]["ba_agency"] | null
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
      assert_org_admin: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          agency: Database["public"]["Enums"]["ba_agency"] | null
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
      assert_org_staff: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          agency: Database["public"]["Enums"]["ba_agency"] | null
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
      assert_own_storage_path: {
        Args: {
          p_label?: string
          p_organization_id: string
          p_path: string
          p_user_id: string
        }
        Returns: undefined
      }
      assert_school_ba: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          agency: Database["public"]["Enums"]["ba_agency"] | null
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
      ba_brand_options: { Args: never; Returns: Json }
      ba_checkin: {
        Args: {
          p_accuracy_metres?: number
          p_assignment_id: string
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
          p_daily_log_id?: string
          p_latitude: number
          p_longitude: number
          p_stock_photo_path?: string
          p_uniform_selfie_path?: string
        }
        Returns: Json
      }
      ba_confirm_copies: {
        Args: {
          p_client_request_id: string
          p_copies_requested: number
          p_job_id: string
          p_notes?: string
          p_school_acknowledged_by?: string
        }
        Returns: Json
      }
      ba_create_school: {
        Args: {
          p_address?: string
          p_client_request_id?: string
          p_contact_person_name?: string
          p_contact_person_phone?: string
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_region?: string
          p_school_type?: string
        }
        Returns: Json
      }
      ba_delete_sale: {
        Args: { p_daily_log_id?: string; p_sales_entry_id: string }
        Returns: undefined
      }
      ba_list_campaigns: { Args: never; Returns: Json }
      ba_list_veda_schools: { Args: never; Returns: Json }
      ba_mark_pending_school_approval: {
        Args: {
          p_client_request_id: string
          p_job_id: string
          p_notes?: string
        }
        Returns: Json
      }
      ba_mark_sick_leave: {
        Args: {
          p_assignment_id?: string
          p_client_request_id?: string
          p_note?: string
        }
        Returns: Json
      }
      ba_my_campaigns: { Args: never; Returns: Json }
      ba_my_history: { Args: { p_limit?: number }; Returns: Json }
      ba_record_sale: {
        Args: {
          p_client_request_id: string
          p_daily_log_id?: string
          p_quantity: number
          p_recorded_at_hint?: string
          p_sku_id: string
        }
        Returns: Json
      }
      ba_record_visit_outcome: {
        Args: {
          p_client_request_id?: string
          p_contact_person_name?: string
          p_contact_person_phone?: string
          p_contact_person_role?: string
          p_declined_reason_code?: string
          p_declined_reason_notes?: string
          p_is_per_grade?: boolean
          p_notes?: string
          p_outcome?: Database["public"]["Enums"]["visit_outcome"]
          p_visit_client_request_id?: string
          p_visit_id?: string
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
      ba_school_job_detail: { Args: { p_job_id: string }; Returns: Json }
      ba_school_pipeline: {
        Args: {
          p_limit?: number
          p_query?: string
          p_stage?: Database["public"]["Enums"]["booklist_stage"]
        }
        Returns: Json
      }
      ba_search_schools: {
        Args: { p_limit?: number; p_query?: string; p_region?: string }
        Returns: Json
      }
      ba_start_school_visit: {
        Args: {
          p_accuracy_metres?: number
          p_client_request_id: string
          p_contact_person_name?: string
          p_contact_person_phone?: string
          p_contact_person_role?: string
          p_latitude?: number
          p_longitude?: number
          p_notes?: string
          p_school_id: string
          p_selfie_photo_path?: string
        }
        Returns: Json
      }
      ba_submit_booklist_document: {
        Args: {
          p_captured_on_site?: boolean
          p_client_request_id?: string
          p_file_size_bytes?: number
          p_grade_notes?: string
          p_is_per_grade?: boolean
          p_mime_type?: string
          p_notes?: string
          p_page_count?: number
          p_source_format?: string
          p_storage_path?: string
          p_visit_client_request_id?: string
          p_visit_id?: string
        }
        Returns: Json
      }
      ba_submit_leave_request: {
        Args: {
          p_assignment_id: string
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
      ba_submit_stamped_copy: {
        Args: {
          p_client_request_id: string
          p_file_size_bytes?: number
          p_job_id: string
          p_mime_type?: string
          p_notes?: string
          p_storage_path: string
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
      ba_unlock_campaign: {
        Args: { p_campaign_id: string; p_code: string }
        Returns: undefined
      }
      ba_update_sale: {
        Args: {
          p_daily_log_id?: string
          p_quantity: number
          p_sales_entry_id: string
        }
        Returns: undefined
      }
      ba_visit_rules: {
        Args: {
          p_agency: Database["public"]["Enums"]["ba_agency"]
          p_organization_id: string
        }
        Returns: Json
      }
      ba_visit_stats: { Args: never; Returns: Json }
      can_read_booklist_document: {
        Args: { p_object_name: string }
        Returns: boolean
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
          p_access_code?: string
          p_ba_user_ids?: string[]
          p_brand_admin_user_id: string
          p_campaign_end?: string
          p_campaign_name: string
          p_campaign_start: string
          p_name: string
          p_slug: string
          p_store_address?: string
          p_store_lat?: number
          p_store_lng?: number
          p_store_name?: string
          p_store_radius?: number
          p_timezone?: string
          p_weekly_off_day?: number[]
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
      current_user_org_kind: { Args: never; Returns: string }
      current_user_role_hint: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      distance_metres: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_org_admin: { Args: { p_organization_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      joinable_brands: {
        Args: never
        Returns: {
          has_code_gate: boolean
          logo_url: string
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
          kind: string
          logo_url: string
          organization_id: string
          organization_name: string
          organization_slug: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      normalize_off_days: { Args: { p_days: number[] }; Returns: number[] }
      resolve_school_visit: {
        Args: {
          p_profile: Database["public"]["Tables"]["profiles"]["Row"]
          p_visit_client_request_id: string
          p_visit_id: string
        }
        Returns: string
      }
      set_booklist_stage: {
        Args: {
          p_actor: string
          p_job_id: string
          p_note?: string
          p_to: Database["public"]["Enums"]["booklist_stage"]
        }
        Returns: undefined
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
      veda_admin_upsert_assignment: {
        Args: {
          p_assignment_id?: string
          p_brand_ambassador_id: string
          p_end_date?: string
          p_region: string
          p_start_date?: string
          p_status?: Database["public"]["Enums"]["assignment_status"]
          p_weekly_off_day?: number[]
        }
        Returns: string
      }
      veda_admin_upsert_grade: {
        Args: {
          p_code: string
          p_grade_id?: string
          p_name: string
          p_sort_order?: number
          p_status?: Database["public"]["Enums"]["sku_status"]
        }
        Returns: string
      }
      veda_admin_upsert_school: {
        Args: {
          p_geofence_radius_metres?: number
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_region?: string
          p_school_id?: string
        }
        Returns: string
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
      ba_agency: "ael" | "veda"
      booklist_document_kind:
        | "raw_upload"
        | "ocr_draft"
        | "formatted"
        | "printed_proof"
        | "stamped_copy"
      booklist_stage:
        | "engaged"
        | "declined"
        | "booklist_offered"
        | "document_received"
        | "awaiting_conversion"
        | "converting"
        | "formatted"
        | "pending_school_approval"
        | "school_approved"
        | "in_production"
        | "dispatched"
        | "received"
        | "completed"
        | "on_hold"
        | "cancelled"
      campaign_status: "draft" | "active" | "completed" | "cancelled"
      daily_log_status: "open" | "completed" | "cancelled"
      dispatch_means:
        | "courier"
        | "boda_boda"
        | "own_fleet"
        | "ba_pickup"
        | "postal"
        | "third_party"
        | "other"
      geofence_outcome: "inside" | "outside" | "no_coordinates" | "not_checked"
      leave_request_status: "pending" | "approved" | "denied" | "cancelled"
      leave_type:
        | "annual_leave"
        | "sick_leave"
        | "paternity_leave"
        | "maternity_leave"
        | "casual_leave"
        | "other"
      ocr_status:
        | "not_required"
        | "queued"
        | "processing"
        | "succeeded"
        | "failed"
        | "manual_required"
      organization_status: "active" | "suspended"
      photo_type:
        | "stock_shelf"
        | "uniform_selfie"
        | "checkout"
        | "other"
        | "checkout_stock_shelf"
        | "checkout_uniform_selfie"
      print_order_status:
        | "draft"
        | "ordered"
        | "in_production"
        | "ready"
        | "dispatched"
        | "received"
        | "cancelled"
      sku_status: "active" | "inactive"
      store_status: "active" | "inactive"
      visit_outcome: "pending" | "booklist_offered" | "declined"
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
      ba_agency: ["ael", "veda"],
      booklist_document_kind: [
        "raw_upload",
        "ocr_draft",
        "formatted",
        "printed_proof",
        "stamped_copy",
      ],
      booklist_stage: [
        "engaged",
        "declined",
        "booklist_offered",
        "document_received",
        "awaiting_conversion",
        "converting",
        "formatted",
        "pending_school_approval",
        "school_approved",
        "in_production",
        "dispatched",
        "received",
        "completed",
        "on_hold",
        "cancelled",
      ],
      campaign_status: ["draft", "active", "completed", "cancelled"],
      daily_log_status: ["open", "completed", "cancelled"],
      dispatch_means: [
        "courier",
        "boda_boda",
        "own_fleet",
        "ba_pickup",
        "postal",
        "third_party",
        "other",
      ],
      geofence_outcome: ["inside", "outside", "no_coordinates", "not_checked"],
      leave_request_status: ["pending", "approved", "denied", "cancelled"],
      leave_type: [
        "annual_leave",
        "sick_leave",
        "paternity_leave",
        "maternity_leave",
        "casual_leave",
        "other",
      ],
      ocr_status: [
        "not_required",
        "queued",
        "processing",
        "succeeded",
        "failed",
        "manual_required",
      ],
      organization_status: ["active", "suspended"],
      photo_type: [
        "stock_shelf",
        "uniform_selfie",
        "checkout",
        "other",
        "checkout_stock_shelf",
        "checkout_uniform_selfie",
      ],
      print_order_status: [
        "draft",
        "ordered",
        "in_production",
        "ready",
        "dispatched",
        "received",
        "cancelled",
      ],
      sku_status: ["active", "inactive"],
      store_status: ["active", "inactive"],
      visit_outcome: ["pending", "booklist_offered", "declined"],
    },
  },
} as const
