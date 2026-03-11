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
      ad_templates: {
        Row: {
          brand_id: string
          created_at: string | null
          id: string
          image_url: string
          name: string
          storage_path: string | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          id?: string
          image_url: string
          name: string
          storage_path?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          id?: string
          image_url?: string
          name?: string
          storage_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_history: {
        Row: {
          created_at: string | null
          id: string
          results: Json
          tiktok_url: string
          user_id: string | null
          variant_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          results: Json
          tiktok_url: string
          user_id?: string | null
          variant_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          results?: Json
          tiktok_url?: string
          user_id?: string | null
          variant_count?: number | null
        }
        Relationships: []
      }
      bof_video_batches: {
        Row: {
          created_at: string | null
          id: string
          metadata_json: Json | null
          product_image_url: string
          product_name: string
          selected_formats: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata_json?: Json | null
          product_image_url: string
          product_name: string
          selected_formats?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata_json?: Json | null
          product_image_url?: string
          product_name?: string
          selected_formats?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      bof_video_variants: {
        Row: {
          batch_id: string
          created_at: string | null
          error_message: string | null
          final_video_url: string | null
          format_id: string
          generated_image_url: string | null
          id: string
          raw_video_url: string | null
          script_text: string | null
          status: string
          user_id: string
          visual_prompt: string | null
          voice_audio_url: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          error_message?: string | null
          final_video_url?: string | null
          format_id: string
          generated_image_url?: string | null
          id?: string
          raw_video_url?: string | null
          script_text?: string | null
          status?: string
          user_id: string
          visual_prompt?: string | null
          voice_audio_url?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          error_message?: string | null
          final_video_url?: string | null
          format_id?: string
          generated_image_url?: string | null
          id?: string
          raw_video_url?: string | null
          script_text?: string | null
          status?: string
          user_id?: string
          visual_prompt?: string | null
          voice_audio_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bof_video_variants_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "bof_video_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          brand_id: string
          category: string
          created_at: string | null
          id: string
          image_url: string
          name: string
          storage_path: string | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          category?: string
          created_at?: string | null
          id?: string
          image_url: string
          name: string
          storage_path?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          category?: string
          created_at?: string | null
          id?: string
          image_url?: string
          name?: string
          storage_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_intelligence: string | null
          colors: Json | null
          created_at: string | null
          description: string | null
          fonts: Json | null
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          brand_intelligence?: string | null
          colors?: Json | null
          created_at?: string | null
          description?: string | null
          fonts?: Json | null
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          brand_intelligence?: string | null
          colors?: Json | null
          created_at?: string | null
          description?: string | null
          fonts?: Json | null
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      broll_lab_history: {
        Row: {
          analysis: Json | null
          created_at: string | null
          id: string
          inputs: Json | null
          master_video_urls: Json | null
          product_image_url: string
          product_url: string | null
          scenes: Json | null
          tiktok_urls: Json | null
          user_id: string
          variant_count: number | null
          voice_variants: Json | null
        }
        Insert: {
          analysis?: Json | null
          created_at?: string | null
          id?: string
          inputs?: Json | null
          master_video_urls?: Json | null
          product_image_url: string
          product_url?: string | null
          scenes?: Json | null
          tiktok_urls?: Json | null
          user_id: string
          variant_count?: number | null
          voice_variants?: Json | null
        }
        Update: {
          analysis?: Json | null
          created_at?: string | null
          id?: string
          inputs?: Json | null
          master_video_urls?: Json | null
          product_image_url?: string
          product_url?: string | null
          scenes?: Json | null
          tiktok_urls?: Json | null
          user_id?: string
          variant_count?: number | null
          voice_variants?: Json | null
        }
        Relationships: []
      }
      campaign_ads: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          image_url: string | null
          profile_id: string | null
          prompt: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          profile_id?: string | null
          prompt?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          profile_id?: string | null
          prompt?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_ads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          aspect_ratio: string | null
          asset_id: string | null
          brand_id: string
          created_at: string | null
          cta: string | null
          id: string
          name: string
          status: string | null
          template_id: string | null
          user_id: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          asset_id?: string | null
          brand_id: string
          created_at?: string | null
          cta?: string | null
          id?: string
          name: string
          status?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          asset_id?: string | null
          brand_id?: string
          created_at?: string | null
          cta?: string | null
          id?: string
          name?: string
          status?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "ad_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          age_range: string | null
          brand_id: string
          created_at: string | null
          desires: string | null
          id: string
          messaging_angle: Json | null
          name: string
          pain_points: string | null
          user_id: string | null
        }
        Insert: {
          age_range?: string | null
          brand_id: string
          created_at?: string | null
          desires?: string | null
          id?: string
          messaging_angle?: Json | null
          name: string
          pain_points?: string | null
          user_id?: string | null
        }
        Update: {
          age_range?: string | null
          brand_id?: string
          created_at?: string | null
          desires?: string | null
          id?: string
          messaging_angle?: Json | null
          name?: string
          pain_points?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
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
  public: {
    Enums: {},
  },
} as const
