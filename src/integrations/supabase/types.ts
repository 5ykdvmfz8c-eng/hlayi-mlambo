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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: number
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: number
          summary?: string | null
        }
        Relationships: []
      }
      credit_assessments: {
        Row: {
          assessed_by: string
          assessment_date: string
          bureau_name: string | null
          bureau_reference: string | null
          completed_at: string | null
          consent_date: string
          consent_given: boolean
          consent_method: string
          created_at: string
          credit_score: number | null
          customer_id: string
          existing_debt: number
          id: string
          monthly_debt_obligations: number
          notes: string | null
          payment_history: string | null
          risk_band: Database["public"]["Enums"]["risk_band"] | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          assessed_by?: string
          assessment_date?: string
          bureau_name?: string | null
          bureau_reference?: string | null
          completed_at?: string | null
          consent_date?: string
          consent_given?: boolean
          consent_method?: string
          created_at?: string
          credit_score?: number | null
          customer_id: string
          existing_debt?: number
          id?: string
          monthly_debt_obligations?: number
          notes?: string | null
          payment_history?: string | null
          risk_band?: Database["public"]["Enums"]["risk_band"] | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assessed_by?: string
          assessment_date?: string
          bureau_name?: string | null
          bureau_reference?: string | null
          completed_at?: string | null
          consent_date?: string
          consent_given?: boolean
          consent_method?: string
          created_at?: string
          credit_score?: number | null
          customer_id?: string
          existing_debt?: number
          id?: string
          monthly_debt_obligations?: number
          notes?: string | null
          payment_history?: string | null
          risk_band?: Database["public"]["Enums"]["risk_band"] | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_assessments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_assessments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_settings: {
        Row: {
          default_daily_allowance: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_daily_allowance?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_daily_allowance?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      credit_usage: {
        Row: {
          assessment_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          used_on: string
          user_id: string
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          used_on?: string
          user_id: string
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          used_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "credit_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_private: {
        Row: {
          customer_id: string
          id_number: string
          updated_at: string
        }
        Insert: {
          customer_id: string
          id_number: string
          updated_at?: string
        }
        Update: {
          customer_id?: string
          id_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_private_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_private_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          account_number: string
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          employer: string | null
          employment_status: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          monthly_income: number
          phone: string
          updated_at: string
        }
        Insert: {
          account_number?: string
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employer?: string | null
          employment_status?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          monthly_income?: number
          phone: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          employer?: string | null
          employment_status?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          monthly_income?: number
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      loan_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          credit: number
          customer_id: string
          debit: number
          description: string
          id: string
          loan_id: string
          repayment_id: string | null
          txn_date: string
          txn_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id: string
          debit?: number
          description: string
          id?: string
          loan_id: string
          repayment_id?: string | null
          txn_date: string
          txn_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id?: string
          debit?: number
          description?: string
          id?: string
          loan_id?: string
          repayment_id?: string | null
          txn_date?: string
          txn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_transactions_repayment_id_fkey"
            columns: ["repayment_id"]
            isOneToOne: false
            referencedRelation: "repayments"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          disbursed_at: string | null
          disbursed_by: string | null
          fees: number
          first_payment_date: string
          id: string
          instalment_amount: number
          interest_amount: number
          interest_rate: number
          issue_date: string
          loan_reference: string
          maturity_date: string | null
          notes: string | null
          number_of_instalments: number
          outstanding_balance: number
          principal: number
          purpose: string | null
          repayment_frequency: Database["public"]["Enums"]["repayment_frequency"]
          status: Database["public"]["Enums"]["loan_status"]
          total_repayable: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id: string
          disbursed_at?: string | null
          disbursed_by?: string | null
          fees?: number
          first_payment_date: string
          id?: string
          instalment_amount?: number
          interest_amount?: number
          interest_rate?: number
          issue_date?: string
          loan_reference?: string
          maturity_date?: string | null
          notes?: string | null
          number_of_instalments: number
          outstanding_balance?: number
          principal: number
          purpose?: string | null
          repayment_frequency?: Database["public"]["Enums"]["repayment_frequency"]
          status?: Database["public"]["Enums"]["loan_status"]
          total_repayable?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          disbursed_at?: string | null
          disbursed_by?: string | null
          fees?: number
          first_payment_date?: string
          id?: string
          instalment_amount?: number
          interest_amount?: number
          interest_rate?: number
          issue_date?: string
          loan_reference?: string
          maturity_date?: string | null
          notes?: string | null
          number_of_instalments?: number
          outstanding_balance?: number
          principal?: number
          purpose?: string | null
          repayment_frequency?: Database["public"]["Enums"]["repayment_frequency"]
          status?: Database["public"]["Enums"]["loan_status"]
          total_repayable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          link: string | null
          message: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          link?: string | null
          message: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          link?: string | null
          message?: string
          title?: string
          type?: string
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
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      repayments: {
        Row: {
          amount: number
          captured_by: string
          created_at: string
          customer_id: string
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          payment_method: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: string
          transaction_reference: string
        }
        Insert: {
          amount: number
          captured_by?: string
          created_at?: string
          customer_id: string
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          transaction_reference: string
        }
        Update: {
          amount?: number
          captured_by?: string
          created_at?: string
          customer_id?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: string
          transaction_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "repayments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_credit_limits: {
        Row: {
          daily_allowance: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          daily_allowance: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          daily_allowance?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_credit_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statements: {
        Row: {
          closing_balance: number
          customer_id: string
          generated_at: string
          generated_by: string
          id: string
          loan_id: string | null
          opening_balance: number
          period_end: string
          period_start: string
          statement_number: string
          total_credits: number
          total_debits: number
        }
        Insert: {
          closing_balance: number
          customer_id: string
          generated_at?: string
          generated_by: string
          id?: string
          loan_id?: string | null
          opening_balance: number
          period_end: string
          period_start: string
          statement_number?: string
          total_credits: number
          total_debits: number
        }
        Update: {
          closing_balance?: number
          customer_id?: string
          generated_at?: string
          generated_by?: string
          id?: string
          loan_id?: string | null
          opening_balance?: number
          period_end?: string
          period_start?: string
          statement_number?: string
          total_credits?: number
          total_debits?: number
        }
        Relationships: [
          {
            foreignKeyName: "statements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_overview: {
        Row: {
          account_number: string | null
          active_loans: number | null
          address: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          employer: string | null
          employment_status: string | null
          first_name: string | null
          id: string | null
          job_title: string | null
          last_name: string | null
          latest_risk_band: Database["public"]["Enums"]["risk_band"] | null
          latest_score: number | null
          loan_count: number | null
          monthly_income: number | null
          outstanding_balance: number | null
          overdue_loans: number | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          active_loans?: never
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          employer?: string | null
          employment_status?: string | null
          first_name?: string | null
          id?: string | null
          job_title?: string | null
          last_name?: string | null
          latest_risk_band?: never
          latest_score?: never
          loan_count?: never
          monthly_income?: number | null
          outstanding_balance?: never
          overdue_loans?: never
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          active_loans?: never
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          employer?: string | null
          employment_status?: string | null
          first_name?: string | null
          id?: string | null
          job_title?: string | null
          last_name?: string | null
          latest_risk_band?: never
          latest_score?: never
          loan_count?: never
          monthly_income?: number | null
          outstanding_balance?: never
          overdue_loans?: never
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      loan_summary: {
        Row: {
          account_number: string | null
          amount_paid: number | null
          approved_at: string | null
          approved_by: string | null
          arrears_amount: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          fees: number | null
          first_name: string | null
          first_payment_date: string | null
          id: string | null
          instalment_amount: number | null
          interest_amount: number | null
          interest_rate: number | null
          issue_date: string | null
          last_name: string | null
          loan_reference: string | null
          maturity_date: string | null
          next_due_amount: number | null
          next_due_date: string | null
          notes: string | null
          number_of_instalments: number | null
          outstanding_balance: number | null
          principal: number | null
          purpose: string | null
          repayment_frequency:
            | Database["public"]["Enums"]["repayment_frequency"]
            | null
          status: Database["public"]["Enums"]["loan_status"] | null
          total_repayable: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_credit: { Args: { _user_id: string }; Returns: boolean }
      can_finance: { Args: { _user_id: string }; Returns: boolean }
      can_manage: { Args: { _user_id: string }; Returns: boolean }
      change_loan_status: {
        Args: { _action: string; _loan_id: string; _reason?: string }
        Returns: undefined
      }
      compute_risk_band: {
        Args: { _score: number }
        Returns: Database["public"]["Enums"]["risk_band"]
      }
      create_customer: { Args: { _data: Json }; Returns: string }
      credit_allowance_for: { Args: { _user_id: string }; Returns: number }
      dashboard_stats: { Args: never; Returns: Json }
      generate_statement: {
        Args: {
          _customer_id: string
          _end: string
          _loan_id: string
          _start: string
        }
        Returns: string
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instalment_due_date: {
        Args: {
          _first: string
          _freq: Database["public"]["Enums"]["repayment_frequency"]
          _k: number
        }
        Returns: string
      }
      is_active_staff: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_valid_sa_id: { Args: { _id: string }; Returns: boolean }
      loan_expected_paid: {
        Args: {
          _as_of: string
          _first: string
          _freq: Database["public"]["Enums"]["repayment_frequency"]
          _inst: number
          _n: number
          _total: number
        }
        Returns: number
      }
      loan_next_due_index: {
        Args: { _inst: number; _n: number; _paid: number }
        Returns: number
      }
      log_event: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _summary: string
        }
        Returns: undefined
      }
      my_credit_status: { Args: never; Returns: Json }
      recompute_loan: { Args: { _loan_id: string }; Returns: undefined }
      refresh_loan_statuses: { Args: never; Returns: number }
      reverse_repayment: {
        Args: { _reason: string; _repayment_id: string }
        Returns: undefined
      }
      sa_today: { Args: never; Returns: string }
      staff_credit_overview: {
        Args: never
        Returns: {
          daily_allowance: number
          email: string
          full_name: string
          is_active: boolean
          is_custom: boolean
          role: Database["public"]["Enums"]["app_role"]
          used_today: number
          user_id: string
        }[]
      }
      update_customer: {
        Args: { _data: Json; _id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "supervisor"
        | "credit_officer"
        | "finance_officer"
      loan_status:
        | "pending"
        | "approved"
        | "active"
        | "partially_paid"
        | "fully_paid"
        | "overdue"
        | "cancelled"
      repayment_frequency: "weekly" | "fortnightly" | "monthly"
      risk_band: "excellent" | "good" | "fair" | "poor" | "high_risk"
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
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "supervisor",
        "credit_officer",
        "finance_officer",
      ],
      loan_status: [
        "pending",
        "approved",
        "active",
        "partially_paid",
        "fully_paid",
        "overdue",
        "cancelled",
      ],
      repayment_frequency: ["weekly", "fortnightly", "monthly"],
      risk_band: ["excellent", "good", "fair", "poor", "high_risk"],
    },
  },
} as const
