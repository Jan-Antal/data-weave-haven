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
      project_stages: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string | null
          id: string
          notes: string | null
          project_id: string
          stage_name: string
          stage_order: number | null
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id: string
          stage_name: string
          stage_order?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          stage_name?: string
          stage_order?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
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
      projects: {
        Row: {
          architekt: string | null
          contract_link: string | null
          created_at: string
          currency: string | null
          datum_objednavky: string | null
          datum_smluvni: string | null
          datum_tpv: string | null
          deleted_at: string | null
          dm: string | null
          expedice: string | null
          fakturace: string | null
          fee_proposal_link: string | null
          hodiny_tpv: string | null
          id: string
          is_active: boolean | null
          kalkulant: string | null
          klient: string | null
          konstrukter: string | null
          link_cn: string | null
          location: string | null
          marze: string | null
          material: number | null
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
          velikost_zakazky: string | null
          vyroba: number | null
          zamereni: string | null
        }
        Insert: {
          architekt?: string | null
          contract_link?: string | null
          created_at?: string
          currency?: string | null
          datum_objednavky?: string | null
          datum_smluvni?: string | null
          datum_tpv?: string | null
          deleted_at?: string | null
          dm?: string | null
          expedice?: string | null
          fakturace?: string | null
          fee_proposal_link?: string | null
          hodiny_tpv?: string | null
          id?: string
          is_active?: boolean | null
          kalkulant?: string | null
          klient?: string | null
          konstrukter?: string | null
          link_cn?: string | null
          location?: string | null
          marze?: string | null
          material?: number | null
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
          velikost_zakazky?: string | null
          vyroba?: number | null
          zamereni?: string | null
        }
        Update: {
          architekt?: string | null
          contract_link?: string | null
          created_at?: string
          currency?: string | null
          datum_objednavky?: string | null
          datum_smluvni?: string | null
          datum_tpv?: string | null
          deleted_at?: string | null
          dm?: string | null
          expedice?: string | null
          fakturace?: string | null
          fee_proposal_link?: string | null
          hodiny_tpv?: string | null
          id?: string
          is_active?: boolean | null
          kalkulant?: string | null
          klient?: string | null
          konstrukter?: string | null
          link_cn?: string | null
          location?: string | null
          marze?: string | null
          material?: number | null
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
          velikost_zakazky?: string | null
          vyroba?: number | null
          zamereni?: string | null
        }
        Relationships: []
      }
      tpv_items: {
        Row: {
          accepted_date: string | null
          created_at: string
          deleted_at: string | null
          id: string
          item_name: string
          item_type: string | null
          konstrukter: string | null
          notes: string | null
          project_id: string
          sent_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          accepted_date?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_name: string
          item_type?: string | null
          konstrukter?: string | null
          notes?: string | null
          project_id: string
          sent_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          accepted_date?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          item_name?: string
          item_type?: string | null
          konstrukter?: string | null
          notes?: string | null
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
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      purge_soft_deleted_records: { Args: never; Returns: undefined }
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
    Enums: {},
  },
} as const
