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
      activity_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_key: string
          id: string
          is_read: boolean
          message: string
          organization_id: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key: string
          id?: string
          is_read?: boolean
          message: string
          organization_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_key?: string
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_login_identifiers: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          identifier_normalized: string
          identifier_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          identifier_normalized: string
          identifier_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          identifier_normalized?: string
          identifier_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_login_identifiers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_warnings: {
        Row: {
          category: string
          created_at: string
          description: string
          driver_id: string
          driver_seen_at: string | null
          id: string
          incident_at: string
          issued_at: string
          issued_by_user_id: string
          organization_id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_user_id: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          driver_id: string
          driver_seen_at?: string | null
          id?: string
          incident_at: string
          issued_at?: string
          issued_by_user_id: string
          organization_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          severity: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          driver_id?: string
          driver_seen_at?: string | null
          id?: string
          incident_at?: string
          issued_at?: string
          issued_by_user_id?: string
          organization_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_warnings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_warnings_issued_by_user_id_fkey"
            columns: ["issued_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_warnings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_warnings_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_leave_request_details: {
        Row: {
          end_date: string
          leave_type: string
          reason: string
          request_id: string
          start_date: string
        }
        Insert: {
          end_date: string
          leave_type: string
          reason: string
          request_id: string
          start_date: string
        }
        Update: {
          end_date?: string
          leave_type?: string
          reason?: string
          request_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_leave_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "driver_app_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_maintenance_request_details: {
        Row: {
          maintenance_category: string
          problem_description: string
          request_id: string
          urgency: string
        }
        Insert: {
          maintenance_category: string
          problem_description: string
          request_id: string
          urgency: string
        }
        Update: {
          maintenance_category?: string
          problem_description?: string
          request_id?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_maintenance_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "driver_app_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_meeting_request_details: {
        Row: {
          preferred_date: string | null
          preferred_time: string | null
          reason: string
          request_id: string
          requested_manager_user_id: string | null
          scheduled_at: string | null
          subject: string
        }
        Insert: {
          preferred_date?: string | null
          preferred_time?: string | null
          reason: string
          request_id: string
          requested_manager_user_id?: string | null
          scheduled_at?: string | null
          subject: string
        }
        Update: {
          preferred_date?: string | null
          preferred_time?: string | null
          reason?: string
          request_id?: string
          requested_manager_user_id?: string | null
          scheduled_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_meeting_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "driver_app_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_meeting_request_details_requested_manager_user_id_fkey"
            columns: ["requested_manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_oil_change_request_details: {
        Row: {
          current_odometer_reading: number
          note: string | null
          request_id: string
          scheduled_at: string | null
        }
        Insert: {
          current_odometer_reading: number
          note?: string | null
          request_id: string
          scheduled_at?: string | null
        }
        Update: {
          current_odometer_reading?: number
          note?: string | null
          request_id?: string
          scheduled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_oil_change_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "driver_app_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_app_requests: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          client_submission_id: string | null
          created_at: string
          driver_id: string
          id: string
          organization_id: string
          request_type: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_note: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_plate_snapshot: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          client_submission_id?: string | null
          created_at?: string
          driver_id: string
          id?: string
          organization_id: string
          request_type: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_note?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          client_submission_id?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          organization_id?: string
          request_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_note?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_app_requests_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_app_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_bank_details: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          driver_id: string
          iban: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          driver_id: string
          iban?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          driver_id?: string
          iban?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_bank_details_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_daily_report_rows: {
        Row: {
          accepted_tasks: number
          attendance_status: Database["public"]["Enums"]["driver_report_attendance_status"]
          city_ranking: number | null
          created_at: string
          delivered_tasks: number
          delivery_rate: number | null
          driver_full_name: string
          driver_id: string
          eligibility_status:
            | Database["public"]["Enums"]["driver_report_eligibility_status"]
            | null
          estimated_reward_amount: number | null
          evaluation_completion_rate: number | null
          evaluation_on_time_rate: number | null
          evaluation_total_orders: number | null
          id: string
          incomplete_orders: number
          keeta_driver_id: string | null
          level: string | null
          mandatory_assignment_score: number | null
          not_early_delivery_confirmation_rate: number | null
          on_time_rate: number | null
          organization_id: string
          ranking_percentage: number | null
          rejected_tasks: number
          report_date: string
          report_id: string
          updated_at: string
          valid_online_seconds: number
        }
        Insert: {
          accepted_tasks?: number
          attendance_status: Database["public"]["Enums"]["driver_report_attendance_status"]
          city_ranking?: number | null
          created_at?: string
          delivered_tasks?: number
          delivery_rate?: number | null
          driver_full_name: string
          driver_id: string
          eligibility_status?:
            | Database["public"]["Enums"]["driver_report_eligibility_status"]
            | null
          estimated_reward_amount?: number | null
          evaluation_completion_rate?: number | null
          evaluation_on_time_rate?: number | null
          evaluation_total_orders?: number | null
          id?: string
          incomplete_orders?: number
          keeta_driver_id?: string | null
          level?: string | null
          mandatory_assignment_score?: number | null
          not_early_delivery_confirmation_rate?: number | null
          on_time_rate?: number | null
          organization_id: string
          ranking_percentage?: number | null
          rejected_tasks?: number
          report_date: string
          report_id: string
          updated_at?: string
          valid_online_seconds?: number
        }
        Update: {
          accepted_tasks?: number
          attendance_status?: Database["public"]["Enums"]["driver_report_attendance_status"]
          city_ranking?: number | null
          created_at?: string
          delivered_tasks?: number
          delivery_rate?: number | null
          driver_full_name?: string
          driver_id?: string
          eligibility_status?:
            | Database["public"]["Enums"]["driver_report_eligibility_status"]
            | null
          estimated_reward_amount?: number | null
          evaluation_completion_rate?: number | null
          evaluation_on_time_rate?: number | null
          evaluation_total_orders?: number | null
          id?: string
          incomplete_orders?: number
          keeta_driver_id?: string | null
          level?: string | null
          mandatory_assignment_score?: number | null
          not_early_delivery_confirmation_rate?: number | null
          on_time_rate?: number | null
          organization_id?: string
          ranking_percentage?: number | null
          rejected_tasks?: number
          report_date?: string
          report_id?: string
          updated_at?: string
          valid_online_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_daily_report_rows_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_daily_report_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_daily_report_rows_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "driver_daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_daily_reports: {
        Row: {
          absent_drivers: number
          created_at: string
          drivers_missing_keeta_id: number
          id: string
          imported_at: string
          imported_by_user_id: string | null
          matched_ranking_rows: number
          organization_id: string
          present_drivers: number
          registered_active_drivers: number
          report_date: string
          unmatched_performance_ids: string[]
          unmatched_ranking_ids: string[]
          updated_at: string
        }
        Insert: {
          absent_drivers: number
          created_at?: string
          drivers_missing_keeta_id?: number
          id?: string
          imported_at?: string
          imported_by_user_id?: string | null
          matched_ranking_rows: number
          organization_id: string
          present_drivers: number
          registered_active_drivers: number
          report_date: string
          unmatched_performance_ids?: string[]
          unmatched_ranking_ids?: string[]
          updated_at?: string
        }
        Update: {
          absent_drivers?: number
          created_at?: string
          drivers_missing_keeta_id?: number
          id?: string
          imported_at?: string
          imported_by_user_id?: string | null
          matched_ranking_rows?: number
          organization_id?: string
          present_drivers?: number
          registered_active_drivers?: number
          report_date?: string
          unmatched_performance_ids?: string[]
          unmatched_ranking_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_daily_reports_imported_by_user_id_fkey"
            columns: ["imported_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_daily_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["driver_document_type"]
          driver_id: string
          id: string
          mime_type: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["driver_document_type"]
          driver_id: string
          id?: string
          mime_type: string
          original_filename: string
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["driver_document_type"]
          driver_id?: string
          id?: string
          mime_type?: string
          original_filename?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_shifts: {
        Row: {
          created_at: string
          driver_id: string
          end_ocr_confidence: number | null
          end_ocr_provider: string | null
          end_ocr_reading: string | null
          end_ocr_status: string | null
          end_odometer_reading: number | null
          end_photo_captured_at: string | null
          end_photo_path: string | null
          end_review_note: string | null
          end_review_status: string | null
          end_reviewed_at: string | null
          end_reviewed_by: string | null
          end_verified_at: string | null
          ended_at: string | null
          id: string
          organization_id: string
          start_ocr_confidence: number | null
          start_ocr_provider: string | null
          start_ocr_reading: string | null
          start_ocr_status: string | null
          start_odometer_reading: number
          start_photo_captured_at: string
          start_photo_path: string
          start_review_note: string | null
          start_review_status: string
          start_reviewed_at: string | null
          start_reviewed_by: string | null
          start_verified_at: string | null
          started_at: string
          status: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate_snapshot: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          end_ocr_confidence?: number | null
          end_ocr_provider?: string | null
          end_ocr_reading?: string | null
          end_ocr_status?: string | null
          end_odometer_reading?: number | null
          end_photo_captured_at?: string | null
          end_photo_path?: string | null
          end_review_note?: string | null
          end_review_status?: string | null
          end_reviewed_at?: string | null
          end_reviewed_by?: string | null
          end_verified_at?: string | null
          ended_at?: string | null
          id?: string
          organization_id: string
          start_ocr_confidence?: number | null
          start_ocr_provider?: string | null
          start_ocr_reading?: string | null
          start_ocr_status?: string | null
          start_odometer_reading: number
          start_photo_captured_at: string
          start_photo_path: string
          start_review_note?: string | null
          start_review_status?: string
          start_reviewed_at?: string | null
          start_reviewed_by?: string | null
          start_verified_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          end_ocr_confidence?: number | null
          end_ocr_provider?: string | null
          end_ocr_reading?: string | null
          end_ocr_status?: string | null
          end_odometer_reading?: number | null
          end_photo_captured_at?: string | null
          end_photo_path?: string | null
          end_review_note?: string | null
          end_review_status?: string | null
          end_reviewed_at?: string | null
          end_reviewed_by?: string | null
          end_verified_at?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string
          start_ocr_confidence?: number | null
          start_ocr_provider?: string | null
          start_ocr_reading?: string | null
          start_ocr_status?: string | null
          start_odometer_reading?: number
          start_photo_captured_at?: string
          start_photo_path?: string
          start_review_note?: string | null
          start_review_status?: string
          start_reviewed_at?: string | null
          start_reviewed_by?: string | null
          start_verified_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_shifts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_shifts_end_reviewed_by_fkey"
            columns: ["end_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_shifts_start_reviewed_by_fkey"
            columns: ["start_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_shifts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          deleted_by_user_id: string | null
          driver_card_expiry_date: string
          driver_card_number: string
          driving_license_expiry_date: string | null
          driving_license_number: string | null
          full_name: string
          id: string
          iqama_expiry_date: string
          iqama_number: string
          is_company_sponsored: boolean
          is_vehicle_owner: boolean | null
          keeta_driver_id: string | null
          keeta_username: string
          keeta_vehicle_plate_number: string | null
          mobile_number: string
          nationality: string
          operating_card_expiry_date: string | null
          operating_card_file_path: string | null
          operating_card_number: string | null
          organization_id: string
          profile_photo_path: string | null
          settlement_type:
            | Database["public"]["Enums"]["driver_settlement_type"]
            | null
          status: Database["public"]["Enums"]["driver_status"]
          updated_at: string
          updated_by_user_id: string | null
          vehicle_authorization_expiry_date: string
          vehicle_authorization_number: string
          vehicle_brand: string | null
          vehicle_number: string
          vehicle_owner_identifier: string | null
          vehicle_serial_number: string | null
          vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          driver_card_expiry_date: string
          driver_card_number: string
          driving_license_expiry_date?: string | null
          driving_license_number?: string | null
          full_name: string
          id?: string
          iqama_expiry_date: string
          iqama_number: string
          is_company_sponsored: boolean
          is_vehicle_owner?: boolean | null
          keeta_driver_id?: string | null
          keeta_username: string
          keeta_vehicle_plate_number?: string | null
          mobile_number: string
          nationality: string
          operating_card_expiry_date?: string | null
          operating_card_file_path?: string | null
          operating_card_number?: string | null
          organization_id: string
          profile_photo_path?: string | null
          settlement_type?:
            | Database["public"]["Enums"]["driver_settlement_type"]
            | null
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
          updated_by_user_id?: string | null
          vehicle_authorization_expiry_date: string
          vehicle_authorization_number: string
          vehicle_brand?: string | null
          vehicle_number: string
          vehicle_owner_identifier?: string | null
          vehicle_serial_number?: string | null
          vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          driver_card_expiry_date?: string
          driver_card_number?: string
          driving_license_expiry_date?: string | null
          driving_license_number?: string | null
          full_name?: string
          id?: string
          iqama_expiry_date?: string
          iqama_number?: string
          is_company_sponsored?: boolean
          is_vehicle_owner?: boolean | null
          keeta_driver_id?: string | null
          keeta_username?: string
          keeta_vehicle_plate_number?: string | null
          mobile_number?: string
          nationality?: string
          operating_card_expiry_date?: string | null
          operating_card_file_path?: string | null
          operating_card_number?: string | null
          organization_id?: string
          profile_photo_path?: string | null
          settlement_type?:
            | Database["public"]["Enums"]["driver_settlement_type"]
            | null
          status?: Database["public"]["Enums"]["driver_status"]
          updated_at?: string
          updated_by_user_id?: string | null
          vehicle_authorization_expiry_date?: string
          vehicle_authorization_number?: string
          vehicle_brand?: string | null
          vehicle_number?: string
          vehicle_owner_identifier?: string | null
          vehicle_serial_number?: string | null
          vehicle_type?: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "drivers_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_deleted_by_user_id_fkey"
            columns: ["deleted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicle_activity_logs: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          new_values: Json | null
          note: string | null
          old_values: Json | null
          organization_id: string
          vehicle_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id: string
          new_values?: Json | null
          note?: string | null
          old_values?: Json | null
          organization_id: string
          vehicle_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          note?: string | null
          old_values?: Json | null
          organization_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicle_activity_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicle_activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicle_activity_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_driver_id: string | null
          assigned_driver_manual_iqama: string | null
          assigned_driver_manual_name: string | null
          assigned_driver_source: string
          authorization_expiry_date: string | null
          authorized_driver_id: string | null
          authorized_manual_iqama: string | null
          authorized_manual_name: string | null
          authorized_person_source: string
          created_at: string
          created_by: string
          fault_location: string | null
          id: string
          manual_owner_name: string | null
          normalized_plate_number: string
          notes: string | null
          operating_card_expiry_date: string | null
          operating_card_file_name: string | null
          operating_card_file_path: string | null
          operating_card_mime_type: string | null
          operating_card_number: string | null
          operational_status: string
          organization_id: string
          owner_organization_id: string | null
          owner_source: string
          plate_number: string
          suspended_at: string | null
          suspended_by: string | null
          technical_status: string
          technical_status_changed_at: string | null
          technical_status_changed_by: string | null
          technical_status_note: string | null
          updated_at: string
          updated_by: string
          vehicle_category: string
          vehicle_type: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_driver_id?: string | null
          assigned_driver_manual_iqama?: string | null
          assigned_driver_manual_name?: string | null
          assigned_driver_source?: string
          authorization_expiry_date?: string | null
          authorized_driver_id?: string | null
          authorized_manual_iqama?: string | null
          authorized_manual_name?: string | null
          authorized_person_source?: string
          created_at?: string
          created_by: string
          fault_location?: string | null
          id: string
          manual_owner_name?: string | null
          normalized_plate_number: string
          notes?: string | null
          operating_card_expiry_date?: string | null
          operating_card_file_name?: string | null
          operating_card_file_path?: string | null
          operating_card_mime_type?: string | null
          operating_card_number?: string | null
          operational_status?: string
          organization_id: string
          owner_organization_id?: string | null
          owner_source: string
          plate_number: string
          suspended_at?: string | null
          suspended_by?: string | null
          technical_status?: string
          technical_status_changed_at?: string | null
          technical_status_changed_by?: string | null
          technical_status_note?: string | null
          updated_at?: string
          updated_by: string
          vehicle_category: string
          vehicle_type: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_driver_id?: string | null
          assigned_driver_manual_iqama?: string | null
          assigned_driver_manual_name?: string | null
          assigned_driver_source?: string
          authorization_expiry_date?: string | null
          authorized_driver_id?: string | null
          authorized_manual_iqama?: string | null
          authorized_manual_name?: string | null
          authorized_person_source?: string
          created_at?: string
          created_by?: string
          fault_location?: string | null
          id?: string
          manual_owner_name?: string | null
          normalized_plate_number?: string
          notes?: string | null
          operating_card_expiry_date?: string | null
          operating_card_file_name?: string | null
          operating_card_file_path?: string | null
          operating_card_mime_type?: string | null
          operating_card_number?: string | null
          operational_status?: string
          organization_id?: string
          owner_organization_id?: string | null
          owner_source?: string
          plate_number?: string
          suspended_at?: string | null
          suspended_by?: string | null
          technical_status?: string
          technical_status_changed_at?: string | null
          technical_status_changed_by?: string | null
          technical_status_note?: string | null
          updated_at?: string
          updated_by?: string
          vehicle_category?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_authorized_driver_id_fkey"
            columns: ["authorized_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_owner_organization_id_fkey"
            columns: ["owner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_technical_status_changed_by_fkey"
            columns: ["technical_status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_increase_requests: {
        Row: {
          approved_amount_sar: number | null
          created_at: string
          driver_id: string
          id: string
          organization_id: string
          reason: string
          request_date: string
          requested_amount_sar: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate_snapshot: string | null
        }
        Insert: {
          approved_amount_sar?: number | null
          created_at?: string
          driver_id: string
          id?: string
          organization_id: string
          reason: string
          request_date: string
          requested_amount_sar: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Update: {
          approved_amount_sar?: number | null
          created_at?: string
          driver_id?: string
          id?: string
          organization_id?: string
          reason?: string
          request_date?: string
          requested_amount_sar?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_increase_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_increase_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_increase_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_increase_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_transactions: {
        Row: {
          amount_sar: number
          created_at: string
          created_by: string
          driver_id: string
          driver_identifier_snapshot: string | null
          driver_name_snapshot: string
          fuel_date: string
          id: string
          note: string | null
          organization_id: string
          related_request_id: string | null
          transaction_type: string
          vehicle_id: string | null
          vehicle_plate_snapshot: string | null
        }
        Insert: {
          amount_sar: number
          created_at?: string
          created_by: string
          driver_id: string
          driver_identifier_snapshot?: string | null
          driver_name_snapshot: string
          fuel_date: string
          id?: string
          note?: string | null
          organization_id: string
          related_request_id?: string | null
          transaction_type: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Update: {
          amount_sar?: number
          created_at?: string
          created_by?: string
          driver_id?: string
          driver_identifier_snapshot?: string | null
          driver_name_snapshot?: string
          fuel_date?: string
          id?: string
          note?: string | null
          organization_id?: string
          related_request_id?: string | null
          transaction_type?: string
          vehicle_id?: string | null
          vehicle_plate_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "fuel_increase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_access: {
        Row: {
          access_level: Database["public"]["Enums"]["organization_access_level"]
          created_at: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["organization_access_level"]
          created_at?: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["organization_access_level"]
          created_at?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_user_permissions: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          organization_id: string
          permission_key: string
          updated_at: string
          updated_by: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          organization_id: string
          permission_key: string
          updated_at?: string
          updated_by: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          organization_id?: string
          permission_key?: string
          updated_at?: string
          updated_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_shift_templates: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          break_end_time: string | null
          break_start_time: string | null
          created_at: string
          created_by: string | null
          crosses_midnight: boolean
          end_time: string
          has_break: boolean
          id: string
          is_active: boolean
          name: string
          driver_note: string | null
          organization_id: string
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          end_time: string
          has_break?: boolean
          id?: string
          is_active?: boolean
          name: string
          driver_note?: string | null
          organization_id: string
          start_time: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          break_end_time?: string | null
          break_start_time?: string | null
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          end_time?: string
          has_break?: boolean
          id?: string
          is_active?: boolean
          name?: string
          driver_note?: string | null
          organization_id?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_shift_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_shift_assignments: {
        Row: {
          assignment_end_date: string | null
          assignment_start_date: string | null
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_active: boolean
          organization_id: string
          shift_template_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignment_end_date?: string | null
          assignment_start_date?: string | null
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_active?: boolean
          organization_id: string
          shift_template_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignment_end_date?: string | null
          assignment_start_date?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          shift_template_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_shift_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_shift_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_shift_assignments_shift_template_id_fkey"
            columns: ["shift_template_id"]
            isOneToOne: false
            referencedRelation: "organization_shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          full_name: string
          home_organization_id: string | null
          id: string
          job_title: string
          must_change_password: boolean
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          full_name: string
          home_organization_id?: string | null
          id: string
          job_title: string
          must_change_password?: boolean
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          home_organization_id?: string | null
          id?: string
          job_title?: string
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_organization_id_fkey"
            columns: ["home_organization_id"]
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
      add_manual_fuel_increase: {
        Args: {
          p_amount_sar: number
          p_driver_id: string
          p_fuel_date?: string
          p_note: string
        }
        Returns: Json
      }
      archive_driver_record: {
        Args: {
          p_actor_user_id: string
          p_driver_id: string
          p_organization_id: string
        }
        Returns: undefined
      }
      archive_managed_user: {
        Args: { p_actor_user_id: string; p_target_user_id: string }
        Returns: undefined
      }
      assert_driver_manager_actor: {
        Args: { p_actor_user_id: string; p_organization_id: string }
        Returns: undefined
      }
      assert_managed_user_actor: {
        Args: { p_actor_user_id: string }
        Returns: undefined
      }
      can_manage_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_view_linked_driver_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      can_view_organization: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      complete_driver_password_change: { Args: never; Returns: Json }
      create_driver_record: {
        Args: {
          p_account_number: string
          p_actor_user_id: string
          p_bank_name: string
          p_documents: Json
          p_driver_card_expiry_date: string
          p_driver_card_number: string
          p_driver_id: string
          p_driving_license_expiry_date: string
          p_driving_license_number: string
          p_full_name: string
          p_iban: string
          p_iqama_expiry_date: string
          p_iqama_number: string
          p_is_company_sponsored: boolean
          p_is_vehicle_owner: boolean
          p_keeta_driver_id: string
          p_keeta_username: string
          p_mobile_number: string
          p_nationality: string
          p_organization_id: string
          p_settlement_type: Database["public"]["Enums"]["driver_settlement_type"]
          p_vehicle_authorization_expiry_date: string
          p_vehicle_authorization_number: string
          p_vehicle_brand: string
          p_vehicle_number: string
          p_vehicle_owner_identifier: string
          p_vehicle_serial_number: string
          p_vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Returns: undefined
      }
      create_managed_user_profile: {
        Args: {
          p_actor_user_id: string
          p_additional_access?: Json
          p_full_name: string
          p_home_organization_id: string
          p_job_title: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      current_riyadh_date: { Args: never; Returns: string }
      end_driver_shift: {
        Args: {
          p_odometer_reading: number
          p_photo_captured_at: string
          p_photo_path: string
        }
        Returns: Json
      }
      fuel_daily_summary: {
        Args: {
          p_driver_id: string
          p_fuel_date: string
          p_organization_id: string
        }
        Returns: Json
      }
      get_authenticated_driver_for_request: {
        Args: never
        Returns: {
          auth_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          deleted_by_user_id: string | null
          driver_card_expiry_date: string
          driver_card_number: string
          driving_license_expiry_date: string | null
          driving_license_number: string | null
          full_name: string
          id: string
          iqama_expiry_date: string
          iqama_number: string
          is_company_sponsored: boolean
          is_vehicle_owner: boolean | null
          keeta_driver_id: string | null
          keeta_username: string
          keeta_vehicle_plate_number: string | null
          mobile_number: string
          nationality: string
          operating_card_expiry_date: string | null
          operating_card_file_path: string | null
          operating_card_number: string | null
          organization_id: string
          profile_photo_path: string | null
          settlement_type:
            | Database["public"]["Enums"]["driver_settlement_type"]
            | null
          status: Database["public"]["Enums"]["driver_status"]
          updated_at: string
          updated_by_user_id: string | null
          vehicle_authorization_expiry_date: string
          vehicle_authorization_number: string
          vehicle_brand: string | null
          vehicle_number: string
          vehicle_owner_identifier: string | null
          vehicle_serial_number: string | null
          vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        SetofOptions: {
          from: "*"
          to: "drivers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_authenticated_driver_vehicle_status: {
        Args: never
        Returns: {
          organization_id: string
          plate_number: string
          resolution_code: string
          vehicle_id: string
          vehicle_type: string
        }[]
      }
      get_driver_current_vehicle: {
        Args: { p_driver_id: string }
        Returns: {
          plate_number: string
          vehicle_id: string
        }[]
      }
      has_organization_permission: {
        Args: {
          target_organization_id: string
          target_permission_key: string
          target_user_id: string
        }
        Returns: boolean
      }
      import_driver_daily_report: {
        Args: {
          p_actor_user_id: string
          p_organization_id: string
          p_replace_existing?: boolean
          p_report_date: string
          p_rows: Json
          p_summary: Json
        }
        Returns: string
      }
      issue_driver_warning: {
        Args: {
          p_category: string
          p_description: string
          p_driver_id: string
          p_incident_at: string
          p_organization_id: string
          p_severity: string
          p_title: string
        }
        Returns: string
      }
      insert_app_notification: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_key: string
          p_message: string
          p_organization_id: string
          p_recipient_user_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      insert_driver_app_request_activity: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_driver_id: string
          p_organization_id: string
          p_request_id: string
          p_request_type: string
          p_status: string
        }
        Returns: undefined
      }
      insert_fuel_activity: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_amount_sar: number
          p_driver_id: string
          p_organization_id: string
          p_request_id: string
          p_transaction_id: string
        }
        Returns: undefined
      }
      is_system_owner: { Args: never; Returns: boolean }
      is_system_owner_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      normalize_driver_iban: { Args: { p_iban: string }; Returns: string }
      normalize_vehicle_plate_text: {
        Args: { p_plate: string }
        Returns: string
      }
      open_driver_fuel: {
        Args: {
          p_amount_sar: number
          p_driver_id: string
          p_fuel_date?: string
          p_note?: string
        }
        Returns: Json
      }
      replace_managed_user_organization_access: {
        Args: {
          p_actor_user_id: string
          p_additional_access?: Json
          p_target_user_id: string
        }
        Returns: undefined
      }
      replace_managed_user_organization_permissions: {
        Args: {
          p_access: Json
          p_actor_user_id: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      request_notification_type_label: {
        Args: { p_request_type: string }
        Returns: string
      }
      revoke_driver_warning: {
        Args: { p_revoke_reason: string; p_warning_id: string }
        Returns: undefined
      }
      resolve_driver_current_vehicle: {
        Args: { p_driver_id: string }
        Returns: {
          organization_id: string
          plate_number: string
          resolution_code: string
          vehicle_id: string
          vehicle_type: string
        }[]
      }
      review_driver_shift_odometer: {
        Args: {
          p_decision: string
          p_phase: string
          p_review_note?: string
          p_shift_id: string
        }
        Returns: {
          created_at: string
          driver_id: string
          end_ocr_confidence: number | null
          end_ocr_provider: string | null
          end_ocr_reading: string | null
          end_ocr_status: string | null
          end_odometer_reading: number | null
          end_photo_captured_at: string | null
          end_photo_path: string | null
          end_review_note: string | null
          end_review_status: string | null
          end_reviewed_at: string | null
          end_reviewed_by: string | null
          end_verified_at: string | null
          ended_at: string | null
          id: string
          organization_id: string
          start_ocr_confidence: number | null
          start_ocr_provider: string | null
          start_ocr_reading: string | null
          start_ocr_status: string | null
          start_odometer_reading: number
          start_photo_captured_at: string
          start_photo_path: string
          start_review_note: string | null
          start_review_status: string
          start_reviewed_at: string | null
          start_reviewed_by: string | null
          start_verified_at: string | null
          started_at: string
          status: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate_snapshot: string
        }
        SetofOptions: {
          from: "*"
          to: "driver_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_fuel_increase_request: {
        Args: {
          p_approved_amount_sar?: number
          p_decision: string
          p_request_id: string
          p_review_note?: string
        }
        Returns: Json
      }
      safe_access_snapshot: { Args: { p_user_id: string }; Returns: Json }
      safe_driver_snapshot: { Args: { p_driver_id: string }; Returns: Json }
      mark_driver_warning_seen: {
        Args: { p_warning_id: string }
        Returns: undefined
      }
      set_driver_status: {
        Args: {
          p_actor_user_id: string
          p_driver_id: string
          p_organization_id: string
          p_status: Database["public"]["Enums"]["driver_status"]
        }
        Returns: undefined
      }
      set_managed_user_status: {
        Args: {
          p_actor_user_id: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_target_user_id: string
        }
        Returns: undefined
      }
      start_driver_shift: {
        Args: {
          p_odometer_reading: number
          p_photo_captured_at: string
          p_photo_path: string
        }
        Returns: Json
      }
      submit_driver_fuel_increase_request: {
        Args: { p_reason: string; p_requested_amount_sar: number }
        Returns: Json
      }
      submit_driver_leave_request: {
        Args: {
          p_end_date: string
          p_leave_type: string
          p_reason: string
          p_start_date: string
          p_submission_id: string
        }
        Returns: Json
      }
      submit_driver_maintenance_request: {
        Args: {
          p_maintenance_category: string
          p_problem_description: string
          p_submission_id: string
          p_urgency: string
        }
        Returns: Json
      }
      submit_driver_meeting_request: {
        Args: {
          p_preferred_date?: string
          p_preferred_time?: string
          p_reason: string
          p_requested_manager_user_id: string
          p_submission_id: string
          p_subject: string
        }
        Returns: Json
      }
      is_meeting_manager_eligible: {
        Args: { target_organization_id: string; target_user_id: string }
        Returns: boolean
      }
      list_driver_meeting_manager_options: {
        Args: Record<PropertyKey, never>
        Returns: {
          display_name: string
          job_title: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      submit_driver_oil_change_request: {
        Args: { p_current_odometer_reading: number; p_note?: string; p_submission_id: string }
        Returns: Json
      }
      update_driver_record: {
        Args: {
          p_account_number: string
          p_actor_user_id: string
          p_bank_name: string
          p_documents?: Json
          p_driver_card_expiry_date: string
          p_driver_card_number: string
          p_driver_id: string
          p_driving_license_expiry_date: string
          p_driving_license_number: string
          p_full_name: string
          p_iban: string
          p_iqama_expiry_date: string
          p_iqama_number: string
          p_is_company_sponsored: boolean
          p_is_vehicle_owner: boolean
          p_keeta_driver_id: string
          p_keeta_username: string
          p_mobile_number: string
          p_nationality: string
          p_organization_id: string
          p_settlement_type: Database["public"]["Enums"]["driver_settlement_type"]
          p_vehicle_authorization_expiry_date: string
          p_vehicle_authorization_number: string
          p_vehicle_brand: string
          p_vehicle_number: string
          p_vehicle_owner_identifier: string
          p_vehicle_serial_number: string
          p_vehicle_type: Database["public"]["Enums"]["driver_vehicle_type"]
        }
        Returns: undefined
      }
      update_managed_user_profile: {
        Args: {
          p_actor_user_id: string
          p_email_changed?: boolean
          p_full_name: string
          p_home_organization_id: string
          p_job_title: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: undefined
      }
      validate_driver_document_item: {
        Args: { p_document: Json }
        Returns: undefined
      }
      validate_driver_odometer_photo_path: {
        Args: { p_photo_path: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      app_role: "system_owner" | "manager" | "supervisor" | "driver"
      driver_document_type: "iqama" | "driver_card" | "driving_license"
      driver_report_attendance_status: "present" | "absent"
      driver_report_eligibility_status: "eligible" | "not_eligible"
      driver_settlement_type: "tiers" | "per_order"
      driver_status: "active" | "suspended"
      driver_vehicle_type: "motorcycle" | "car"
      organization_access_level: "view" | "manage"
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
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      app_role: ["system_owner", "manager", "supervisor", "driver"],
      driver_document_type: ["iqama", "driver_card", "driving_license"],
      driver_report_attendance_status: ["present", "absent"],
      driver_report_eligibility_status: ["eligible", "not_eligible"],
      driver_settlement_type: ["tiers", "per_order"],
      driver_status: ["active", "suspended"],
      driver_vehicle_type: ["motorcycle", "car"],
      organization_access_level: ["view", "manage"],
    },
  },
} as const
