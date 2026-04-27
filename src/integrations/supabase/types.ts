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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ami_absences: {
        Row: {
          absencia_kod: string | null
          created_at: string | null
          datum: string
          employee_id: string | null
          id: string
          mesiac: string
          period_id: string | null
          source: string | null
        }
        Insert: {
          absencia_kod?: string | null
          created_at?: string | null
          datum: string
          employee_id?: string | null
          id?: string
          mesiac: string
          period_id?: string | null
          source?: string | null
        }
        Update: {
          absencia_kod?: string | null
          created_at?: string | null
          datum?: string
          employee_id?: string | null
          id?: string
          mesiac?: string
          period_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ami_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "ami_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ami_employees: {
        Row: {
          activated_at: string | null
          aktivny: boolean | null
          created_at: string | null
          deactivated_at: string | null
          deactivated_date: string | null
          id: string
          is_kalkulant: boolean
          is_konstrukter: boolean
          is_pm: boolean
          meno: string
          pozicia: string | null
          pracovni_skupina: string | null
          stredisko: string | null
          usek: string
          usek_nazov: string | null
          uvazok_hodiny: number | null
        }
        Insert: {
          activated_at?: string | null
          aktivny?: boolean | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_date?: string | null
          id?: string
          is_kalkulant?: boolean
          is_konstrukter?: boolean
          is_pm?: boolean
          meno: string
          pozicia?: string | null
          pracovni_skupina?: string | null
          stredisko?: string | null
          usek: string
          usek_nazov?: string | null
          uvazok_hodiny?: number | null
        }
        Update: {
          activated_at?: string | null
          aktivny?: boolean | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_date?: string | null
          id?: string
          is_kalkulant?: boolean
          is_konstrukter?: boolean
          is_pm?: boolean
          meno?: string
          pozicia?: string | null
          pracovni_skupina?: string | null
          stredisko?: string | null
          usek?: string
          usek_nazov?: string | null
          uvazok_hodiny?: number | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      column_labels: {
        Row: {
          column_key: string
          created_at: string
          custom_label: string
          display_order: number | null
          id: string
          sort_order: number | null
          tab: string
          updated_at: string
          visible: boolean | null
          width: number | null
        }
        Insert: {
          column_key: string
          created_at?: string
          custom_label: string
          display_order?: number | null
          id?: string
          sort_order?: number | null
          tab: string
          updated_at?: string
          visible?: boolean | null
          width?: number | null
        }
        Update: {
          column_key?: string
          created_at?: string
          custom_label?: string
          display_order?: number | null
          id?: string
          sort_order?: number | null
          tab?: string
          updated_at?: string
          visible?: boolean | null
          width?: number | null
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          capacity_override: number
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          capacity_override?: number
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          capacity_override?: number
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_breakdown_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          doprava_pct: number
          id: string
          is_default: boolean
          material_pct: number
          montaz_pct: number
          name: string
          overhead_pct: number
          production_pct: number
          sort_order: number
          subcontractors_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          doprava_pct?: number
          id?: string
          is_default?: boolean
          material_pct?: number
          montaz_pct?: number
          name: string
          overhead_pct?: number
          production_pct?: number
          sort_order?: number
          subcontractors_pct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          doprava_pct?: number
          id?: string
          is_default?: boolean
          material_pct?: number
          montaz_pct?: number
          name?: string
          overhead_pct?: number
          production_pct?: number
          sort_order?: number
          subcontractors_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      custom_column_definitions: {
        Row: {
          column_key: string
          created_at: string
          data_type: string
          group_key: string
          id: string
          label: string
          people_role: string | null
          select_options: string[] | null
          sort_order: number | null
          table_name: string
          updated_at: string
        }
        Insert: {
          column_key: string
          created_at?: string
          data_type?: string
          group_key: string
          id?: string
          label: string
          people_role?: string | null
          select_options?: string[] | null
          sort_order?: number | null
          table_name: string
          updated_at?: string
        }
        Update: {
          column_key?: string
          created_at?: string
          data_type?: string
          group_key?: string
          id?: string
          label?: string
          people_role?: string | null
          select_options?: string[] | null
          sort_order?: number | null
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_log: {
        Row: {
          action_type: string
          created_at: string
          detail: string | null
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string
          stage_id: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          detail?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id: string
          stage_id?: string | null
          user_email?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          detail?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string
          stage_id?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          created_at: string
          eur_czk: number
          id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          eur_czk?: number
          id?: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          eur_czk?: number
          id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          user_email?: string
          user_id: string
          user_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      formula_config: {
        Row: {
          description: string | null
          expression: string
          is_default: boolean | null
          key: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          expression: string
          is_default?: boolean | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          expression?: string
          is_default?: boolean | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_initials: string | null
          actor_name: string | null
          batch_key: string | null
          body: string | null
          created_at: string | null
          id: string
          link_context: Json | null
          project_id: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_initials?: string | null
          actor_name?: string | null
          batch_key?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          link_context?: Json | null
          project_id?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_initials?: string | null
          actor_name?: string | null
          batch_key?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          link_context?: Json | null
          project_id?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      overhead_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          project_code: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          project_code: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          project_code?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          email: string | null
          employee_id: string | null
          firma: string | null
          id: string
          is_active: boolean
          is_external: boolean
          is_kalkulant: boolean | null
          is_konstrukter: boolean | null
          is_pm: boolean | null
          name: string
          phone: string | null
          role: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          firma?: string | null
          id?: string
          is_active?: boolean
          is_external?: boolean
          is_kalkulant?: boolean | null
          is_konstrukter?: boolean | null
          is_pm?: boolean | null
          name: string
          phone?: string | null
          role: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          firma?: string | null
          id?: string
          is_active?: boolean
          is_external?: boolean
          is_kalkulant?: boolean | null
          is_konstrukter?: boolean | null
          is_pm?: boolean | null
          name?: string
          phone?: string | null
          role?: string
          source?: string | null
        }
        Relationships: []
      }
      position_catalogue: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pozicia: string
          project_dropdown_role: string | null
          sort_order: number
          stredisko: string
          updated_at: string
          usek: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pozicia: string
          project_dropdown_role?: string | null
          sort_order?: number
          stredisko: string
          updated_at?: string
          usek: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pozicia?: string
          project_dropdown_role?: string | null
          sort_order?: number
          stredisko?: string
          updated_at?: string
          usek?: string
        }
        Relationships: []
      }
      production_capacity: {
        Row: {
          absence_days: number | null
          capacity_hours: number
          company_holiday_name: string | null
          created_at: string
          holiday_name: string | null
          id: string
          is_manual_override: boolean
          total_employees: number | null
          updated_at: string
          usek_breakdown: Json
          utilization_pct: number
          week_number: number
          week_start: string
          week_year: number
          working_days: number
        }
        Insert: {
          absence_days?: number | null
          capacity_hours?: number
          company_holiday_name?: string | null
          created_at?: string
          holiday_name?: string | null
          id?: string
          is_manual_override?: boolean
          total_employees?: number | null
          updated_at?: string
          usek_breakdown?: Json
          utilization_pct?: number
          week_number: number
          week_start: string
          week_year: number
          working_days?: number
        }
        Update: {
          absence_days?: number | null
          capacity_hours?: number
          company_holiday_name?: string | null
          created_at?: string
          holiday_name?: string | null
          id?: string
          is_manual_override?: boolean
          total_employees?: number | null
          updated_at?: string
          usek_breakdown?: Json
          utilization_pct?: number
          week_number?: number
          week_start?: string
          week_year?: number
          working_days?: number
        }
        Relationships: []
      }
      production_capacity_employees: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_included: boolean
          updated_at: string
          week_number: number
          week_year: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_included?: boolean
          updated_at?: string
          week_number: number
          week_year: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_included?: boolean
          updated_at?: string
          week_number?: number
          week_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_capacity_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "ami_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      production_daily_logs: {
        Row: {
          bundle_id: string
          day_index: number
          id: string
          logged_at: string | null
          logged_by: string | null
          note_text: string | null
          percent: number
          phase: string | null
          week_key: string
        }
        Insert: {
          bundle_id: string
          day_index: number
          id?: string
          logged_at?: string | null
          logged_by?: string | null
          note_text?: string | null
          percent?: number
          phase?: string | null
          week_key: string
        }
        Update: {
          bundle_id?: string
          day_index?: number
          id?: string
          logged_at?: string | null
          logged_by?: string | null
          note_text?: string | null
          percent?: number
          phase?: string | null
          week_key?: string
        }
        Relationships: []
      }
      production_expedice: {
        Row: {
          created_at: string | null
          expediced_at: string | null
          id: string
          is_midflight: boolean | null
          item_code: string | null
          item_name: string
          manufactured_at: string
          project_id: string
          source_schedule_id: string | null
          stage_id: string | null
        }
        Insert: {
          created_at?: string | null
          expediced_at?: string | null
          id?: string
          is_midflight?: boolean | null
          item_code?: string | null
          item_name: string
          manufactured_at: string
          project_id: string
          source_schedule_id?: string | null
          stage_id?: string | null
        }
        Update: {
          created_at?: string | null
          expediced_at?: string | null
          id?: string
          is_midflight?: boolean | null
          item_code?: string | null
          item_name?: string
          manufactured_at?: string
          project_id?: string
          source_schedule_id?: string | null
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_expedice_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "production_expedice_source_schedule_id_fkey"
            columns: ["source_schedule_id"]
            isOneToOne: false
            referencedRelation: "production_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_expedice_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      production_hours_log: {
        Row: {
          ami_project_id: string
          cinnost_kod: string | null
          cinnost_nazov: string | null
          created_at: string | null
          datum_sync: string
          hodiny: number
          id: string
          source: string | null
          zamestnanec: string
        }
        Insert: {
          ami_project_id: string
          cinnost_kod?: string | null
          cinnost_nazov?: string | null
          created_at?: string | null
          datum_sync: string
          hodiny: number
          id?: string
          source?: string | null
          zamestnanec: string
        }
        Update: {
          ami_project_id?: string
          cinnost_kod?: string | null
          cinnost_nazov?: string | null
          created_at?: string | null
          datum_sync?: string
          hodiny?: number
          id?: string
          source?: string | null
          zamestnanec?: string
        }
        Relationships: []
      }
      production_inbox: {
        Row: {
          adhoc_reason: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          estimated_czk: number
          estimated_hours: number
          id: string
          item_code: string | null
          item_name: string
          project_id: string
          returned_at: string | null
          returned_by: string | null
          sent_at: string
          sent_by: string
          split_group_id: string | null
          split_part: number | null
          split_total: number | null
          stage_id: string | null
          status: string
        }
        Insert: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          estimated_czk: number
          estimated_hours: number
          id?: string
          item_code?: string | null
          item_name: string
          project_id: string
          returned_at?: string | null
          returned_by?: string | null
          sent_at?: string
          sent_by: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
        }
        Update: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          estimated_czk?: number
          estimated_hours?: number
          id?: string
          item_code?: string | null
          item_name?: string
          project_id?: string
          returned_at?: string | null
          returned_by?: string | null
          sent_at?: string
          sent_by?: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_inbox_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "production_inbox_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      production_quality_checks: {
        Row: {
          checked_at: string
          checked_by: string
          id: string
          item_id: string
          project_id: string
        }
        Insert: {
          checked_at?: string
          checked_by: string
          id?: string
          item_id: string
          project_id: string
        }
        Update: {
          checked_at?: string
          checked_by?: string
          id?: string
          item_id?: string
          project_id?: string
        }
        Relationships: []
      }
      production_quality_defects: {
        Row: {
          assigned_to: string | null
          defect_type: string
          description: string
          id: string
          item_code: string | null
          item_id: string
          photo_url: string | null
          project_id: string
          reported_at: string
          reported_by: string
          resolution_type: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          assigned_to?: string | null
          defect_type: string
          description: string
          id?: string
          item_code?: string | null
          item_id: string
          photo_url?: string | null
          project_id: string
          reported_at?: string
          reported_by: string
          resolution_type?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          assigned_to?: string | null
          defect_type?: string
          description?: string
          id?: string
          item_code?: string | null
          item_id?: string
          photo_url?: string | null
          project_id?: string
          reported_at?: string
          reported_by?: string
          resolution_type?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: []
      }
      production_schedule: {
        Row: {
          adhoc_reason: string | null
          bundle_label: string | null
          bundle_type: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          expediced_at: string | null
          id: string
          inbox_item_id: string | null
          is_blocker: boolean
          is_historical: boolean | null
          is_midflight: boolean | null
          item_code: string | null
          item_name: string
          pause_expected_date: string | null
          pause_reason: string | null
          position: number
          project_id: string
          returned_at: string | null
          returned_by: string | null
          scheduled_czk: number
          scheduled_hours: number
          scheduled_week: string
          split_group_id: string | null
          split_part: number | null
          split_total: number | null
          stage_id: string | null
          status: string
          tpv_expected_date: string | null
        }
        Insert: {
          adhoc_reason?: string | null
          bundle_label?: string | null
          bundle_type?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          expediced_at?: string | null
          id?: string
          inbox_item_id?: string | null
          is_blocker?: boolean
          is_historical?: boolean | null
          is_midflight?: boolean | null
          item_code?: string | null
          item_name: string
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number
          project_id: string
          returned_at?: string | null
          returned_by?: string | null
          scheduled_czk: number
          scheduled_hours: number
          scheduled_week: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
          tpv_expected_date?: string | null
        }
        Update: {
          adhoc_reason?: string | null
          bundle_label?: string | null
          bundle_type?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          expediced_at?: string | null
          id?: string
          inbox_item_id?: string | null
          is_blocker?: boolean
          is_historical?: boolean | null
          is_midflight?: boolean | null
          item_code?: string | null
          item_name?: string
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number
          project_id?: string
          returned_at?: string | null
          returned_by?: string | null
          scheduled_czk?: number
          scheduled_hours?: number
          scheduled_week?: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
          tpv_expected_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_inbox_item_id_fkey"
            columns: ["inbox_item_id"]
            isOneToOne: false
            referencedRelation: "production_inbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "production_schedule_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      production_schedule_backup_20250420: {
        Row: {
          adhoc_reason: string | null
          cancel_reason: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          expediced_at: string | null
          id: string | null
          inbox_item_id: string | null
          is_blocker: boolean | null
          is_historical: boolean | null
          is_midflight: boolean | null
          item_code: string | null
          item_name: string | null
          pause_expected_date: string | null
          pause_reason: string | null
          position: number | null
          project_id: string | null
          scheduled_czk: number | null
          scheduled_hours: number | null
          scheduled_week: string | null
          split_group_id: string | null
          split_part: number | null
          split_total: number | null
          stage_id: string | null
          status: string | null
          tpv_expected_date: string | null
        }
        Insert: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expediced_at?: string | null
          id?: string | null
          inbox_item_id?: string | null
          is_blocker?: boolean | null
          is_historical?: boolean | null
          is_midflight?: boolean | null
          item_code?: string | null
          item_name?: string | null
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number | null
          project_id?: string | null
          scheduled_czk?: number | null
          scheduled_hours?: number | null
          scheduled_week?: string | null
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string | null
          tpv_expected_date?: string | null
        }
        Update: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expediced_at?: string | null
          id?: string | null
          inbox_item_id?: string | null
          is_blocker?: boolean | null
          is_historical?: boolean | null
          is_midflight?: boolean | null
          item_code?: string | null
          item_name?: string | null
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number | null
          project_id?: string | null
          scheduled_czk?: number | null
          scheduled_hours?: number | null
          scheduled_week?: string | null
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string | null
          tpv_expected_date?: string | null
        }
        Relationships: []
      }
      production_settings: {
        Row: {
          default_margin_pct: number
          hourly_rate: number
          id: string
          monthly_capacity_hours: number
          updated_at: string
          updated_by: string | null
          utilization_pct: number
          weekly_capacity_hours: number
        }
        Insert: {
          default_margin_pct?: number
          hourly_rate?: number
          id?: string
          monthly_capacity_hours?: number
          updated_at?: string
          updated_by?: string | null
          utilization_pct?: number
          weekly_capacity_hours?: number
        }
        Update: {
          default_margin_pct?: number
          hourly_rate?: number
          id?: string
          monthly_capacity_hours?: number
          updated_at?: string
          updated_by?: string | null
          utilization_pct?: number
          weekly_capacity_hours?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          password_set: boolean
          person_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          password_set?: boolean
          person_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          password_set?: boolean
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      project_plan_hours: {
        Row: {
          created_at: string | null
          eur_rate_used: number | null
          force_project_price: boolean
          hodiny_plan: number
          id: string
          marze_used: number | null
          prodpct_used: number | null
          project_hours: number
          project_id: string
          recalculated_at: string | null
          source: string
          tpv_hours: number
          warning_low_tpv: boolean
        }
        Insert: {
          created_at?: string | null
          eur_rate_used?: number | null
          force_project_price?: boolean
          hodiny_plan?: number
          id?: string
          marze_used?: number | null
          prodpct_used?: number | null
          project_hours?: number
          project_id: string
          recalculated_at?: string | null
          source?: string
          tpv_hours?: number
          warning_low_tpv?: boolean
        }
        Update: {
          created_at?: string | null
          eur_rate_used?: number | null
          force_project_price?: boolean
          hodiny_plan?: number
          id?: string
          marze_used?: number | null
          prodpct_used?: number | null
          project_hours?: number
          project_id?: string
          recalculated_at?: string | null
          source?: string
          tpv_hours?: number
          warning_low_tpv?: boolean
        }
        Relationships: []
      }
      project_stages: {
        Row: {
          architekt: string | null
          cost_doprava_pct: number | null
          cost_is_custom: boolean | null
          cost_material_pct: number | null
          cost_montaz_pct: number | null
          cost_overhead_pct: number | null
          cost_preset_id: string | null
          cost_production_pct: number | null
          cost_subcontractors_pct: number | null
          created_at: string
          currency: string | null
          datum_smluvni: string | null
          deleted_at: string | null
          display_name: string | null
          end_date: string | null
          expedice: string | null
          hodiny_tpv: string | null
          id: string
          kalkulant: string | null
          konstrukter: string | null
          manually_edited_fields: Json
          marze: string | null
          montaz: string | null
          narocnost: string | null
          notes: string | null
          percent_tpv: number | null
          pm: string | null
          pm_poznamka: string | null
          predani: string | null
          prodejni_cena: number | null
          project_id: string
          risk: string | null
          stage_name: string
          stage_order: number | null
          start_date: string | null
          status: string | null
          status_vyroba: string | null
          tpv_date: string | null
          updated_at: string
          van_date: string | null
          zamereni: string | null
        }
        Insert: {
          architekt?: string | null
          cost_doprava_pct?: number | null
          cost_is_custom?: boolean | null
          cost_material_pct?: number | null
          cost_montaz_pct?: number | null
          cost_overhead_pct?: number | null
          cost_preset_id?: string | null
          cost_production_pct?: number | null
          cost_subcontractors_pct?: number | null
          created_at?: string
          currency?: string | null
          datum_smluvni?: string | null
          deleted_at?: string | null
          display_name?: string | null
          end_date?: string | null
          expedice?: string | null
          hodiny_tpv?: string | null
          id?: string
          kalkulant?: string | null
          konstrukter?: string | null
          manually_edited_fields?: Json
          marze?: string | null
          montaz?: string | null
          narocnost?: string | null
          notes?: string | null
          percent_tpv?: number | null
          pm?: string | null
          pm_poznamka?: string | null
          predani?: string | null
          prodejni_cena?: number | null
          project_id: string
          risk?: string | null
          stage_name: string
          stage_order?: number | null
          start_date?: string | null
          status?: string | null
          status_vyroba?: string | null
          tpv_date?: string | null
          updated_at?: string
          van_date?: string | null
          zamereni?: string | null
        }
        Update: {
          architekt?: string | null
          cost_doprava_pct?: number | null
          cost_is_custom?: boolean | null
          cost_material_pct?: number | null
          cost_montaz_pct?: number | null
          cost_overhead_pct?: number | null
          cost_preset_id?: string | null
          cost_production_pct?: number | null
          cost_subcontractors_pct?: number | null
          created_at?: string
          currency?: string | null
          datum_smluvni?: string | null
          deleted_at?: string | null
          display_name?: string | null
          end_date?: string | null
          expedice?: string | null
          hodiny_tpv?: string | null
          id?: string
          kalkulant?: string | null
          konstrukter?: string | null
          manually_edited_fields?: Json
          marze?: string | null
          montaz?: string | null
          narocnost?: string | null
          notes?: string | null
          percent_tpv?: number | null
          pm?: string | null
          pm_poznamka?: string | null
          predani?: string | null
          prodejni_cena?: number | null
          project_id?: string
          risk?: string | null
          stage_name?: string
          stage_order?: number | null
          start_date?: string | null
          status?: string | null
          status_vyroba?: string | null
          tpv_date?: string | null
          updated_at?: string
          van_date?: string | null
          zamereni?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_status_options: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          architekt: string | null
          contact_email: string | null
          contact_person: string | null
          contact_tel: string | null
          contract_link: string | null
          cost_doprava_pct: number | null
          cost_is_custom: boolean | null
          cost_material_pct: number | null
          cost_montaz_pct: number | null
          cost_overhead_pct: number | null
          cost_preset_id: string | null
          cost_production_pct: number | null
          cost_subcontractors_pct: number | null
          created_at: string
          currency: string | null
          custom_fields: Json | null
          datum_objednavky: string | null
          datum_smluvni: string | null
          datum_tpv: string | null
          deleted_at: string | null
          dm: string | null
          document_count: number | null
          expedice: string | null
          fakturace: string | null
          fee_proposal_link: string | null
          hodiny_tpv: string | null
          id: string
          is_active: boolean | null
          is_test: boolean
          kalkulant: string | null
          klient: string | null
          konstrukter: string | null
          location: string | null
          marze: string | null
          material: number | null
          montaz: string | null
          narocnost: string | null
          percent_tpv: number | null
          plan_use_project_price: boolean | null
          pm: string | null
          pm_poznamka: string | null
          predani: string | null
          prodejni_cena: number | null
          project_id: string
          project_name: string
          risk: string | null
          smluvni: string | null
          status: string | null
          subdodavky: number | null
          tpv_cost: number | null
          tpv_date: string | null
          tpv_poznamka: string | null
          tpv_risk: string | null
          updated_at: string
          van_date: string | null
          velikost_zakazky: string | null
          vyroba: number | null
          zamereni: string | null
        }
        Insert: {
          architekt?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_tel?: string | null
          contract_link?: string | null
          cost_doprava_pct?: number | null
          cost_is_custom?: boolean | null
          cost_material_pct?: number | null
          cost_montaz_pct?: number | null
          cost_overhead_pct?: number | null
          cost_preset_id?: string | null
          cost_production_pct?: number | null
          cost_subcontractors_pct?: number | null
          created_at?: string
          currency?: string | null
          custom_fields?: Json | null
          datum_objednavky?: string | null
          datum_smluvni?: string | null
          datum_tpv?: string | null
          deleted_at?: string | null
          dm?: string | null
          document_count?: number | null
          expedice?: string | null
          fakturace?: string | null
          fee_proposal_link?: string | null
          hodiny_tpv?: string | null
          id?: string
          is_active?: boolean | null
          is_test?: boolean
          kalkulant?: string | null
          klient?: string | null
          konstrukter?: string | null
          location?: string | null
          marze?: string | null
          material?: number | null
          montaz?: string | null
          narocnost?: string | null
          percent_tpv?: number | null
          plan_use_project_price?: boolean | null
          pm?: string | null
          pm_poznamka?: string | null
          predani?: string | null
          prodejni_cena?: number | null
          project_id: string
          project_name: string
          risk?: string | null
          smluvni?: string | null
          status?: string | null
          subdodavky?: number | null
          tpv_cost?: number | null
          tpv_date?: string | null
          tpv_poznamka?: string | null
          tpv_risk?: string | null
          updated_at?: string
          van_date?: string | null
          velikost_zakazky?: string | null
          vyroba?: number | null
          zamereni?: string | null
        }
        Update: {
          architekt?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_tel?: string | null
          contract_link?: string | null
          cost_doprava_pct?: number | null
          cost_is_custom?: boolean | null
          cost_material_pct?: number | null
          cost_montaz_pct?: number | null
          cost_overhead_pct?: number | null
          cost_preset_id?: string | null
          cost_production_pct?: number | null
          cost_subcontractors_pct?: number | null
          created_at?: string
          currency?: string | null
          custom_fields?: Json | null
          datum_objednavky?: string | null
          datum_smluvni?: string | null
          datum_tpv?: string | null
          deleted_at?: string | null
          dm?: string | null
          document_count?: number | null
          expedice?: string | null
          fakturace?: string | null
          fee_proposal_link?: string | null
          hodiny_tpv?: string | null
          id?: string
          is_active?: boolean | null
          is_test?: boolean
          kalkulant?: string | null
          klient?: string | null
          konstrukter?: string | null
          location?: string | null
          marze?: string | null
          material?: number | null
          montaz?: string | null
          narocnost?: string | null
          percent_tpv?: number | null
          plan_use_project_price?: boolean | null
          pm?: string | null
          pm_poznamka?: string | null
          predani?: string | null
          prodejni_cena?: number | null
          project_id?: string
          project_name?: string
          risk?: string | null
          smluvni?: string | null
          status?: string | null
          subdodavky?: number | null
          tpv_cost?: number | null
          tpv_date?: string | null
          tpv_poznamka?: string | null
          tpv_risk?: string | null
          updated_at?: string
          van_date?: string | null
          velikost_zakazky?: string | null
          vyroba?: number | null
          zamereni?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_cost_preset_id_fkey"
            columns: ["cost_preset_id"]
            isOneToOne: false
            referencedRelation: "cost_breakdown_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      rls_policy_backups: {
        Row: {
          backed_up_at: string | null
          backup_label: string
          cmd: string | null
          id: string
          permissive: string | null
          policyname: string | null
          qual: string | null
          roles: string[] | null
          schemaname: string | null
          tablename: string | null
          with_check: string | null
        }
        Insert: {
          backed_up_at?: string | null
          backup_label: string
          cmd?: string | null
          id?: string
          permissive?: string | null
          policyname?: string | null
          qual?: string | null
          roles?: string[] | null
          schemaname?: string | null
          tablename?: string | null
          with_check?: string | null
        }
        Update: {
          backed_up_at?: string | null
          backup_label?: string
          cmd?: string | null
          id?: string
          permissive?: string | null
          policyname?: string | null
          qual?: string | null
          roles?: string[] | null
          schemaname?: string | null
          tablename?: string | null
          with_check?: string | null
        }
        Relationships: []
      }
      role_permission_defaults: {
        Row: {
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sharepoint_document_cache: {
        Row: {
          category_counts: Json
          file_list: Json
          project_id: string
          total_count: number
          updated_at: string
        }
        Insert: {
          category_counts?: Json
          file_list?: Json
          project_id: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          category_counts?: Json
          file_list?: Json
          project_id?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      tpv_hours_allocation: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          hodiny_navrh: number | null
          id: string
          notes: string | null
          project_id: string
          return_reason: string | null
          stav: string
          submitted_at: string | null
          submitted_by: string | null
          tpv_item_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hodiny_navrh?: number | null
          id?: string
          notes?: string | null
          project_id: string
          return_reason?: string | null
          stav?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tpv_item_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hodiny_navrh?: number | null
          id?: string
          notes?: string | null
          project_id?: string
          return_reason?: string | null
          stav?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tpv_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_hours_allocation_tpv_item_id_fkey"
            columns: ["tpv_item_id"]
            isOneToOne: true
            referencedRelation: "tpv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_inbox_task: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          project_id: string | null
          status: string
          title: string
          tpv_item_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          tpv_item_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          tpv_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_inbox_task_tpv_item_id_fkey"
            columns: ["tpv_item_id"]
            isOneToOne: false
            referencedRelation: "tpv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_items: {
        Row: {
          accepted_date: string | null
          cena: number | null
          created_at: string
          custom_fields: Json | null
          deleted_at: string | null
          hodiny_plan: number | null
          hodiny_source: string | null
          id: string
          import_source: string | null
          imported_at: string | null
          item_code: string
          konstrukter: string | null
          nazev: string | null
          notes: string | null
          pocet: number | null
          popis: string | null
          project_id: string
          sent_date: string | null
          stage_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          accepted_date?: string | null
          cena?: number | null
          created_at?: string
          custom_fields?: Json | null
          deleted_at?: string | null
          hodiny_plan?: number | null
          hodiny_source?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          item_code: string
          konstrukter?: string | null
          nazev?: string | null
          notes?: string | null
          pocet?: number | null
          popis?: string | null
          project_id: string
          sent_date?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          accepted_date?: string | null
          cena?: number | null
          created_at?: string
          custom_fields?: Json | null
          deleted_at?: string | null
          hodiny_plan?: number | null
          hodiny_source?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          item_code?: string
          konstrukter?: string | null
          nazev?: string | null
          notes?: string | null
          pocet?: number | null
          popis?: string | null
          project_id?: string
          sent_date?: string | null
          stage_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      tpv_material: {
        Row: {
          created_at: string
          dodane_dat: string | null
          dodavatel: string | null
          id: string
          jednotka: string | null
          mnozstvo: number | null
          nazov: string
          objednane_dat: string | null
          poznamka: string | null
          project_id: string
          stav: string
          tpv_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dodane_dat?: string | null
          dodavatel?: string | null
          id?: string
          jednotka?: string | null
          mnozstvo?: number | null
          nazov: string
          objednane_dat?: string | null
          poznamka?: string | null
          project_id: string
          stav?: string
          tpv_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dodane_dat?: string | null
          dodavatel?: string | null
          id?: string
          jednotka?: string | null
          mnozstvo?: number | null
          nazov?: string
          objednane_dat?: string | null
          poznamka?: string | null
          project_id?: string
          stav?: string
          tpv_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_material_tpv_item_id_fkey"
            columns: ["tpv_item_id"]
            isOneToOne: false
            referencedRelation: "tpv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_preparation: {
        Row: {
          created_at: string
          doc_ok: boolean
          hodiny_manual: number | null
          hodiny_schvalene: boolean
          id: string
          notes: string | null
          project_id: string
          readiness_status: string
          tpv_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_ok?: boolean
          hodiny_manual?: number | null
          hodiny_schvalene?: boolean
          id?: string
          notes?: string | null
          project_id: string
          readiness_status?: string
          tpv_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_ok?: boolean
          hodiny_manual?: number | null
          hodiny_schvalene?: boolean
          id?: string
          notes?: string | null
          project_id?: string
          readiness_status?: string
          tpv_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_preparation_tpv_item_id_fkey"
            columns: ["tpv_item_id"]
            isOneToOne: true
            referencedRelation: "tpv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_project_preparation: {
        Row: {
          calc_status: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          readiness_overall: number | null
          target_release_date: string | null
          updated_at: string
        }
        Insert: {
          calc_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          readiness_overall?: number | null
          target_release_date?: string | null
          updated_at?: string
        }
        Update: {
          calc_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          readiness_overall?: number | null
          target_release_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tpv_status_options: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      tpv_subcontract: {
        Row: {
          cena_finalna: number | null
          cena_predpokladana: number | null
          created_at: string
          dodane_dat: string | null
          dodavatel_id: string | null
          id: string
          jednotka: string | null
          mena: string
          mnozstvo: number | null
          nazov: string
          objednane_dat: string | null
          popis: string | null
          poznamka: string | null
          project_id: string
          stav: string
          tpv_item_id: string | null
          updated_at: string
        }
        Insert: {
          cena_finalna?: number | null
          cena_predpokladana?: number | null
          created_at?: string
          dodane_dat?: string | null
          dodavatel_id?: string | null
          id?: string
          jednotka?: string | null
          mena?: string
          mnozstvo?: number | null
          nazov: string
          objednane_dat?: string | null
          popis?: string | null
          poznamka?: string | null
          project_id: string
          stav?: string
          tpv_item_id?: string | null
          updated_at?: string
        }
        Update: {
          cena_finalna?: number | null
          cena_predpokladana?: number | null
          created_at?: string
          dodane_dat?: string | null
          dodavatel_id?: string | null
          id?: string
          jednotka?: string | null
          mena?: string
          mnozstvo?: number | null
          nazov?: string
          objednane_dat?: string | null
          popis?: string | null
          poznamka?: string | null
          project_id?: string
          stav?: string
          tpv_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_subcontract_dodavatel_id_fkey"
            columns: ["dodavatel_id"]
            isOneToOne: false
            referencedRelation: "tpv_supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpv_subcontract_tpv_item_id_fkey"
            columns: ["tpv_item_id"]
            isOneToOne: false
            referencedRelation: "tpv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_subcontract_request: {
        Row: {
          cena_nabidka: number | null
          created_at: string
          id: string
          mena: string | null
          poznamka: string | null
          responded_at: string | null
          sent_at: string | null
          stav: string
          subcontract_id: string
          supplier_id: string
          termin_dodani: string | null
          updated_at: string
        }
        Insert: {
          cena_nabidka?: number | null
          created_at?: string
          id?: string
          mena?: string | null
          poznamka?: string | null
          responded_at?: string | null
          sent_at?: string | null
          stav?: string
          subcontract_id: string
          supplier_id: string
          termin_dodani?: string | null
          updated_at?: string
        }
        Update: {
          cena_nabidka?: number | null
          created_at?: string
          id?: string
          mena?: string | null
          poznamka?: string | null
          responded_at?: string | null
          sent_at?: string | null
          stav?: string
          subcontract_id?: string
          supplier_id?: string
          termin_dodani?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_subcontract_request_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "tpv_subcontract"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpv_subcontract_request_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tpv_supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      tpv_supplier: {
        Row: {
          adresa: string | null
          created_at: string
          dic: string | null
          ico: string | null
          id: string
          is_active: boolean
          kategorie: string[] | null
          kontakt_email: string | null
          kontakt_meno: string | null
          kontakt_pozice: string | null
          kontakt_telefon: string | null
          nazov: string
          notes: string | null
          rating: number | null
          updated_at: string
          web: string | null
        }
        Insert: {
          adresa?: string | null
          created_at?: string
          dic?: string | null
          ico?: string | null
          id?: string
          is_active?: boolean
          kategorie?: string[] | null
          kontakt_email?: string | null
          kontakt_meno?: string | null
          kontakt_pozice?: string | null
          kontakt_telefon?: string | null
          nazov: string
          notes?: string | null
          rating?: number | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          adresa?: string | null
          created_at?: string
          dic?: string | null
          ico?: string | null
          id?: string
          is_active?: boolean
          kategorie?: string[] | null
          kontakt_email?: string | null
          kontakt_meno?: string | null
          kontakt_pozice?: string | null
          kontakt_telefon?: string | null
          nazov?: string
          notes?: string | null
          rating?: number | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      tpv_supplier_task: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          project_id: string | null
          status: string
          subcontract_id: string | null
          supplier_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          status?: string
          subcontract_id?: string | null
          supplier_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string | null
          status?: string
          subcontract_id?: string | null
          supplier_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpv_supplier_task_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "tpv_subcontract"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpv_supplier_task_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tpv_supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      undo_sessions: {
        Row: {
          action_type: string
          created_at: string | null
          description: string
          expires_at: string
          group_id: string | null
          id: string
          page: string
          redo_payload: Json
          undo_payload: Json
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description: string
          expires_at: string
          group_id?: string | null
          id?: string
          page: string
          redo_payload: Json
          undo_payload: Json
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string
          expires_at?: string
          group_id?: string | null
          id?: string
          page?: string
          redo_payload?: Json
          undo_payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achieved_at: string
          achievement_key: string
          id: string
          user_id: string
        }
        Insert: {
          achieved_at?: string
          achievement_key: string
          id?: string
          user_id: string
        }
        Update: {
          achieved_at?: string
          achievement_key?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          achievement_sound: boolean
          created_at: string
          default_person_filter: string | null
          default_view: string
          id: string
          notification_prefs: Json | null
          production_inbox_seen_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_sound?: boolean
          created_at?: string
          default_person_filter?: string | null
          default_view?: string
          id?: string
          notification_prefs?: Json | null
          production_inbox_seen_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_sound?: boolean
          created_at?: string
          default_person_filter?: string | null
          default_view?: string
          id?: string
          notification_prefs?: Json | null
          production_inbox_seen_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          permissions: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          permissions?: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          permissions?: Json | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          last_activity: string | null
          session_end: string | null
          session_start: string | null
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          id?: string
          last_activity?: string | null
          session_end?: string | null
          session_start?: string | null
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          id?: string
          last_activity?: string | null
          session_end?: string | null
          session_start?: string | null
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_test_production_data: { Args: never; Returns: Json }
      cleanup_old_activity_logs: { Args: never; Returns: undefined }
      cleanup_undo_sessions: { Args: never; Returns: undefined }
      get_daily_report: {
        Args: { report_date: string }
        Returns: {
          bundle_display_label: string
          bundle_id: string
          bundle_label: string
          bundle_split_part: string
          is_on_track: boolean
          log_day_date: string
          logged_at: string
          note_text: string
          percent: number
          phase: string
          project_id: string
          project_name: string
          row_kind: string
          scheduled_hours: number
          scheduled_week: string
          stage_id: string
          total_plan_hours: number
          weekly_goal_pct: number
        }[]
      }
      get_hours_by_project: {
        Args: never
        Returns: {
          ami_project_id: string
          max_datum: string
          min_datum: string
          total_hodiny: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _flag: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_test_project: { Args: { _project_id: string }; Returns: boolean }
      is_test_user: { Args: never; Returns: boolean }
      mark_password_set: { Args: never; Returns: boolean }
      purge_soft_deleted_records: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "pm"
        | "konstrukter"
        | "viewer"
        | "tester"
        | "vyroba"
        | "vedouci_pm"
        | "vedouci_konstrukter"
        | "vedouci_vyroby"
        | "mistr"
        | "quality"
        | "kalkulant"
        | "nakupci"
        | "finance"
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
      app_role: [
        "owner",
        "admin",
        "pm",
        "konstrukter",
        "viewer",
        "tester",
        "vyroba",
        "vedouci_pm",
        "vedouci_konstrukter",
        "vedouci_vyroby",
        "mistr",
        "quality",
        "kalkulant",
        "nakupci",
        "finance",
      ],
    },
  },
} as const
