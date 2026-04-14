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
  core: {
    Tables: {
      accounts: {
        Row: {
          account_name_te: string | null
          account_sub_type: string | null
          code: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          is_system_account: boolean | null
          name: string
          opening_balance: number | null
          organization_id: string
          type: string
        }
        Insert: {
          account_name_te?: string | null
          account_sub_type?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          is_system_account?: boolean | null
          name: string
          opening_balance?: number | null
          organization_id: string
          type: string
        }
        Update: {
          account_name_te?: string | null
          account_sub_type?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          is_system_account?: boolean | null
          name?: string
          opening_balance?: number | null
          organization_id?: string
          type?: string
        }
        Relationships: []
      }
      ledger: {
        Row: {
          account_id: string | null
          account_name: string | null
          contact_id: string | null
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          id: string
          organization_id: string
          reference_id: string | null
          reference_no: string | null
          transaction_type: string | null
          voucher_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          contact_id?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_date?: string | null
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_no?: string | null
          transaction_type?: string | null
          voucher_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          contact_id?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_date?: string | null
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_no?: string | null
          transaction_type?: string | null
          voucher_id?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          tenant_type: string
          subscription_tier: string | null
          is_active: boolean | null
          gst_number: string | null
          address_line1: string | null
          address_line2: string | null
          period_lock_enabled: boolean | null
          period_locked_until: string | null
          financial_year_start: string | null
          lock_date: string | null
          market_fee_percent: number | null
          nirashrit_percent: number | null
          misc_fee_percent: number | null
          settings: Json | null
          max_web_users: number | null
          max_mobile_users: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          tenant_type: string
          subscription_tier?: string | null
          is_active?: boolean | null
          gst_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          period_lock_enabled?: boolean | null
          period_locked_until?: string | null
          financial_year_start?: string | null
          lock_date?: string | null
          market_fee_percent?: number | null
          nirashrit_percent?: number | null
          misc_fee_percent?: number | null
          settings?: Json | null
          max_web_users?: number | null
          max_mobile_users?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          tenant_type?: string
          subscription_tier?: string | null
          is_active?: boolean | null
          gst_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          period_lock_enabled?: boolean | null
          period_locked_until?: string | null
          financial_year_start?: string | null
          lock_date?: string | null
          market_fee_percent?: number | null
          nirashrit_percent?: number | null
          misc_fee_percent?: number | null
          settings?: Json | null
          max_web_users?: number | null
          max_mobile_users?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          full_name: string | null
          id: string
          organization_id: string | null
          role: string | null
          email: string | null
          is_active: boolean | null
          business_domain: string | null
        }
        Insert: {
          full_name?: string | null
          id: string
          organization_id?: string | null
          role?: string | null
          email?: string | null
          is_active?: boolean | null
          business_domain?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string
          organization_id?: string | null
          role?: string | null
          email?: string | null
          is_active?: boolean | null
          business_domain?: string | null
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
      vouchers: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          date: string
          discount_amount: number | null
          id: string
          invoice_id: string | null
          is_locked: boolean | null
          narration: string | null
          organization_id: string
          type: string
          voucher_no: number
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          is_locked?: boolean | null
          narration?: string | null
          organization_id: string
          type: string
          voucher_no?: number
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          is_locked?: boolean | null
          narration?: string | null
          organization_id?: string
          type?: string
          voucher_no?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  mandi: {
    Tables: {
      arrivals: {
        Row: {
          arrival_date: string
          arrival_type: string | null
          bill_no: number
          created_at: string | null
          driver_mobile: string | null
          driver_name: string | null
          guarantor: string | null
          hamali_expenses: number | null
          hire_charges: number | null
          id: string
          loaders_count: number | null
          organization_id: string | null
          other_expenses: number | null
          party_id: string | null
          reference_no: string | null
          status: string | null
          storage_location: string | null
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Insert: {
          arrival_date: string
          arrival_type?: string | null
          bill_no?: number
          created_at?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          guarantor?: string | null
          hamali_expenses?: number | null
          hire_charges?: number | null
          id?: string
          loaders_count?: number | null
          organization_id?: string | null
          other_expenses?: number | null
          party_id?: string | null
          reference_no?: string | null
          status?: string | null
          storage_location?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Update: {
          arrival_date?: string
          arrival_type?: string | null
          bill_no?: number
          created_at?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          guarantor?: string | null
          hamali_expenses?: number | null
          hire_charges?: number | null
          id?: string
          loaders_count?: number | null
          organization_id?: string | null
          other_expenses?: number | null
          party_id?: string | null
          reference_no?: string | null
          status?: string | null
          storage_location?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrivals_supplier_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      commodities: {
        Row: {
          critical_age_days: number | null
          default_unit: string | null
          id: string
          local_name: string | null
          name: string
          organization_id: string | null
          shelf_life_days: number | null
        }
        Insert: {
          critical_age_days?: number | null
          default_unit?: string | null
          id?: string
          local_name?: string | null
          name: string
          organization_id?: string | null
          shelf_life_days?: number | null
        }
        Update: {
          critical_age_days?: number | null
          default_unit?: string | null
          id?: string
          local_name?: string | null
          name?: string
          organization_id?: string | null
          shelf_life_days?: number | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          bank_details: Json | null
          contact_type: string | null
          id: string
          mandi_license_no: string | null
          name: string
          organization_id: string | null
          phone: string | null
        }
        Insert: {
          bank_details?: Json | null
          contact_type?: string | null
          id?: string
          mandi_license_no?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
        }
        Update: {
          bank_details?: Json | null
          contact_type?: string | null
          id?: string
          mandi_license_no?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      delivery_challan_items: {
        Row: {
          created_at: string
          delivery_challan_id: string
          id: string
          item_id: string
          quantity_dispatched: number
          remarks: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          delivery_challan_id: string
          id?: string
          item_id: string
          quantity_dispatched: number
          remarks?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          delivery_challan_id?: string
          id?: string
          item_id?: string
          quantity_dispatched?: number
          remarks?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      delivery_challans: {
        Row: {
          branch_id: string | null
          challan_date: string
          challan_number: string
          contact_id: string
          created_at: string
          destination: string | null
          driver_name: string | null
          id: string
          lr_number: string | null
          notes: string | null
          organization_id: string
          sales_order_id: string | null
          status: string
          transport_mode: string | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          branch_id?: string | null
          challan_date: string
          challan_number: string
          contact_id: string
          created_at?: string
          destination?: string | null
          driver_name?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          organization_id: string
          sales_order_id?: string | null
          status?: string
          transport_mode?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          branch_id?: string | null
          challan_date?: string
          challan_number?: string
          contact_id?: string
          created_at?: string
          destination?: string | null
          driver_name?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          organization_id?: string
          sales_order_id?: string | null
          status?: string
          transport_mode?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: []
      }
      lots: {
        Row: {
          advance: number | null
          arrival_id: string | null
          arrival_type: string | null
          barcode: string | null
          commission_percent: number | null
          contact_id: string | null
          created_at: string | null
          current_qty: number | null
          farmer_charges: number | null
          grade: string | null
          id: string
          initial_qty: number | null
          item_id: string | null
          less_percent: number | null
          loading_cost: number | null
          lot_code: string
          organization_id: string | null
          packing_cost: number | null
          sale_price: number | null
          status: string | null
          storage_location: string | null
          supplier_rate: number | null
          total_weight: number | null
          unit: string | null
          unit_weight: number | null
          variety: string | null
          wholesale_price: number | null
        }
        Insert: {
          advance?: number | null
          arrival_id?: string | null
          arrival_type?: string | null
          barcode?: string | null
          commission_percent?: number | null
          contact_id?: string | null
          created_at?: string | null
          current_qty?: number | null
          farmer_charges?: number | null
          grade?: string | null
          id?: string
          initial_qty?: number | null
          item_id?: string | null
          less_percent?: number | null
          loading_cost?: number | null
          lot_code: string
          organization_id?: string | null
          packing_cost?: number | null
          sale_price?: number | null
          status?: string | null
          storage_location?: string | null
          supplier_rate?: number | null
          total_weight?: number | null
          unit?: string | null
          unit_weight?: number | null
          variety?: string | null
          wholesale_price?: number | null
        }
        Update: {
          advance?: number | null
          arrival_id?: string | null
          arrival_type?: string | null
          barcode?: string | null
          commission_percent?: number | null
          contact_id?: string | null
          created_at?: string | null
          current_qty?: number | null
          farmer_charges?: number | null
          grade?: string | null
          id?: string
          initial_qty?: number | null
          item_id?: string | null
          less_percent?: number | null
          loading_cost?: number | null
          lot_code?: string
          organization_id?: string | null
          packing_cost?: number | null
          sale_price?: number | null
          status?: string | null
          storage_location?: string | null
          supplier_rate?: number | null
          total_weight?: number | null
          unit?: string | null
          unit_weight?: number | null
          variety?: string | null
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_commodity_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string | null
          created_by: string | null
          delta_amount: number
          id: string
          new_qty: number | null
          new_value: number
          old_qty: number | null
          old_value: number
          organization_id: string
          reason: string | null
          sale_id: string
          sale_item_id: string
          voucher_id: string | null
        }
        Insert: {
          adjustment_type: string
          created_at?: string | null
          created_by?: string | null
          delta_amount: number
          id?: string
          new_qty?: number | null
          new_value: number
          old_qty?: number | null
          old_value: number
          organization_id: string
          reason?: string | null
          sale_id: string
          sale_item_id: string
          voucher_id?: string | null
        }
        Update: {
          adjustment_type?: string
          created_at?: string | null
          created_by?: string | null
          delta_amount?: number
          id?: string
          new_qty?: number | null
          new_value?: number
          old_qty?: number | null
          old_value?: number
          organization_id?: string
          reason?: string | null
          sale_id?: string
          sale_item_id?: string
          voucher_id?: string | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          id: string
          lot_id: string | null
          quantity: number
          rate: number
          sale_id: string | null
          total_price: number
        }
        Insert: {
          id?: string
          lot_id?: string | null
          quantity: number
          rate: number
          sale_id?: string | null
          total_price: number
        }
        Update: {
          id?: string
          lot_id?: string | null
          quantity?: number
          rate?: number
          sale_id?: string | null
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          amount: number
          created_at: string | null
          gst_rate: number | null
          id: string
          item_id: string | null
          lot_id: string | null
          qty: number
          rate: number
          return_id: string
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          qty?: number
          rate?: number
          return_id: string
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          qty?: number
          rate?: number
          return_id?: string
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      sale_returns: {
        Row: {
          contact_id: string | null
          created_at: string | null
          grand_total: number | null
          id: string
          organization_id: string
          remarks: string | null
          return_date: string
          return_number: string | null
          return_type: string
          sale_id: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          grand_total?: number | null
          id?: string
          organization_id: string
          remarks?: string | null
          return_date?: string
          return_number?: string | null
          return_type: string
          sale_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          grand_total?: number | null
          id?: string
          organization_id?: string
          remarks?: string | null
          return_date?: string
          return_number?: string | null
          return_type?: string
          sale_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          buyer_id: string | null
          id: string
          organization_id: string | null
          sale_date: string
          status: string | null
          total_amount: number | null
        }
        Insert: {
          buyer_id?: string | null
          id?: string
          organization_id?: string | null
          sale_date: string
          status?: string | null
          total_amount?: number | null
        }
        Update: {
          buyer_id?: string | null
          id?: string
          organization_id?: string | null
          sale_date?: string
          status?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          amount_after_tax: number | null
          created_at: string
          discount_percent: number | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          item_id: string
          quantity: number
          sales_order_id: string
          tax_amount: number | null
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          amount_after_tax?: number | null
          created_at?: string
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id: string
          quantity: number
          sales_order_id: string
          tax_amount?: number | null
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          amount_after_tax?: number | null
          created_at?: string
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string
          quantity?: number
          sales_order_id?: string
          tax_amount?: number | null
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: []
      }
      sales_orders: {
        Row: {
          branch_id: string | null
          buyer_id: string
          cgst_amount: number | null
          created_at: string
          discount_amount: number | null
          grand_total: number | null
          id: string
          igst_amount: number | null
          is_igst: boolean | null
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          sgst_amount: number | null
          status: string
          subtotal: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          buyer_id: string
          cgst_amount?: number | null
          created_at?: string
          discount_amount?: number | null
          grand_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date: string
          order_number: string
          organization_id: string
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          buyer_id?: string
          cgst_amount?: number | null
          created_at?: string
          discount_amount?: number | null
          grand_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string | null
          destination_location: string | null
          id: string
          lot_id: string
          organization_id: string
          qty_change: number
          reference_id: string | null
          source_location: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string | null
          destination_location?: string | null
          id?: string
          lot_id: string
          organization_id: string
          qty_change: number
          reference_id?: string | null
          source_location?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string | null
          destination_location?: string | null
          id?: string
          lot_id?: string
          organization_id?: string
          qty_change?: number
          reference_id?: string | null
          source_location?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      view_party_balances: {
        Row: {
          contact_city: string | null
          contact_id: string | null
          contact_name: string | null
          contact_type: string | null
          credit_limit: number | null
          last_transaction_date: string | null
          net_balance: number | null
          organization_id: string | null
          phone: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      confirm_sale_transaction: {
        Args: {
          p_buyer_id: string
          p_due_date?: string
          p_idempotency_key?: string
          p_items: Json
          p_loading_charges?: number
          p_market_fee?: number
          p_misc_fee?: number
          p_nirashrit?: number
          p_organization_id: string
          p_other_expenses?: number
          p_payment_mode: string
          p_sale_date: string
          p_total_amount: number
          p_unloading_charges?: number
        }
        Returns: Json
      }
      get_invoice_balance: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_paid: number
          balance_due: number
          is_overpaid: boolean
          overpaid_amount: number
          status: string
          total_amount: number
        }[]
      }
      process_sale_return_transaction: {
        Args: { p_return_id: string }
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
      accounts: {
        Row: {
          account_name_te: string | null
          account_sub_type: string | null
          code: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          is_system_account: boolean | null
          name: string
          opening_balance: number | null
          organization_id: string
          type: string
        }
        Insert: {
          account_name_te?: string | null
          account_sub_type?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          is_system_account?: boolean | null
          name: string
          opening_balance?: number | null
          organization_id: string
          type: string
        }
        Update: {
          account_name_te?: string | null
          account_sub_type?: string | null
          code?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          is_system_account?: boolean | null
          name?: string
          opening_balance?: number | null
          organization_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      advance_payments: {
        Row: {
          amount: number
          contact_id: string
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          lot_id: string | null
          narration: string | null
          organization_id: string
          payment_mode: string
        }
        Insert: {
          amount: number
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          lot_id?: string | null
          narration?: string | null
          organization_id: string
          payment_mode?: string
        }
        Update: {
          amount?: number
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          lot_id?: string | null
          narration?: string | null
          organization_id?: string
          payment_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          scopes: string[] | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          scopes?: string[] | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          scopes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      app_plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_users: number | null
          monthly_price: number
          name: string
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_users?: number | null
          monthly_price: number
          name: string
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_users?: number | null
          monthly_price?: number
          name?: string
        }
        Relationships: []
      }
      arrivals: {
        Row: {
          arrival_date: string | null
          arrival_type: string | null
          bill_no: number
          created_at: string | null
          driver_mobile: string | null
          driver_name: string | null
          guarantor: string | null
          hamali_expenses: number | null
          hire_charges: number | null
          id: string
          loaders_count: number | null
          organization_id: string
          other_expenses: number | null
          party_id: string | null
          reference_no: string | null
          status: string | null
          storage_location: string | null
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Insert: {
          arrival_date?: string | null
          arrival_type?: string | null
          bill_no?: number
          created_at?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          guarantor?: string | null
          hamali_expenses?: number | null
          hire_charges?: number | null
          id?: string
          loaders_count?: number | null
          organization_id: string
          other_expenses?: number | null
          party_id?: string | null
          reference_no?: string | null
          status?: string | null
          storage_location?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Update: {
          arrival_date?: string | null
          arrival_type?: string | null
          bill_no?: number
          created_at?: string | null
          driver_mobile?: string | null
          driver_name?: string | null
          guarantor?: string | null
          hamali_expenses?: number | null
          hire_charges?: number | null
          id?: string
          loaders_count?: number | null
          organization_id?: string
          other_expenses?: number | null
          party_id?: string | null
          reference_no?: string | null
          status?: string | null
          storage_location?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrivals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "arrivals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrivals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "arrivals_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_bids: {
        Row: {
          amount: number
          bid_at: string | null
          bidder_name: string | null
          contact_id: string | null
          id: string
          is_winning: boolean | null
          organization_id: string
          session_id: string
        }
        Insert: {
          amount: number
          bid_at?: string | null
          bidder_name?: string | null
          contact_id?: string | null
          id?: string
          is_winning?: boolean | null
          organization_id: string
          session_id: string
        }
        Update: {
          amount?: number
          bid_at?: string | null
          bidder_name?: string | null
          contact_id?: string | null
          id?: string
          is_winning?: boolean | null
          organization_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "auction_bids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "auction_bids_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "auction_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_sessions: {
        Row: {
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          current_price: number | null
          id: string
          increment: number
          lot_id: string
          organization_id: string
          reserve_price: number | null
          start_price: number
          started_at: string | null
          status: string
          winning_bid_id: string | null
          winning_contact_id: string | null
          winning_price: number | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_price?: number | null
          id?: string
          increment?: number
          lot_id: string
          organization_id: string
          reserve_price?: number | null
          start_price?: number
          started_at?: string | null
          status?: string
          winning_bid_id?: string | null
          winning_contact_id?: string | null
          winning_price?: number | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_price?: number | null
          id?: string
          increment?: number
          lot_id?: string
          organization_id?: string
          reserve_price?: number | null
          start_price?: number
          started_at?: string | null
          status?: string
          winning_bid_id?: string | null
          winning_contact_id?: string | null
          winning_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_sessions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sessions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sessions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "auction_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "auction_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "auction_sessions_winning_contact_id_fkey"
            columns: ["winning_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          changes: Json | null
          created_at: string | null
          id: string
          organization_id: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          account_id: string | null
          balance: number | null
          created_by: string | null
          credit: number | null
          debit: number | null
          description: string | null
          id: string
          imported_at: string | null
          is_reconciled: boolean | null
          ledger_entry_id: string | null
          organization_id: string
          reference_no: string | null
          statement_date: string
        }
        Insert: {
          account_id?: string | null
          balance?: number | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_reconciled?: boolean | null
          ledger_entry_id?: string | null
          organization_id: string
          reference_no?: string | null
          statement_date: string
        }
        Update: {
          account_id?: string | null
          balance?: number | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_reconciled?: boolean | null
          ledger_entry_id?: string | null
          organization_id?: string
          reference_no?: string | null
          statement_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "view_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_statements_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_number: string
          created_at: string | null
          current_quantity: number | null
          expiry_date: string | null
          id: string
          initial_quantity: number | null
          is_active: boolean | null
          item_id: string
          mfg_date: string | null
          organization_id: string
          purchase_price: number | null
          sale_price: number | null
          storage_location_id: string | null
        }
        Insert: {
          batch_number: string
          created_at?: string | null
          current_quantity?: number | null
          expiry_date?: string | null
          id?: string
          initial_quantity?: number | null
          is_active?: boolean | null
          item_id: string
          mfg_date?: string | null
          organization_id: string
          purchase_price?: number | null
          sale_price?: number | null
          storage_location_id?: string | null
        }
        Update: {
          batch_number?: string
          created_at?: string | null
          current_quantity?: number | null
          expiry_date?: string | null
          id?: string
          initial_quantity?: number | null
          is_active?: boolean | null
          item_id?: string
          mfg_date?: string | null
          organization_id?: string
          purchase_price?: number | null
          sale_price?: number | null
          storage_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "batches_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          invoice_url: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          razorpay_payment_id: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_url?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          invoice_url?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          details: Json | null
          id: string
          is_resolved: boolean | null
          message: string
          organization_id: string
          resolved_at: string | null
          severity: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          message: string
          organization_id: string
          resolved_at?: string | null
          severity?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          message?: string
          organization_id?: string
          resolved_at?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "business_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      commodity_rates: {
        Row: {
          avg_rate: number
          created_at: string | null
          id: string
          item_id: string | null
          item_name: string
          max_rate: number
          min_rate: number
          organization_id: string
          rate_date: string
          source: string | null
          volume_qty: number | null
        }
        Insert: {
          avg_rate?: number
          created_at?: string | null
          id?: string
          item_id?: string | null
          item_name: string
          max_rate?: number
          min_rate?: number
          organization_id: string
          rate_date?: string
          source?: string | null
          volume_qty?: number | null
        }
        Update: {
          avg_rate?: number
          created_at?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          max_rate?: number
          min_rate?: number
          organization_id?: string
          rate_date?: string
          source?: string | null
          volume_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commodity_rates_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commodity_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "commodity_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commodity_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      compliance_controls: {
        Row: {
          category: string
          control_id: string
          created_at: string | null
          description: string | null
          evidence_url: string | null
          id: string
          last_reviewed_at: string | null
          notes: string | null
          organization_id: string | null
          owner: string | null
          status: string | null
          title: string
        }
        Insert: {
          category: string
          control_id: string
          created_at?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          last_reviewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner?: string | null
          status?: string | null
          title: string
        }
        Update: {
          category?: string
          control_id?: string
          created_at?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          last_reviewed_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "compliance_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_balance: number | null
          address: string | null
          city: string | null
          contact_code: string | null
          contact_sub_type: string | null
          created_at: string | null
          credit_days_limit: number | null
          credit_limit: number | null
          gstin: string | null
          id: string
          is_gst_registered: boolean | null
          metadata: Json | null
          name: string
          organization_id: string
          pan_number: string | null
          phone: string | null
          price_list_id: string | null
          state_code: string | null
          status: string | null
          tds_rate: number | null
          type: string
        }
        Insert: {
          account_balance?: number | null
          address?: string | null
          city?: string | null
          contact_code?: string | null
          contact_sub_type?: string | null
          created_at?: string | null
          credit_days_limit?: number | null
          credit_limit?: number | null
          gstin?: string | null
          id?: string
          is_gst_registered?: boolean | null
          metadata?: Json | null
          name: string
          organization_id: string
          pan_number?: string | null
          phone?: string | null
          price_list_id?: string | null
          state_code?: string | null
          status?: string | null
          tds_rate?: number | null
          type: string
        }
        Update: {
          account_balance?: number | null
          address?: string | null
          city?: string | null
          contact_code?: string | null
          contact_sub_type?: string | null
          created_at?: string | null
          credit_days_limit?: number | null
          credit_limit?: number | null
          gstin?: string | null
          id?: string
          is_gst_registered?: boolean | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          pan_number?: string | null
          phone?: string | null
          price_list_id?: string | null
          state_code?: string | null
          status?: string | null
          tds_rate?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "contacts_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_debit_notes: {
        Row: {
          amount: number
          branch_id: string | null
          contact_id: string
          created_at: string
          id: string
          note_date: string
          note_number: string
          note_type: string
          organization_id: string
          reason: string
          reference_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          note_date: string
          note_number: string
          note_type: string
          organization_id: string
          reason: string
          reference_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          note_date?: string
          note_number?: string
          note_type?: string
          organization_id?: string
          reason?: string
          reference_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_debit_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_debit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "credit_debit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_debit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "credit_debit_notes_reference_invoice_id_fkey"
            columns: ["reference_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          decimal_places: number | null
          is_active: boolean | null
          name: string
          symbol: string
        }
        Insert: {
          code: string
          decimal_places?: number | null
          is_active?: boolean | null
          name: string
          symbol: string
        }
        Update: {
          code?: string
          decimal_places?: number | null
          is_active?: boolean | null
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      customer_ledgers: {
        Row: {
          amount: number
          contact_id: string
          created_at: string | null
          description: string | null
          id: string
          organization_id: string
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          amount?: number
          contact_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          contact_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: []
      }
      damages: {
        Row: {
          created_at: string | null
          damage_date: string
          id: string
          lot_id: string
          organization_id: string
          qty: number
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          damage_date?: string
          id?: string
          lot_id: string
          organization_id: string
          qty?: number
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          damage_date?: string
          id?: string
          lot_id?: string
          organization_id?: string
          qty?: number
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damages_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "damages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "damages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      data_retention_policies: {
        Row: {
          created_at: string | null
          delete_action: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          retention_days: number
          table_name: string
        }
        Insert: {
          created_at?: string | null
          delete_action?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          retention_days?: number
          table_name: string
        }
        Update: {
          created_at?: string | null
          delete_action?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          retention_days?: number
          table_name?: string
        }
        Relationships: []
      }
      debug_log: {
        Row: {
          created_at: string | null
          id: number
          message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Relationships: []
      }
      delivery_challan_items: {
        Row: {
          created_at: string
          delivery_challan_id: string
          id: string
          item_id: string
          quantity_dispatched: number
          remarks: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          delivery_challan_id: string
          id?: string
          item_id: string
          quantity_dispatched: number
          remarks?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          delivery_challan_id?: string
          id?: string
          item_id?: string
          quantity_dispatched?: number
          remarks?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challan_items_delivery_challan_id_fkey"
            columns: ["delivery_challan_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challan_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challans: {
        Row: {
          branch_id: string | null
          challan_date: string
          challan_number: string
          contact_id: string
          created_at: string
          destination: string | null
          driver_name: string | null
          id: string
          lr_number: string | null
          notes: string | null
          organization_id: string
          sales_order_id: string | null
          status: string
          transport_mode: string | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          branch_id?: string | null
          challan_date: string
          challan_number: string
          contact_id: string
          created_at?: string
          destination?: string | null
          driver_name?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          organization_id: string
          sales_order_id?: string | null
          status?: string
          transport_mode?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          branch_id?: string | null
          challan_date?: string
          challan_number?: string
          contact_id?: string
          created_at?: string
          destination?: string | null
          driver_name?: string | null
          id?: string
          lr_number?: string | null
          notes?: string | null
          organization_id?: string
          sales_order_id?: string | null
          status?: string
          transport_mode?: string | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "delivery_challans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "delivery_challans_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      device_heartbeats: {
        Row: {
          app_version: string | null
          device_id: string
          ip_address: string | null
          last_sync_at: string | null
          metadata: Json | null
          org_id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          device_id: string
          ip_address?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          org_id: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          device_id?: string
          ip_address?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          org_id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_heartbeats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "device_heartbeats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_heartbeats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          join_date: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          role: string
          salary: number | null
          salary_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          role?: string
          salary?: number | null
          salary_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          join_date?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          role?: string
          salary?: number | null
          salary_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string | null
          from_currency: string
          id: string
          rate: number
          rate_date: string
          source: string | null
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          from_currency: string
          id?: string
          rate: number
          rate_date?: string
          source?: string | null
          to_currency: string
        }
        Update: {
          created_at?: string | null
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      feature_flags: {
        Row: {
          allowed_org_ids: string[] | null
          created_at: string | null
          description: string | null
          is_global_enabled: boolean | null
          key: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_org_ids?: string[] | null
          created_at?: string | null
          description?: string | null
          is_global_enabled?: boolean | null
          key: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_org_ids?: string[] | null
          created_at?: string | null
          description?: string | null
          is_global_enabled?: boolean | null
          key?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      field_configs: {
        Row: {
          created_at: string | null
          default_value: string | null
          display_order: number | null
          field_key: string
          field_type: string | null
          id: string
          is_mandatory: boolean | null
          is_visible: boolean | null
          label: string
          module_id: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          display_order?: number | null
          field_key: string
          field_type?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_visible?: boolean | null
          label: string
          module_id: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          display_order?: number | null
          field_key?: string
          field_type?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_visible?: boolean | null
          label?: string
          module_id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "field_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          end_date: string
          fiscal_year: string
          id: string
          organization_id: string
          period_name: string
          start_date: string
          status: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date: string
          fiscal_year: string
          id?: string
          organization_id: string
          period_name: string
          start_date: string
          status?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date?: string
          fiscal_year?: string
          id?: string
          organization_id?: string
          period_name?: string
          start_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      gate_entries: {
        Row: {
          commodity: string | null
          created_at: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          organization_id: string
          source: string | null
          status: string | null
          token_no: number
          updated_at: string | null
          vehicle_no: string
          weight_bridge_slip: string | null
        }
        Insert: {
          commodity?: string | null
          created_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          organization_id: string
          source?: string | null
          status?: string | null
          token_no?: number
          updated_at?: string | null
          vehicle_no: string
          weight_bridge_slip?: string | null
        }
        Update: {
          commodity?: string | null
          created_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          organization_id?: string
          source?: string | null
          status?: string | null
          token_no?: number
          updated_at?: string | null
          vehicle_no?: string
          weight_bridge_slip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "gate_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      inventory_wastage: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          item_id: string
          lot_id: string | null
          organization_id: string
          quantity_crates: number | null
          quantity_kg: number | null
          reason: string | null
          recorded_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          item_id: string
          lot_id?: string | null
          organization_id: string
          quantity_crates?: number | null
          quantity_kg?: number | null
          reason?: string | null
          recorded_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          item_id?: string
          lot_id?: string | null
          organization_id?: string
          quantity_crates?: number | null
          quantity_kg?: number | null
          reason?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_wastage_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_wastage_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_wastage_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_wastage_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "inventory_wastage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "inventory_wastage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_wastage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: string
          status?: string
          token: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          created_at: string | null
          due_date: string | null
          id: string
          organization_id: string | null
          paid_at: string | null
          pdf_url: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount_due: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount_due?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      item_images: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_primary: boolean | null
          item_id: string | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_primary?: boolean | null
          item_id?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_primary?: boolean | null
          item_id?: string | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_images_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "item_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      items: {
        Row: {
          alert_before_expiry_days: number | null
          average_cost: number | null
          barcode: string | null
          category: string | null
          critical_age_days: number | null
          custom_attributes: Json | null
          dealer_price: number | null
          default_expiry_days: number | null
          default_unit: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_gst_exempt: boolean | null
          local_name: string | null
          min_stock_level: number | null
          minimum_price: number | null
          name: string
          organization_id: string
          purchase_price: number | null
          sale_price: number | null
          shelf_life_days: number | null
          sku_code: string | null
          sub_category: string | null
          tracking_type: string | null
          wholesale_price: number | null
        }
        Insert: {
          alert_before_expiry_days?: number | null
          average_cost?: number | null
          barcode?: string | null
          category?: string | null
          critical_age_days?: number | null
          custom_attributes?: Json | null
          dealer_price?: number | null
          default_expiry_days?: number | null
          default_unit?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_gst_exempt?: boolean | null
          local_name?: string | null
          min_stock_level?: number | null
          minimum_price?: number | null
          name: string
          organization_id: string
          purchase_price?: number | null
          sale_price?: number | null
          shelf_life_days?: number | null
          sku_code?: string | null
          sub_category?: string | null
          tracking_type?: string | null
          wholesale_price?: number | null
        }
        Update: {
          alert_before_expiry_days?: number | null
          average_cost?: number | null
          barcode?: string | null
          category?: string | null
          critical_age_days?: number | null
          custom_attributes?: Json | null
          dealer_price?: number | null
          default_expiry_days?: number | null
          default_unit?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_gst_exempt?: boolean | null
          local_name?: string | null
          min_stock_level?: number | null
          minimum_price?: number | null
          name?: string
          organization_id?: string
          purchase_price?: number | null
          sale_price?: number | null
          shelf_life_days?: number | null
          sku_code?: string | null
          sub_category?: string | null
          tracking_type?: string | null
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string | null
          account_name: string | null
          contact_id: string | null
          credit: number | null
          debit: number | null
          description: string | null
          entry_date: string | null
          id: string
          organization_id: string
          reference_id: string | null
          reference_no: string | null
          transaction_type: string | null
          voucher_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          contact_id?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_date?: string | null
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_no?: string | null
          transaction_type?: string | null
          voucher_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          contact_id?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          entry_date?: string | null
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_no?: string | null
          transaction_type?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "view_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "ledger_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          advance: number | null
          alert_before_expiry_days: number | null
          arrival_id: string | null
          arrival_type: string | null
          bag_count: number | null
          bag_type: string | null
          barcode: string | null
          commission_percent: number | null
          contact_id: string
          created_at: string | null
          critical_age_days: number | null
          current_qty: number
          expiry_date: string | null
          farmer_charges: number | null
          grade: string | null
          id: string
          initial_qty: number
          item_id: string
          less_percent: number | null
          loading_cost: number | null
          lot_code: string
          mfg_date: string | null
          net_weight: number | null
          organization_id: string
          packing_cost: number | null
          payment_status: string | null
          purchase_bill_id: string | null
          sale_price: number | null
          season: string | null
          shelf_life_days: number | null
          status: string | null
          storage_location: string | null
          supplier_rate: number | null
          tare_weight: number | null
          total_weight: number | null
          unit: string
          unit_weight: number | null
          variety: string | null
          weighbridge_ticket_no: string | null
          wholesale_price: number | null
        }
        Insert: {
          advance?: number | null
          alert_before_expiry_days?: number | null
          arrival_id?: string | null
          arrival_type?: string | null
          bag_count?: number | null
          bag_type?: string | null
          barcode?: string | null
          commission_percent?: number | null
          contact_id: string
          created_at?: string | null
          critical_age_days?: number | null
          current_qty: number
          expiry_date?: string | null
          farmer_charges?: number | null
          grade?: string | null
          id?: string
          initial_qty: number
          item_id: string
          less_percent?: number | null
          loading_cost?: number | null
          lot_code: string
          mfg_date?: string | null
          net_weight?: number | null
          organization_id: string
          packing_cost?: number | null
          payment_status?: string | null
          purchase_bill_id?: string | null
          sale_price?: number | null
          season?: string | null
          shelf_life_days?: number | null
          status?: string | null
          storage_location?: string | null
          supplier_rate?: number | null
          tare_weight?: number | null
          total_weight?: number | null
          unit: string
          unit_weight?: number | null
          variety?: string | null
          weighbridge_ticket_no?: string | null
          wholesale_price?: number | null
        }
        Update: {
          advance?: number | null
          alert_before_expiry_days?: number | null
          arrival_id?: string | null
          arrival_type?: string | null
          bag_count?: number | null
          bag_type?: string | null
          barcode?: string | null
          commission_percent?: number | null
          contact_id?: string
          created_at?: string | null
          critical_age_days?: number | null
          current_qty?: number
          expiry_date?: string | null
          farmer_charges?: number | null
          grade?: string | null
          id?: string
          initial_qty?: number
          item_id?: string
          less_percent?: number | null
          loading_cost?: number | null
          lot_code?: string
          mfg_date?: string | null
          net_weight?: number | null
          organization_id?: string
          packing_cost?: number | null
          payment_status?: string | null
          purchase_bill_id?: string | null
          sale_price?: number | null
          season?: string | null
          shelf_life_days?: number | null
          status?: string | null
          storage_location?: string | null
          supplier_rate?: number | null
          tare_weight?: number | null
          total_weight?: number | null
          unit?: string
          unit_weight?: number | null
          variety?: string | null
          weighbridge_ticket_no?: string | null
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "lots_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          billing_email: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_id: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_email?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_id: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_email?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          address_line1: string | null
          address_line2: string | null
          brand_color: string | null
          brand_color_secondary: string | null
          business_domain: string | null
          city: string | null
          commission_rate_default: number | null
          created_at: string | null
          currency_code: string | null
          custom_domain: string | null
          default_credit_days: number | null
          email: string | null
          financial_year_start: string | null
          footer_text: string | null
          gst_number: string | null
          gst_registered: boolean | null
          gstin: string | null
          id: string
          inventory_valuation_method: string | null
          is_active: boolean | null
          join_code: string | null
          locale: string | null
          lock_date: string | null
          logo_url: string | null
          market_fee_percent: number | null
          market_fee_rate_default: number | null
          max_mobile_users: number | null
          max_web_users: number | null
          misc_fee_percent: number | null
          name: string
          nirashrit_percent: number | null
          pan_number: string | null
          period_lock_enabled: boolean | null
          period_locked_until: string | null
          phone: string | null
          settings: Json | null
          state_code: string | null
          subscription_tier: string | null
          timezone: string | null
          trial_ends_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          brand_color?: string | null
          brand_color_secondary?: string | null
          business_domain?: string | null
          city?: string | null
          commission_rate_default?: number | null
          created_at?: string | null
          currency_code?: string | null
          custom_domain?: string | null
          default_credit_days?: number | null
          email?: string | null
          financial_year_start?: string | null
          footer_text?: string | null
          gst_number?: string | null
          gst_registered?: boolean | null
          gstin?: string | null
          id?: string
          inventory_valuation_method?: string | null
          is_active?: boolean | null
          join_code?: string | null
          locale?: string | null
          lock_date?: string | null
          logo_url?: string | null
          market_fee_percent?: number | null
          market_fee_rate_default?: number | null
          max_mobile_users?: number | null
          max_web_users?: number | null
          misc_fee_percent?: number | null
          name: string
          nirashrit_percent?: number | null
          pan_number?: string | null
          period_lock_enabled?: boolean | null
          period_locked_until?: string | null
          phone?: string | null
          settings?: Json | null
          state_code?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          brand_color?: string | null
          brand_color_secondary?: string | null
          business_domain?: string | null
          city?: string | null
          commission_rate_default?: number | null
          created_at?: string | null
          currency_code?: string | null
          custom_domain?: string | null
          default_credit_days?: number | null
          email?: string | null
          financial_year_start?: string | null
          footer_text?: string | null
          gst_number?: string | null
          gst_registered?: boolean | null
          gstin?: string | null
          id?: string
          inventory_valuation_method?: string | null
          is_active?: boolean | null
          join_code?: string | null
          locale?: string | null
          lock_date?: string | null
          logo_url?: string | null
          market_fee_percent?: number | null
          market_fee_rate_default?: number | null
          max_mobile_users?: number | null
          max_web_users?: number | null
          misc_fee_percent?: number | null
          name?: string
          nirashrit_percent?: number | null
          pan_number?: string | null
          period_lock_enabled?: boolean | null
          period_locked_until?: string | null
          phone?: string | null
          settings?: Json | null
          state_code?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          channel: string
          contact_id: string
          created_by: string | null
          id: string
          message: string
          organization_id: string
          sale_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          channel?: string
          contact_id: string
          created_by?: string | null
          id?: string
          message: string
          organization_id: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          channel?: string
          contact_id?: string
          created_by?: string | null
          id?: string
          message?: string
          organization_id?: string
          sale_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "payment_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "payment_reminders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          min_quantity: number | null
          price_list_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          min_quantity?: number | null
          price_list_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          min_quantity?: number | null
          price_list_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_domain: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          role: string | null
        }
        Insert: {
          business_domain?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          organization_id?: string | null
          role?: string | null
        }
        Update: {
          business_domain?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      purchase_adjustments: {
        Row: {
          adjustment_date: string
          created_at: string | null
          id: string
          lot_id: string
          new_rate: number
          old_rate: number
          organization_id: string
          reason: string | null
          updated_at: string | null
        }
        Insert: {
          adjustment_date?: string
          created_at?: string | null
          id?: string
          lot_id: string
          new_rate: number
          old_rate: number
          organization_id: string
          reason?: string | null
          updated_at?: string | null
        }
        Update: {
          adjustment_date?: string
          created_at?: string | null
          id?: string
          lot_id?: string
          new_rate?: number
          old_rate?: number
          organization_id?: string
          reason?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_adjustments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_adjustments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_adjustments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "purchase_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          bill_date: string | null
          bill_number: string | null
          created_at: string | null
          id: string
          organization_id: string
          paid_amount: number
          status: string | null
          supplier_id: string
          total_amount: number
        }
        Insert: {
          bill_date?: string | null
          bill_number?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          paid_amount?: number
          status?: string | null
          supplier_id: string
          total_amount?: number
        }
        Update: {
          bill_date?: string | null
          bill_number?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          paid_amount?: number
          status?: string | null
          supplier_id?: string
          total_amount?: number
        }
        Relationships: []
      }
      purchase_invoice_items: {
        Row: {
          amount: number
          cgst_amount: number | null
          created_at: string | null
          discount_percent: number | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          igst_amount: number | null
          item_id: string | null
          organization_id: string
          purchase_invoice_id: string
          qty: number
          rate: number
          sgst_amount: number | null
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount: number
          cgst_amount?: number | null
          created_at?: string | null
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          item_id?: string | null
          organization_id: string
          purchase_invoice_id: string
          qty: number
          rate: number
          sgst_amount?: number | null
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          cgst_amount?: number | null
          created_at?: string | null
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          item_id?: string | null
          organization_id?: string
          purchase_invoice_id?: string
          qty?: number
          rate?: number
          sgst_amount?: number | null
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          amount_paid: number | null
          cgst_amount: number | null
          created_at: string | null
          discount_amount: number | null
          due_date: string | null
          grand_total: number | null
          gross_amount: number | null
          gst_total: number | null
          id: string
          igst_amount: number | null
          invoice_date: string | null
          invoice_no: number
          invoice_number: string | null
          is_igst: boolean | null
          notes: string | null
          organization_id: string
          payment_status: string | null
          place_of_supply: string | null
          purchase_order_id: string | null
          round_off: number | null
          sgst_amount: number | null
          status: string
          subtotal: number | null
          supplier_id: string | null
          supplier_invoice_no: string | null
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          grand_total?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          invoice_date?: string | null
          invoice_no?: number
          invoice_number?: string | null
          is_igst?: boolean | null
          notes?: string | null
          organization_id: string
          payment_status?: string | null
          place_of_supply?: string | null
          purchase_order_id?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          grand_total?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          invoice_date?: string | null
          invoice_no?: number
          invoice_number?: string | null
          is_igst?: boolean | null
          notes?: string | null
          organization_id?: string
          payment_status?: string | null
          place_of_supply?: string | null
          purchase_order_id?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "purchase_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          amount: number
          created_at: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          item_id: string | null
          organization_id: string
          purchase_order_id: string
          qty: number
          rate: number
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string | null
          organization_id: string
          purchase_order_id: string
          qty: number
          rate: number
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string | null
          organization_id?: string
          purchase_order_id?: string
          qty?: number
          rate?: number
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          cgst_amount: number | null
          created_at: string | null
          discount_amount: number | null
          due_date: string | null
          expected_delivery_date: string | null
          gross_amount: number | null
          gst_total: number | null
          id: string
          igst_amount: number | null
          is_igst: boolean | null
          notes: string | null
          order_date: string | null
          order_no: number
          organization_id: string
          place_of_supply: string | null
          round_off: number | null
          sgst_amount: number | null
          status: string
          supplier_gstin: string | null
          supplier_id: string | null
          total_amount: number | null
          total_amount_inc_tax: number | null
          updated_at: string | null
        }
        Insert: {
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          expected_delivery_date?: string | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date?: string | null
          order_no?: number
          organization_id: string
          place_of_supply?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          status?: string
          supplier_gstin?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          total_amount_inc_tax?: number | null
          updated_at?: string | null
        }
        Update: {
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          due_date?: string | null
          expected_delivery_date?: string | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date?: string | null
          order_no?: number
          organization_id?: string
          place_of_supply?: string | null
          round_off?: number | null
          sgst_amount?: number | null
          status?: string
          supplier_gstin?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          total_amount_inc_tax?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          amount: number
          contact_id: string
          created_at: string | null
          id: string
          lot_id: string
          organization_id: string
          qty: number
          rate: number
          remarks: string | null
          return_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          contact_id: string
          created_at?: string | null
          id?: string
          lot_id: string
          organization_id: string
          qty?: number
          rate?: number
          remarks?: string | null
          return_date?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contact_id?: string
          created_at?: string | null
          id?: string
          lot_id?: string
          organization_id?: string
          qty?: number
          rate?: number
          remarks?: string | null
          return_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "purchase_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "purchase_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          amount: number
          created_at: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          item_id: string | null
          organization_id: string
          qty: number
          quotation_id: string
          rate: number
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string | null
          organization_id: string
          qty: number
          quotation_id: string
          rate: number
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string | null
          organization_id?: string
          qty?: number
          quotation_id?: string
          rate?: number
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "quotation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          buyer_id: string | null
          cgst_amount: number | null
          created_at: string | null
          discount_amount: number | null
          grand_total: number | null
          gross_amount: number | null
          gst_total: number | null
          id: string
          igst_amount: number | null
          is_igst: boolean | null
          notes: string | null
          organization_id: string
          place_of_supply: string | null
          quotation_date: string | null
          quotation_no: number
          quotation_number: string | null
          round_off: number | null
          sales_order_id: string | null
          sgst_amount: number | null
          status: string
          subtotal: number | null
          terms: string | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          buyer_id?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          grand_total?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          organization_id: string
          place_of_supply?: string | null
          quotation_date?: string | null
          quotation_no?: number
          quotation_number?: string | null
          round_off?: number | null
          sales_order_id?: string | null
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          terms?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          buyer_id?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          discount_amount?: number | null
          grand_total?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          organization_id?: string
          place_of_supply?: string | null
          quotation_date?: string | null
          quotation_no?: number
          quotation_number?: string | null
          round_off?: number | null
          sales_order_id?: string | null
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          terms?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "quotations_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          organization_id: string
          party_id: string
          payment_date: string | null
          payment_mode: string
          receipt_no: number
          reference_no: string | null
          remarks: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          organization_id: string
          party_id: string
          payment_date?: string | null
          payment_mode: string
          receipt_no?: number
          reference_no?: string | null
          remarks?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          organization_id?: string
          party_id?: string
          payment_date?: string | null
          payment_mode?: string
          receipt_no?: number
          reference_no?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "receipts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_invoices: {
        Row: {
          amount: number
          billing_reason: string | null
          created_at: string | null
          due_date: string | null
          id: string
          org_id: string
          pdf_url: string | null
          period_end: string | null
          period_start: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subscription_id: string | null
          usage_details: Json | null
        }
        Insert: {
          amount: number
          billing_reason?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subscription_id?: string | null
          usage_details?: Json | null
        }
        Update: {
          amount?: number
          billing_reason?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subscription_id?: string | null
          usage_details?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "saas_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "saas_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string | null
          created_by: string | null
          delta_amount: number
          id: string
          new_qty: number | null
          new_value: number
          old_qty: number | null
          old_value: number
          organization_id: string
          reason: string | null
          sale_id: string
          sale_item_id: string
          voucher_id: string | null
        }
        Insert: {
          adjustment_type: string
          created_at?: string | null
          created_by?: string | null
          delta_amount: number
          id?: string
          new_qty?: number | null
          new_value: number
          old_qty?: number | null
          old_value: number
          organization_id: string
          reason?: string | null
          sale_id: string
          sale_item_id: string
          voucher_id?: string | null
        }
        Update: {
          adjustment_type?: string
          created_at?: string | null
          created_by?: string | null
          delta_amount?: number
          id?: string
          new_qty?: number | null
          new_value?: number
          old_qty?: number | null
          old_value?: number
          organization_id?: string
          reason?: string | null
          sale_id?: string
          sale_item_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "sale_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sale_adjustments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_adjustments_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          amount: number
          cost_price: number | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          lot_id: string | null
          margin_amount: number | null
          organization_id: string
          qty: number
          rate: number
          sale_id: string | null
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount: number
          cost_price?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          lot_id?: string | null
          margin_amount?: number | null
          organization_id: string
          qty: number
          rate: number
          sale_id?: string | null
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          cost_price?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          lot_id?: string | null
          margin_amount?: number | null
          organization_id?: string
          qty?: number
          rate?: number
          sale_id?: string | null
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          amount: number
          created_at: string | null
          gst_rate: number | null
          id: string
          item_id: string | null
          lot_id: string | null
          qty: number
          rate: number
          return_id: string
          tax_amount: number | null
          unit: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          qty?: number
          rate?: number
          return_id: string
          tax_amount?: number | null
          unit?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          gst_rate?: number | null
          id?: string
          item_id?: string | null
          lot_id?: string | null
          qty?: number
          rate?: number
          return_id?: string
          tax_amount?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          contact_id: string | null
          created_at: string | null
          grand_total: number | null
          id: string
          organization_id: string
          remarks: string | null
          return_date: string
          return_number: string | null
          return_type: string
          sale_id: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          grand_total?: number | null
          id?: string
          organization_id: string
          remarks?: string | null
          return_date?: string
          return_number?: string | null
          return_type: string
          sale_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          grand_total?: number | null
          id?: string
          organization_id?: string
          remarks?: string | null
          return_date?: string
          return_number?: string | null
          return_type?: string
          sale_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bill_no: number
          buyer_gstin: string | null
          buyer_id: string | null
          cgst_amount: number | null
          created_at: string | null
          currency_code: string | null
          discount_amount: number | null
          due_date: string | null
          exchange_rate_to_inr: number | null
          gross_amount: number | null
          gst_total: number | null
          id: string
          idempotency_key: string | null
          igst_amount: number | null
          is_igst: boolean | null
          is_pos: boolean | null
          labor_amount: number | null
          loading_charges: number | null
          market_fee: number | null
          misc_fee: number | null
          nirashrit: number | null
          organization_id: string
          other_expenses: number | null
          payment_mode: string | null
          payment_status: string | null
          place_of_supply: string | null
          round_off: number | null
          sale_date: string | null
          sgst_amount: number | null
          total_amount: number | null
          total_amount_inc_tax: number | null
          unloading_charges: number | null
          workflow_status: string | null
        }
        Insert: {
          bill_no?: number
          buyer_gstin?: string | null
          buyer_id?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          currency_code?: string | null
          discount_amount?: number | null
          due_date?: string | null
          exchange_rate_to_inr?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number | null
          is_igst?: boolean | null
          is_pos?: boolean | null
          labor_amount?: number | null
          loading_charges?: number | null
          market_fee?: number | null
          misc_fee?: number | null
          nirashrit?: number | null
          organization_id: string
          other_expenses?: number | null
          payment_mode?: string | null
          payment_status?: string | null
          place_of_supply?: string | null
          round_off?: number | null
          sale_date?: string | null
          sgst_amount?: number | null
          total_amount?: number | null
          total_amount_inc_tax?: number | null
          unloading_charges?: number | null
          workflow_status?: string | null
        }
        Update: {
          bill_no?: number
          buyer_gstin?: string | null
          buyer_id?: string | null
          cgst_amount?: number | null
          created_at?: string | null
          currency_code?: string | null
          discount_amount?: number | null
          due_date?: string | null
          exchange_rate_to_inr?: number | null
          gross_amount?: number | null
          gst_total?: number | null
          id?: string
          idempotency_key?: string | null
          igst_amount?: number | null
          is_igst?: boolean | null
          is_pos?: boolean | null
          labor_amount?: number | null
          loading_charges?: number | null
          market_fee?: number | null
          misc_fee?: number | null
          nirashrit?: number | null
          organization_id?: string
          other_expenses?: number | null
          payment_mode?: string | null
          payment_status?: string | null
          place_of_supply?: string | null
          round_off?: number | null
          sale_date?: string | null
          sgst_amount?: number | null
          total_amount?: number | null
          total_amount_inc_tax?: number | null
          unloading_charges?: number | null
          workflow_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          amount_after_tax: number | null
          created_at: string
          discount_percent: number | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          item_id: string
          quantity: number
          sales_order_id: string
          tax_amount: number | null
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          amount_after_tax?: number | null
          created_at?: string
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id: string
          quantity: number
          sales_order_id: string
          tax_amount?: number | null
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          amount_after_tax?: number | null
          created_at?: string
          discount_percent?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          item_id?: string
          quantity?: number
          sales_order_id?: string
          tax_amount?: number | null
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          branch_id: string | null
          buyer_id: string
          cgst_amount: number | null
          created_at: string
          discount_amount: number | null
          grand_total: number | null
          id: string
          igst_amount: number | null
          is_igst: boolean | null
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          sgst_amount: number | null
          status: string
          subtotal: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          buyer_id: string
          cgst_amount?: number | null
          created_at?: string
          discount_amount?: number | null
          grand_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date: string
          order_number: string
          organization_id: string
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          buyer_id?: string
          cgst_amount?: number | null
          created_at?: string
          discount_amount?: number | null
          grand_total?: number | null
          id?: string
          igst_amount?: number | null
          is_igst?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          sgst_amount?: number | null
          status?: string
          subtotal?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_id: string | null
          actor_ip: string | null
          actor_ua: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          organization_id: string | null
          resource: string | null
          severity: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_ip?: string | null
          actor_ua?: string | null
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          organization_id?: string | null
          resource?: string | null
          severity?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_ip?: string | null
          actor_ua?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          organization_id?: string | null
          resource?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "security_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      settings: {
        Row: {
          commission_percentage: number | null
          default_printer_mac: string | null
          hamali_per_unit: number | null
          id: string
          market_fee_percentage: number | null
          merchant_id: string
        }
        Insert: {
          commission_percentage?: number | null
          default_printer_mac?: string | null
          hamali_per_unit?: number | null
          id?: string
          market_fee_percentage?: number | null
          merchant_id: string
        }
        Update: {
          commission_percentage?: number | null
          default_printer_mac?: string | null
          hamali_per_unit?: number | null
          id?: string
          market_fee_percentage?: number | null
          merchant_id?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string | null
          destination_location: string | null
          id: string
          lot_id: string | null
          organization_id: string
          qty_change: number
          reference_id: string | null
          source_location: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string | null
          destination_location?: string | null
          id?: string
          lot_id?: string | null
          organization_id: string
          qty_change: number
          reference_id?: string | null
          source_location?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string | null
          destination_location?: string | null
          id?: string
          lot_id?: string | null
          organization_id?: string
          qty_change?: number
          reference_id?: string | null
          source_location?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "stock_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          lot_id: string | null
          quantity: number
          stock_transfer_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          lot_id?: string | null
          quantity?: number
          stock_transfer_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          lot_id?: string | null
          quantity?: number
          stock_transfer_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_transfer_items_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string | null
          created_by: string | null
          from_location_id: string
          id: string
          notes: string | null
          organization_id: string
          status: string
          to_location_id: string
          transfer_date: string
          transfer_number: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          from_location_id: string
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
          to_location_id: string
          transfer_date?: string
          transfer_number: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          from_location_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          to_location_id?: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          location_type: string | null
          name: string
          organization_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_type?: string | null
          name: string
          organization_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_type?: string | null
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "storage_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_lots_per_month: number | null
          max_mobile_users: number | null
          max_users: number | null
          max_web_users: number | null
          name: string
          price_monthly: number
          price_yearly: number
        }
        Insert: {
          created_at?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_lots_per_month?: number | null
          max_mobile_users?: number | null
          max_users?: number | null
          max_web_users?: number | null
          name: string
          price_monthly?: number
          price_yearly?: number
        }
        Update: {
          created_at?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_lots_per_month?: number | null
          max_mobile_users?: number | null
          max_users?: number | null
          max_web_users?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"] | null
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      supplier_bills: {
        Row: {
          bill_no: number
          commission_amount: number
          created_at: string | null
          id: string
          net_payable: number
          organization_id: string
          sale_id: string
          status: string | null
          supplier_id: string
          total_amount: number
        }
        Insert: {
          bill_no: number
          commission_amount?: number
          created_at?: string | null
          id?: string
          net_payable?: number
          organization_id: string
          sale_id: string
          status?: string | null
          supplier_id: string
          total_amount?: number
        }
        Update: {
          bill_no?: number
          commission_amount?: number
          created_at?: string | null
          id?: string
          net_payable?: number
          organization_id?: string
          sale_id?: string
          status?: string | null
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          details: Json
          id: string
          organization_id: string | null
          resolved_at: string | null
          severity: string
          status: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          details: Json
          id?: string
          organization_id?: string | null
          resolved_at?: string | null
          severity: string
          status?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          details?: Json
          id?: string
          organization_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "system_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          conversion_factor: number
          from_unit: string
          id: string
          item_type: string
          merchant_id: string
          to_unit: string
        }
        Insert: {
          conversion_factor: number
          from_unit: string
          id?: string
          item_type: string
          merchant_id: string
          to_unit: string
        }
        Update: {
          conversion_factor?: number
          from_unit?: string
          id?: string
          item_type?: string
          merchant_id?: string
          to_unit?: string
        }
        Relationships: []
      }
      usage_metrics: {
        Row: {
          active_users: number | null
          id: string
          lots_created: number | null
          metric_date: string
          organization_id: string
          payments_created: number | null
          sales_created: number | null
        }
        Insert: {
          active_users?: number | null
          id?: string
          lots_created?: number | null
          metric_date?: string
          organization_id: string
          payments_created?: number | null
          sales_created?: number | null
        }
        Update: {
          active_users?: number | null
          id?: string
          lots_created?: number | null
          metric_date?: string
          organization_id?: string
          payments_created?: number | null
          sales_created?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "usage_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      voucher_sequences: {
        Row: {
          last_voucher_no: number
          organization_id: string
        }
        Insert: {
          last_voucher_no?: number
          organization_id: string
        }
        Update: {
          last_voucher_no?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "voucher_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          date: string
          discount_amount: number | null
          id: string
          invoice_id: string | null
          is_locked: boolean | null
          narration: string | null
          organization_id: string
          type: string
          voucher_no: number
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          is_locked?: boolean | null
          narration?: string | null
          organization_id: string
          type: string
          voucher_no?: number
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          discount_amount?: number | null
          id?: string
          invoice_id?: string | null
          is_locked?: boolean | null
          narration?: string | null
          organization_id?: string
          type?: string
          voucher_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Views: {
      global_audit_logs: {
        Row: {
          action_type: string | null
          actor_id: string | null
          created_at: string | null
          details: Json | null
          entity_type: string | null
          id: string | null
          ip_address: unknown
          organization_id: string | null
          record_id: string | null
          target_org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_advance_payments: {
        Row: {
          amount: number | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          date: string | null
          id: string | null
          lot_code: string | null
          lot_id: string | null
          narration: string | null
          organization_id: string | null
          payment_mode: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advance_payments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_lot_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "view_stock_aging"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_location_stock: {
        Row: {
          active_lots_count: number | null
          aging_stock: number | null
          arrival_type: string | null
          critical_stock: number | null
          current_stock: number | null
          fresh_stock: number | null
          image_url: string | null
          item_id: string | null
          item_name: string | null
          organization_id: string | null
          storage_location: string | null
          total_inward: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_lot_stock: {
        Row: {
          arrival_id: string | null
          arrival_type: string | null
          commission_percent: number | null
          contact_id: string | null
          created_at: string | null
          critical_age_days: number | null
          current_qty: number | null
          farmer_charges: number | null
          farmer_city: string | null
          farmer_name: string | null
          grade: string | null
          id: string | null
          initial_qty: number | null
          item_id: string | null
          item_name: string | null
          lot_code: string | null
          organization_id: string | null
          shelf_life_days: number | null
          status: string | null
          supplier_rate: number | null
          total_weight: number | null
          unit: string | null
          unit_weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_arrival_id_fkey"
            columns: ["arrival_id"]
            isOneToOne: false
            referencedRelation: "arrivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_party_balances: {
        Row: {
          contact_city: string | null
          contact_id: string | null
          contact_name: string | null
          contact_type: string | null
          credit_limit: number | null
          last_transaction_date: string | null
          net_balance: number | null
          organization_id: string | null
          phone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_receivable_aging: {
        Row: {
          bucket_0_30: number | null
          bucket_31_60: number | null
          bucket_61_90: number | null
          bucket_90_plus: number | null
          contact_id: string | null
          contact_name: string | null
          net_balance: number | null
          organization_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_reconciliation_summary: {
        Row: {
          account_id: string | null
          account_name: string | null
          latest_statement_date: string | null
          organization_id: string | null
          reconciled_count: number | null
          unreconciled_amount: number | null
          unreconciled_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "view_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_stock_aging: {
        Row: {
          age_days: number | null
          arrival_date: string | null
          current_stock_qty: number | null
          image_url: string | null
          item_id: string | null
          item_name: string | null
          lot_id: string | null
          lot_number: string | null
          organization_id: string | null
          status: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_stock_summary: {
        Row: {
          active_lots_count: number | null
          arrival_type: string | null
          current_stock: number | null
          item_id: string | null
          item_name: string | null
          organization_id: string | null
          total_inward: number | null
          total_sold: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
      view_tenant_health: {
        Row: {
          activity_score: number | null
          data_quality_score: number | null
          last_lot_at: string | null
          last_sale_at: string | null
          open_alerts: number | null
          org_id: string | null
          org_name: string | null
          overdue_invoices: number | null
          subscription_tier: string | null
        }
        Insert: {
          activity_score?: never
          data_quality_score?: never
          last_lot_at?: never
          last_sale_at?: never
          open_alerts?: never
          org_id?: string | null
          org_name?: string | null
          overdue_invoices?: never
          subscription_tier?: string | null
        }
        Update: {
          activity_score?: never
          data_quality_score?: never
          last_lot_at?: never
          last_sale_at?: never
          open_alerts?: never
          org_id?: string | null
          org_name?: string | null
          overdue_invoices?: never
          subscription_tier?: string | null
        }
        Relationships: []
      }
      view_trial_balance: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          net_balance: number | null
          organization_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "global_audit_logs"
            referencedColumns: ["target_org_id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "view_tenant_health"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { invite_token: string }; Returns: boolean }
      adjust_balance: {
        Args: {
          p_account_id: string
          p_amount: number
          p_organization_id: string
          p_type: string
        }
        Returns: Json
      }
      admin_cleanup_ledger: { Args: { p_ids: string[] }; Returns: undefined }
      admin_create_invoice: {
        Args: { p_amount: number; p_due_date: string; p_org_id: string }
        Returns: string
      }
      admin_force_delete_org: { Args: { p_org_id: string }; Returns: undefined }
      admin_recalculate_ledger: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      allocate_payments_fifo: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      auto_reconcile_bank_statements: {
        Args: { p_account_id: string; p_organization_id: string }
        Returns: Json
      }
      check_feature_enabled: {
        Args: { p_key: string; p_org_id?: string }
        Returns: boolean
      }
      check_subscription_access: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      check_system_integrity: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      close_auction: { Args: { p_session_id: string }; Returns: Json }
      compute_sale_gst: {
        Args: { p_org_id: string; p_sale_id: string }
        Returns: Json
      }
      confirm_purchase_invoice_v2: {
        Args: {
          p_amount_paid: number
          p_due_date: string
          p_idempotency_key?: string
          p_invoice_date: string
          p_items: Json
          p_notes: string
          p_organization_id: string
          p_payment_account_id: string
          p_supplier_id: string
          p_supplier_invoice_no: string
        }
        Returns: Json
      }
      confirm_sale_transaction:
        | {
            Args: {
              p_buyer_id: string
              p_idempotency_key?: string
              p_items: Json
              p_loading_charges?: number
              p_market_fee?: number
              p_misc_fee?: number
              p_nirashrit?: number
              p_organization_id: string
              p_other_expenses?: number
              p_payment_mode: string
              p_sale_date: string
              p_total_amount: number
              p_unloading_charges?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_buyer_id: string
              p_due_date?: string
              p_idempotency_key?: string
              p_items: Json
              p_loading_charges?: number
              p_market_fee?: number
              p_misc_fee?: number
              p_nirashrit?: number
              p_organization_id: string
              p_other_expenses?: number
              p_payment_mode: string
              p_sale_date: string
              p_total_amount: number
              p_unloading_charges?: number
            }
            Returns: Json
          }
      convert_currency: {
        Args: {
          p_amount: number
          p_date?: string
          p_from: string
          p_to: string
        }
        Returns: number
      }
      create_comprehensive_sale_adjustment: {
        Args: {
          p_new_qty: number
          p_new_rate: number
          p_organization_id: string
          p_reason: string
          p_sale_item_id: string
        }
        Returns: Json
      }
      create_financial_transaction: {
        Args: {
          p_amount: number
          p_contact_id: string
          p_date: string
          p_narration: string
          p_organization_id: string
          p_payment_mode: string
          p_transaction_type: string
        }
        Returns: Json
      }
      create_organization_and_admin: {
        Args: {
          admin_email: string
          admin_name: string
          admin_password: string
          org_name: string
          org_plan: string
        }
        Returns: string
      }
      create_sale_adjustment: {
        Args: {
          p_new_rate: number
          p_organization_id: string
          p_reason: string
          p_sale_item_id: string
        }
        Returns: Json
      }
      create_voucher: {
        Args: {
          p_account_id?: string
          p_amount: number
          p_date: string
          p_discount?: number
          p_invoice_id?: string
          p_organization_id: string
          p_party_id?: string
          p_payment_mode: string
          p_remarks?: string
          p_voucher_type: string
        }
        Returns: Json
      }
      decrement_lot_qty: {
        Args: { lot_id_input: string; qty_input: number }
        Returns: undefined
      }
      diagnose_data_drift: {
        Args: { p_org_id?: string }
        Returns: {
          drift: number
          inventory_qty: number
          item_id: string
          item_name: string
          ledger_sum: number
          org_id: string
        }[]
      }
      forecast_commodity_rate: {
        Args: { p_days?: number; p_item_id: string; p_org_id: string }
        Returns: Json
      }
      generate_business_alerts: { Args: never; Returns: number }
      generate_consolidated_invoice: {
        Args: {
          p_buyer_id: string
          p_commission: number
          p_invoice_number: string
          p_market_fee: number
          p_merchant_id: string
          p_total_amount: number
          p_transaction_ids: string[]
        }
        Returns: Json
      }
      generate_monthly_invoices: {
        Args: { p_billing_date?: string }
        Returns: Json
      }
      get_admin_audit_logs: {
        Args: never
        Returns: {
          action_type: string
          actor_email: string
          created_at: string
          details: Json
          id: string
          ip_address: string
          target_org_name: string
        }[]
      }
      get_billing_overview: { Args: never; Returns: Json }
      get_dunning_message: {
        Args: { p_contact_id: string; p_org_id: string; p_template?: string }
        Returns: Json
      }
      get_feature_flags: {
        Args: { p_org_id?: string }
        Returns: {
          description: string
          id: string
          is_enabled: boolean
          is_targeted: boolean
          key_name: string
          name: string
        }[]
      }
      get_financial_summary: { Args: { p_org_id: string }; Returns: Json }
      get_global_risk_metrics: { Args: never; Returns: Json }
      get_invoice_balance: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_paid: number
          balance_due: number
          is_overpaid: boolean
          overpaid_amount: number
          status: string
          total_amount: number
        }[]
      }
      get_ledger_statement: {
        Args: {
          p_contact_id: string
          p_end_date: string
          p_organization_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_ledger_statement_paged: {
        Args: {
          p_contact_id: string
          p_end_date: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_my_org_id: { Args: never; Returns: string }
      get_next_voucher_no: {
        Args: { p_organization_id: string }
        Returns: number
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_tenant_details: { Args: { p_org_id: string }; Returns: Json }
      get_tenant_health_layout: {
        Args: never
        Returns: {
          active_users: number
          health_score: number
          last_active: string
          org_id: string
          org_name: string
          risk_level: string
        }[]
      }
      initialize_mandi: {
        Args: { p_city: string; p_full_name: string; p_name: string }
        Returns: string
      }
      initialize_organization: {
        Args: {
          p_business_domain?: string
          p_city: string
          p_full_name: string
          p_name: string
        }
        Returns: string
      }
      is_feature_enabled: {
        Args: { p_flag: string; p_org_id: string }
        Returns: boolean
      }
      is_period_locked: {
        Args: { p_date: string; p_organization_id: string }
        Returns: boolean
      }
      join_organization: { Args: { p_join_code: string }; Returns: Json }
      log_admin_action: {
        Args: {
          p_action_type: string
          p_details: Json
          p_ip_address: string
          p_target_org_id: string
        }
        Returns: undefined
      }
      log_device_heartbeat: {
        Args: {
          p_app_version: string
          p_device_id: string
          p_metadata?: Json
          p_status: string
        }
        Returns: undefined
      }
      place_auction_bid: {
        Args: {
          p_amount: number
          p_bidder_name: string
          p_contact_id: string
          p_session_id: string
        }
        Returns: Json
      }
      process_purchase_adjustment: {
        Args: {
          p_adjustment_date?: string
          p_lot_id: string
          p_new_rate: number
          p_organization_id: string
          p_reason: string
        }
        Returns: Json
      }
      process_purchase_return: {
        Args: {
          p_lot_id: string
          p_organization_id: string
          p_qty: number
          p_rate: number
          p_remarks: string
          p_return_date?: string
        }
        Returns: Json
      }
      process_sale_return_transaction: {
        Args: { p_return_id: string }
        Returns: Json
      }
      receive_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_mode: string
          p_organization_id: string
          p_party_id: string
          p_remarks: string
        }
        Returns: Json
      }
      record_advance_payment: {
        Args: {
          p_amount?: number
          p_contact_id: string
          p_date?: string
          p_lot_id?: string
          p_narration?: string
          p_organization_id: string
          p_payment_mode?: string
        }
        Returns: Json
      }
      record_inventory_wastage: {
        Args: {
          p_image_url?: string
          p_item_id: string
          p_lot_id: string
          p_organization_id: string
          p_quantity_crates: number
          p_quantity_kg: number
          p_reason: string
        }
        Returns: Json
      }
      record_lot_damage: {
        Args: {
          p_damage_date?: string
          p_lot_id: string
          p_organization_id: string
          p_qty: number
          p_reason: string
        }
        Returns: Json
      }
      refresh_org_join_code: { Args: { p_org_id: string }; Returns: string }
      run_dunning_process: {
        Args: never
        Returns: {
          suspended_orgs_count: number
          total_overdue_amount: number
        }[]
      }
      search_organizations: {
        Args: { search_text: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      seed_arrivals_field_configs: { Args: never; Returns: undefined }
      seed_arrivals_for_org: { Args: { p_org_id: string }; Returns: undefined }
      seed_default_field_configs: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      seed_organization_accounts: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      seed_storage_field_config: { Args: never; Returns: undefined }
      set_opening_balance: {
        Args: {
          p_account_id: string
          p_amount: number
          p_organization_id: string
          p_type: string
        }
        Returns: Json
      }
      sync_daily_commodity_rates: {
        Args: { p_org_id: string }
        Returns: number
      }
      toggle_feature_flag: {
        Args: { p_flag_id: string; p_status: boolean }
        Returns: undefined
      }
      toggle_organization_status: {
        Args: { new_status: boolean; org_id: string }
        Returns: undefined
      }
      transfer_stock_v2: {
        Args: {
          p_from_location: string
          p_lot_id: string
          p_organization_id: string
          p_qty: number
          p_to_location: string
        }
        Returns: undefined
      }
      urlencode: { Args: { v: string }; Returns: string }
    }
    Enums: {
      invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible"
      subscription_status: "active" | "past_due" | "canceled" | "trialing"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  wholesale: {
    Tables: {
      contacts: {
        Row: {
          company_name: string | null
          contact_type: string | null
          gstin: string | null
          id: string
          name: string
          organization_id: string | null
          state_code: string | null
        }
        Insert: {
          company_name?: string | null
          contact_type?: string | null
          gstin?: string | null
          id?: string
          name: string
          organization_id?: string | null
          state_code?: string | null
        }
        Update: {
          company_name?: string | null
          contact_type?: string | null
          gstin?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          state_code?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          batch_number: string | null
          expiry_date: string | null
          id: string
          organization_id: string | null
          quantity: number
          sku_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          organization_id?: string | null
          quantity: number
          sku_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          organization_id?: string | null
          quantity?: number
          sku_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku_master"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cgst_amount: number | null
          id: string
          igst_amount: number | null
          inventory_id: string | null
          invoice_id: string | null
          quantity: number
          sgst_amount: number | null
          taxable_value: number | null
          total_price: number | null
          unit_price: number
        }
        Insert: {
          cgst_amount?: number | null
          id?: string
          igst_amount?: number | null
          inventory_id?: string | null
          invoice_id?: string | null
          quantity: number
          sgst_amount?: number | null
          taxable_value?: number | null
          total_price?: number | null
          unit_price: number
        }
        Update: {
          cgst_amount?: number | null
          id?: string
          igst_amount?: number | null
          inventory_id?: string | null
          invoice_id?: string | null
          quantity?: number
          sgst_amount?: number | null
          taxable_value?: number | null
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_id: string | null
          grand_total: number | null
          id: string
          invoice_date: string | null
          invoice_number: string
          organization_id: string | null
          place_of_supply: string | null
          status: string | null
          subtotal: number | null
          tax_total: number | null
        }
        Insert: {
          buyer_id?: string | null
          grand_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number: string
          organization_id?: string | null
          place_of_supply?: string | null
          status?: string | null
          subtotal?: number | null
          tax_total?: number | null
        }
        Update: {
          buyer_id?: string | null
          grand_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string
          organization_id?: string | null
          place_of_supply?: string | null
          status?: string | null
          subtotal?: number | null
          tax_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          order_date: string | null
          organization_id: string | null
          po_number: string
          status: string | null
          supplier_id: string | null
        }
        Insert: {
          id?: string
          order_date?: string | null
          organization_id?: string | null
          po_number: string
          status?: string | null
          supplier_id?: string | null
        }
        Update: {
          id?: string
          order_date?: string | null
          organization_id?: string | null
          po_number?: string
          status?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sku_master: {
        Row: {
          brand: string | null
          category: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          is_gst_exempt: boolean | null
          name: string
          organization_id: string | null
          sku_code: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          is_gst_exempt?: boolean | null
          name: string
          organization_id?: string | null
          sku_code: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          is_gst_exempt?: boolean | null
          name?: string
          organization_id?: string | null
          sku_code?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  core: {
    Enums: {},
  },
  mandi: {
    Enums: {},
  },
  public: {
    Enums: {
      invoice_status: ["draft", "open", "paid", "void", "uncollectible"],
      subscription_status: ["active", "past_due", "canceled", "trialing"],
    },
  },
  wholesale: {
    Enums: {},
  },
} as const
