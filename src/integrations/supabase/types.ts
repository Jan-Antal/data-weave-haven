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
      people: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: string
        }
        Relationships: []
      }
      production_capacity: {
        Row: {
          capacity_hours: number
          company_holiday_name: string | null
          created_at: string
          holiday_name: string | null
          id: string
          is_manual_override: boolean
          updated_at: string
          week_number: number
          week_start: string
          week_year: number
          working_days: number
        }
        Insert: {
          capacity_hours?: number
          company_holiday_name?: string | null
          created_at?: string
          holiday_name?: string | null
          id?: string
          is_manual_override?: boolean
          updated_at?: string
          week_number: number
          week_start: string
          week_year: number
          working_days?: number
        }
        Update: {
          capacity_hours?: number
          company_holiday_name?: string | null
          created_at?: string
          holiday_name?: string | null
          id?: string
          is_manual_override?: boolean
          updated_at?: string
          week_number?: number
          week_start?: string
          week_year?: number
          working_days?: number
        }
        Relationships: []
      }
      production_daily_logs: {
        Row: {
          bundle_id: string
          day_index: number
          id: string
          logged_at: string | null
          logged_by: string | null
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
          percent?: number
          phase?: string | null
          week_key?: string
        }
        Relationships: []
      }
      production_inbox: {
        Row: {
          adhoc_reason: string | null
          created_at: string
          estimated_czk: number
          estimated_hours: number
          id: string
          item_code: string | null
          item_name: string
          project_id: string
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
          created_at?: string
          estimated_czk: number
          estimated_hours: number
          id?: string
          item_code?: string | null
          item_name: string
          project_id: string
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
          created_at?: string
          estimated_czk?: number
          estimated_hours?: number
          id?: string
          item_code?: string | null
          item_name?: string
          project_id?: string
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
      production_schedule: {
        Row: {
          adhoc_reason: string | null
          cancel_reason: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          expediced_at: string | null
          id: string
          inbox_item_id: string | null
          item_code: string | null
          item_name: string
          pause_expected_date: string | null
          pause_reason: string | null
          position: number
          project_id: string
          scheduled_czk: number
          scheduled_hours: number
          scheduled_week: string
          split_group_id: string | null
          split_part: number | null
          split_total: number | null
          stage_id: string | null
          status: string
        }
        Insert: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          expediced_at?: string | null
          id?: string
          inbox_item_id?: string | null
          item_code?: string | null
          item_name: string
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number
          project_id: string
          scheduled_czk: number
          scheduled_hours: number
          scheduled_week: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
        }
        Update: {
          adhoc_reason?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          expediced_at?: string | null
          id?: string
          inbox_item_id?: string | null
          item_code?: string | null
          item_name?: string
          pause_expected_date?: string | null
          pause_reason?: string | null
          position?: number
          project_id?: string
          scheduled_czk?: number
          scheduled_hours?: number
          scheduled_week?: string
          split_group_id?: string | null
          split_part?: number | null
          split_total?: number | null
          stage_id?: string | null
          status?: string
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
            foreignKeyName: "production_schedule_split_group_id_fkey"
            columns: ["split_group_id"]
            isOneToOne: false
            referencedRelation: "production_schedule"
            referencedColumns: ["id"]
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
      production_settings: {
        Row: {
          hourly_rate: number
          id: string
          monthly_capacity_hours: number
          updated_at: string
          updated_by: string | null
          weekly_capacity_hours: number
        }
        Insert: {
          hourly_rate?: number
          id?: string
          monthly_capacity_hours?: number
          updated_at?: string
          updated_by?: string | null
          weekly_capacity_hours?: number
        }
        Update: {
          hourly_rate?: number
          id?: string
          monthly_capacity_hours?: number
          updated_at?: string
          updated_by?: string | null
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
      project_stages: {
        Row: {
          architekt: string | null
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
          tpv_date: string | null
          updated_at: string
          van_date: string | null
          zamereni: string | null
        }
        Insert: {
          architekt?: string | null
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
          tpv_date?: string | null
          updated_at?: string
          van_date?: string | null
          zamereni?: string | null
        }
        Update: {
          architekt?: string | null
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
      tpv_items: {
        Row: {
          accepted_date: string | null
          cena: number | null
          created_at: string
          custom_fields: Json | null
          deleted_at: string | null
          id: string
          import_source: string | null
          imported_at: string | null
          item_name: string
          item_type: string | null
          konstrukter: string | null
          nazev_prvku: string | null
          notes: string | null
          pocet: number | null
          project_id: string
          sent_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          accepted_date?: string | null
          cena?: number | null
          created_at?: string
          custom_fields?: Json | null
          deleted_at?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          item_name: string
          item_type?: string | null
          konstrukter?: string | null
          nazev_prvku?: string | null
          notes?: string | null
          pocet?: number | null
          project_id: string
          sent_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          accepted_date?: string | null
          cena?: number | null
          created_at?: string
          custom_fields?: Json | null
          deleted_at?: string | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          item_name?: string
          item_type?: string | null
          konstrukter?: string | null
          nazev_prvku?: string | null
          notes?: string | null
          pocet?: number | null
          project_id?: string
          sent_date?: string | null
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
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_sound?: boolean
          created_at?: string
          default_person_filter?: string | null
          default_view?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_sound?: boolean
          created_at?: string
          default_person_filter?: string | null
          default_view?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_activity_logs: { Args: never; Returns: undefined }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role: "owner" | "admin" | "pm" | "konstrukter" | "viewer"
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
      app_role: ["owner", "admin", "pm", "konstrukter", "viewer"],
    },
  },
} as const
