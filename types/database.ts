import type { ShopCategory } from "@/types/domain";

// Supabase schema के TypeScript types (migrations 0001–0009 से मेल खाते हुए)
// अगर remote schema बदले, तो `npx supabase gen types typescript ...` से फिर से generate करें।
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string | null;
          city: string | null;
          language_pref: string;
          created_at: string;
        };
        Insert: {
          id: string;
          phone?: string | null;
          city?: string | null;
          language_pref?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string | null;
          city?: string | null;
          language_pref?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      shops: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: ShopCategory;
          city: string;
          phone: string | null;
          logo_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category: ShopCategory;
          city: string;
          phone?: string | null;
          logo_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: ShopCategory;
          city?: string;
          phone?: string | null;
          logo_path?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shops_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      brand_kits: {
        Row: {
          shop_id: string;
          primary_color: string | null;
          secondary_color: string | null;
          font_key: string | null;
          tagline: string | null;
          updated_at: string;
        };
        Insert: {
          shop_id: string;
          primary_color?: string | null;
          secondary_color?: string | null;
          font_key?: string | null;
          tagline?: string | null;
          updated_at?: string;
        };
        Update: {
          shop_id?: string;
          primary_color?: string | null;
          secondary_color?: string | null;
          font_key?: string | null;
          tagline?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_kits_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: true;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };

      jobs: {
        Row: {
          id: string;
          shop_id: string;
          status: string;
          input: Json;
          attempts: number;
          cost_paise: number;
          error: string | null;
          created_at: string;
          started_at: string | null; // migration 0008
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          shop_id: string;
          status?: string;
          input?: Json;
          attempts?: number;
          cost_paise?: number;
          error?: string | null;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          shop_id?: string;
          status?: string;
          input?: Json;
          attempts?: number;
          cost_paise?: number;
          error?: string | null;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };

      outputs: {
        Row: {
          id: string;
          job_id: string;
          type: string;
          storage_path: string | null;
          content: string | null;
          watermarked: boolean;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          type: string;
          storage_path?: string | null;
          content?: string | null;
          watermarked?: boolean;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          type?: string;
          storage_path?: string | null;
          content?: string | null;
          watermarked?: boolean;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outputs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };

      usage_ledger: {
        Row: {
          id: number;
          user_id: string;
          delta: number;
          reason: string;
          job_id: string | null;
          created_at: string;
          kind: string | null; // migration 0004: 'poster' | 'reel'
        };
        Insert: {
          id?: number;
          user_id: string;
          delta: number;
          reason: string;
          job_id?: string | null;
          created_at?: string;
          kind?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          delta?: number;
          reason?: string;
          job_id?: string | null;
          created_at?: string;
          kind?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "usage_ledger_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_ledger_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          status: string;
          razorpay_sub_id: string | null;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan: string;
          status?: string;
          razorpay_sub_id?: string | null;
          current_period_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan?: string;
          status?: string;
          razorpay_sub_id?: string | null;
          current_period_end?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      consents: {
        Row: {
          id: number;
          user_id: string;
          purpose: string;
          policy_version: string;
          granted_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          purpose: string;
          policy_version: string;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          purpose?: string;
          policy_version?: string;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };

      outcomes: {
        Row: {
          id: string;
          output_id: string;
          shop_id: string;
          rating: number | null;
          calls_count: number | null;
          inquiries_count: number | null;
          footfall_note: string | null;
          reported_at: string;
        };
        Insert: {
          id?: string;
          output_id: string;
          shop_id: string;
          rating?: number | null;
          calls_count?: number | null;
          inquiries_count?: number | null;
          footfall_note?: string | null;
          reported_at?: string;
        };
        Update: {
          id?: string;
          output_id?: string;
          shop_id?: string;
          rating?: number | null;
          calls_count?: number | null;
          inquiries_count?: number | null;
          footfall_note?: string | null;
          reported_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outcomes_output_id_fkey";
            columns: ["output_id"];
            isOneToOne: false;
            referencedRelation: "outputs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outcomes_shop_id_fkey";
            columns: ["shop_id"];
            isOneToOne: false;
            referencedRelation: "shops";
            referencedColumns: ["id"];
          },
        ];
      };

      processed_messages: {
        Row: {
          wa_message_id: string;
          from_phone: string;
          processed_at: string;
        };
        Insert: {
          wa_message_id: string;
          from_phone: string;
          processed_at?: string;
        };
        Update: {
          wa_message_id?: string;
          from_phone?: string;
          processed_at?: string;
        };
        Relationships: [];
      };

      cost_events: {
        Row: {
          id: number;
          job_id: string | null;
          step: string;
          provider: string;
          model: string | null;
          cost_paise: number;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          job_id?: string | null;
          step: string;
          provider: string;
          model?: string | null;
          cost_paise: number;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          job_id?: string | null;
          step?: string;
          provider?: string;
          model?: string | null;
          cost_paise?: number;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };

      conversations: {
        Row: {
          phone: string;
          pending_photo_path: string | null;
          pending_photo_at: string | null;
          pending_action: string | null; // migration 0009 (जैसे "erase")
          pending_action_at: string | null; // migration 0009
          updated_at: string;
        };
        Insert: {
          phone: string;
          pending_photo_path?: string | null;
          pending_photo_at?: string | null;
          pending_action?: string | null;
          pending_action_at?: string | null;
          updated_at?: string;
        };
        Update: {
          phone?: string;
          pending_photo_path?: string | null;
          pending_photo_at?: string | null;
          pending_action?: string | null;
          pending_action_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      deletion_log: {
        Row: {
          id: number;
          phone: string; // सिर्फ phone और समय, कोई और निजी डेटा नहीं (migration 0009)
          deleted_at: string;
        };
        Insert: {
          id?: number;
          phone: string;
          deleted_at?: string;
        };
        Update: {
          id?: number;
          phone?: string;
          deleted_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      credit_used: {
        Args: { p_user: string; p_kind: string; p_since: string };
        Returns: number;
      };
      reserve_credits: {
        Args: {
          p_user: string;
          p_job: string;
          p_poster_need: number;
          p_reel_need: number;
          p_poster_limit: number;
          p_reel_limit: number;
          p_since: string;
        };
        Returns: Json;
      };
      refund_job_credits: {
        Args: { p_job: string };
        Returns: number;
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};