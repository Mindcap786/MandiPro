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
      stock_alerts: {
        Row: {
          alert_type: string
          commodity_id: string | null
          commodity_name: string | null
          created_at: string | null
          current_value: number | null
          id: string
          is_resolved: boolean | null
          is_seen: boolean | null
          message: string
          metadata: Json | null
          organization_id: string
          resolved_at: string | null
          seen_at: string | null
          severity: string
          threshold_value: number | null
          unit: string | null
        }
        Insert: {
          alert_type: string
          commodity_id?: string | null
          commodity_name?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          is_resolved?: boolean | null
          is_seen?: boolean | null
          message: string
          metadata?: Json | null
          organization_id: string
          resolved_at?: string | null
          seen_at?: string | null
          severity?: string
          threshold_value?: number | null
          unit?: string | null
        }
        Update: {
          alert_type?: string
          commodity_id?: string | null
          commodity_name?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          is_resolved?: boolean | null
          is_seen?: boolean | null
          message?: string
          metadata?: Json | null
          organization_id?: string
          resolved_at?: string | null
          seen_at?: string | null
          severity?: string
          threshold_value?: number | null
          unit?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_subscription_access: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      commit_mandi_session: { Args: { p_session_id: string }; Returns: Json }
      confirm_sale_transaction: {
        Args: {
          p_amount_received?: number
          p_bank_account_id?: string
          p_bank_name?: string
          p_buyer_gstin?: string
          p_buyer_id: string
          p_cgst_amount?: number
          p_cheque_date?: string
          p_cheque_no?: string
          p_cheque_status?: boolean
          p_discount_amount?: number
          p_discount_percent?: number
          p_due_date?: string
          p_gst_total?: number
          p_idempotency_key?: string
          p_igst_amount?: number
          p_is_igst?: boolean
          p_items: Json
          p_loading_charges?: number
          p_market_fee?: number
          p_misc_fee?: number
          p_nirashrit?: number
          p_organization_id: string
          p_other_expenses?: number
          p_payment_mode: string
          p_place_of_supply?: string
          p_sale_date: string
          p_sgst_amount?: number
          p_total_amount: number
          p_unloading_charges?: number
        }
        Returns: Json
      }
      create_mixed_arrival: {
        Args: { p_arrival: Json; p_created_by: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      finalize_login_bundle: { Args: { p_user_id: string }; Returns: Json }
      get_financial_summary: {
        Args: { _cache_bust?: number; p_org_id: string }
        Returns: Json
      }
      get_full_user_context: { Args: { p_user_id: string }; Returns: Json }
      get_ledger_statement: {
        Args: {
          p_contact_id: string
          p_from_date: string
          p_organization_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_next_contact_bill_no: {
        Args: { p_bill_type?: string; p_contact_id: string; p_org_id: string }
        Returns: Json
      }
      get_pnl_summary: {
        Args: {
          p_end_date?: string
          p_organization_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_subscription_status: { Args: { p_user_id: string }; Returns: Json }
      get_tenant_expiry_status: { Args: { p_org_id: string }; Returns: Json }
      post_arrival_ledger: { Args: { p_arrival_id: string }; Returns: Json }
      post_sale_ledger: { Args: { p_sale_id: string }; Returns: Json }
      settle_supplier_payment: {
        Args: {
          p_contact_id: string
          p_organization_id: string
          p_payment_amount: number
          p_payment_id?: string
        }
        Returns: Json
      }
      transition_cheque_with_ledger: {
        Args: {
          p_actor_id?: string
          p_bounce_reason?: string
          p_cheque_id: string
          p_cleared_date?: string
          p_next_status: string
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

