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
      admin_settings: {
        Row: {
          access_password: string
          contact_qq: string
          contact_wechat: string
          id: number
          system_prompt: string
          updated_at: string
        }
        Insert: {
          access_password?: string
          contact_qq?: string
          contact_wechat?: string
          id?: number
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          access_password?: string
          contact_qq?: string
          contact_wechat?: string
          id?: number
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          link_url: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          is_pinned: boolean
          is_published: boolean
          link_label: string | null
          link_url: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          link_label?: string | null
          link_url?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          link_label?: string | null
          link_url?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      case_comments: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_comments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "inspiration_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_favorites: {
        Row: {
          case_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_favorites_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "inspiration_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_likes: {
        Row: {
          case_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_likes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "inspiration_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_used: boolean
          used_at: string | null
          used_by: string | null
          used_by_email: string | null
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
          used_by_email?: string | null
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_used?: boolean
          used_at?: string | null
          used_by?: string | null
          used_by_email?: string | null
        }
        Relationships: []
      }
      credit_usage_logs: {
        Row: {
          amount: number
          created_at: string
          generation_history_id: string | null
          generation_task_id: string | null
          id: string
          idempotency_key: string
          metadata: Json | null
          model_key: string | null
          model_name: string | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          generation_history_id?: string | null
          generation_task_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json | null
          model_key?: string | null
          model_name?: string | null
          source: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          generation_history_id?: string | null
          generation_task_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          model_key?: string | null
          model_name?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      generation_history: {
        Row: {
          cost: number
          created_at: string
          generation_task_id: string | null
          id: string
          image_url: string | null
          model: string
          prompt: string | null
          user_id: string
        }
        Insert: {
          cost?: number
          created_at?: string
          generation_task_id?: string | null
          id?: string
          image_url?: string | null
          model: string
          prompt?: string | null
          user_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          generation_task_id?: string | null
          id?: string
          image_url?: string | null
          model?: string
          prompt?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generation_tasks: {
        Row: {
          charged_at: string | null
          completed_at: string | null
          created_at: string
          credits_required: number
          deduction_id: string | null
          deduction_status: string
          error_code: string | null
          error_message: string | null
          id: string
          input_params: Json
          model_id: string
          prompt: string | null
          refunded_at: string | null
          request_id: string
          result_image_url: string | null
          result_payload: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charged_at?: string | null
          completed_at?: string | null
          created_at?: string
          credits_required?: number
          deduction_id?: string | null
          deduction_status?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_params?: Json
          model_id: string
          prompt?: string | null
          refunded_at?: string | null
          request_id: string
          result_image_url?: string | null
          result_payload?: Json | null
          started_at?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charged_at?: string | null
          completed_at?: string | null
          created_at?: string
          credits_required?: number
          deduction_id?: string | null
          deduction_status?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_params?: Json
          model_id?: string
          prompt?: string | null
          refunded_at?: string | null
          request_id?: string
          result_image_url?: string | null
          result_payload?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      global_config: {
        Row: {
          base_url: string
          global_api_key: string | null
          id: number
          updated_at: string
        }
        Insert: {
          base_url?: string
          global_api_key?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          base_url?: string
          global_api_key?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      inspiration_cases: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          favorites_count: number
          id: string
          image_url: string
          is_published: boolean
          likes_count: number
          model_key: string | null
          model_name: string | null
          prompt: string
          size: string | null
          style_id: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          favorites_count?: number
          id?: string
          image_url: string
          is_published?: boolean
          likes_count?: number
          model_key?: string | null
          model_name?: string | null
          prompt?: string
          size?: string | null
          style_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          favorites_count?: number
          id?: string
          image_url?: string
          is_published?: boolean
          likes_count?: number
          model_key?: string | null
          model_name?: string | null
          prompt?: string
          size?: string | null
          style_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: []
      }
      models_config: {
        Row: {
          api_key: string | null
          api_url: string | null
          cost: number
          created_at: string
          description: string | null
          extra_params: Json
          fetch_url: string | null
          id: string
          is_enabled: boolean
          model_key: string
          name: string
          prompt_key: string
          request_format: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          extra_params?: Json
          fetch_url?: string | null
          id?: string
          is_enabled?: boolean
          model_key: string
          name: string
          prompt_key?: string
          request_format?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          extra_params?: Json
          fetch_url?: string | null
          id?: string
          is_enabled?: boolean
          model_key?: string
          name?: string
          prompt_key?: string
          request_format?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits: number
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recharge_packages: {
        Row: {
          badge_text: string | null
          button_text: string
          created_at: string
          credits: number
          features: Json
          highlighted: boolean
          id: string
          is_popular: boolean
          is_visible: boolean
          price: string
          purchase_url: string | null
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          button_text?: string
          created_at?: string
          credits?: number
          features?: Json
          highlighted?: boolean
          id?: string
          is_popular?: boolean
          is_visible?: boolean
          price: string
          purchase_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          button_text?: string
          created_at?: string
          credits?: number
          features?: Json
          highlighted?: boolean
          id?: string
          is_popular?: boolean
          is_visible?: boolean
          price?: string
          purchase_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      redeem_logs: {
        Row: {
          amount: number
          code: string
          error_message: string | null
          id: string
          redeemed_at: string
          success: boolean
          user_id: string
        }
        Insert: {
          amount?: number
          code: string
          error_message?: string | null
          id?: string
          redeemed_at?: string
          success?: boolean
          user_id: string
        }
        Update: {
          amount?: number
          code?: string
          error_message?: string | null
          id?: string
          redeemed_at?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      style_templates: {
        Row: {
          id: string
          image_url: string | null
          name: string
          prompt: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          id: string
          image_url?: string | null
          name: string
          prompt?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          id?: string
          image_url?: string | null
          name?: string
          prompt?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_orders: {
        Row: {
          amount: number
          created_at: string
          credits: number
          id: string
          out_trade_no: string
          paid_at: string | null
          pay_type: string | null
          status: string
          trade_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits?: number
          id?: string
          out_trade_no: string
          paid_at?: string | null
          pay_type?: string | null
          status?: string
          trade_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number
          id?: string
          out_trade_no?: string
          paid_at?: string | null
          pay_type?: string | null
          status?: string
          trade_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      admin_credit_usage_totals: {
        Args: never
        Returns: {
          total_spent: number
          user_id: string
        }[]
      }
      complete_paid_order: {
        Args: { _out_trade_no: string; _trade_no: string }
        Returns: {
          applied: boolean
          credits: number
          user_id: string
        }[]
      }
      consume_credits_for_generation: {
        Args: { _model_key: string; _prompt: string }
        Returns: {
          cost: number
          credits: number
          message: string
          success: boolean
        }[]
      }
      consume_credits_for_generation_v2: {
        Args: { _model_key: string; _prompt: string }
        Returns: {
          cost: number
          credits: number
          history_id: string | null
          message: string
          success: boolean
        }[]
      }
      finalize_generation_task_once: {
        Args: { p_image_url: string; p_task_id: string }
        Returns: {
          cost: number
          credits: number
          deduction_status: string
          history_id: string
          message: string
          status: string
          success: boolean
          task_id: string
        }[]
      }
      finalize_user_generation_task_once: {
        Args: { p_image_url: string; p_task_id: string }
        Returns: {
          cost: number
          credits: number
          deduction_status: string
          history_id: string
          message: string
          status: string
          success: boolean
          task_id: string
        }[]
      }
      get_contact_info: {
        Args: never
        Returns: {
          contact_qq: string
          contact_wechat: string
        }[]
      }
      has_admin_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_case_view: { Args: { _case_id: string }; Returns: undefined }
      redeem_coupon: {
        Args: { _code: string }
        Returns: {
          amount: number
          message: string
          success: boolean
        }[]
      }
      redeem_gift_card: {
        Args: { input_code: string }
        Returns: {
          amount: number
          message: string
          success: boolean
        }[]
      }
      set_latest_history_image: {
        Args: { _image_url: string; _model: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "founder"
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
      app_role: ["admin", "user", "founder"],
    },
  },
} as const
