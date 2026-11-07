export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator";
          full_name: string | null;
          phone: string | null;
          city: string | null;
          language: string | null;
          plan: "free" | "plus" | "vip";
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          role?: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator";
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          language?: string | null;
          plan?: "free" | "plus" | "vip";
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          role?: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator";
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          language?: string | null;
          plan?: "free" | "plus" | "vip";
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };

      conversations: {
        Row: {
          id: string;
          user_id: string | null;
          phone: string;
          state: string;
          context: Json | null;
          pending_photo_path: string | null;
          pending_photo_at: string | null;
          pending_offer: Json | null;
          pending_offer_at: string | null;
          pending_action: string | null;
          pending_action_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          phone: string;
          state?: string;
          context?: Json | null;
          pending_photo_path?: string | null;
          pending_photo_at?: string | null;
          pending_offer?: Json | null;
          pending_offer_at?: string | null;
          pending_action?: string | null;
          pending_action_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          phone?: string;
          state?: string;
          context?: Json | null;
          pending_photo_path?: string | null;
          pending_photo_at?: string | null;
          pending_offer?: Json | null;
          pending_offer_at?: string | null;
          pending_action?: string | null;
          pending_action_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      shops: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: "sweets" | "salon" | "coaching_clinic";
          city: string;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: "sweets" | "salon" | "coaching_clinic";
          city: string;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: "sweets" | "salon" | "coaching_clinic";
          city?: string;
          phone?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      brand_kits: {
        Row: {
          id: string;
          shop_id: string;
          primary_color: string | null;
          logo_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          primary_color?: string | null;
          logo_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          primary_color?: string | null;
          logo_path?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      jobs: {
        Row: {
          id: string;
          shop_id: string;
          status: "queued" | "running" | "done" | "failed";
          input: Json;
          attempts: number;
          error: string | null;
          cost_paise: number | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          shop_id: string;
          status?: "queued" | "running" | "done" | "failed";
          input?: Json;
          attempts?: number;
          error?: string | null;
          cost_paise?: number | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          shop_id?: string;
          status?: "queued" | "running" | "done" | "failed";
          input?: Json;
          attempts?: number;
          error?: string | null;
          cost_paise?: number | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };

      outputs: {
        Row: {
          id: string;
          job_id: string;
          type: string;
          storage_path: string | null;
          content: string | null;
          watermarked: boolean;
          published: boolean;
          published_at: string | null;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          type: string;
          storage_path?: string | null;
          content?: string | null;
          watermarked?: boolean;
          published?: boolean;
          published_at?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          type?: string;
          storage_path?: string | null;
          content?: string | null;
          watermarked?: boolean;
          published?: boolean;
          published_at?: string | null;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      outcomes: {
        Row: {
          id: string;
          job_id: string | null;
          kind: string;
          value: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id?: string | null;
          kind: string;
          value?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string | null;
          kind?: string;
          value?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      cost_events: {
        Row: {
          id: string;
          job_id: string | null;
          step: string;
          provider: string;
          model: string | null;
          cost_paise: number;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id?: string | null;
          step: string;
          provider: string;
          model?: string | null;
          cost_paise: number;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string | null;
          step?: string;
          provider?: string;
          model?: string | null;
          cost_paise?: number;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      usage_ledger: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          reason: string;
          delta: number;
          job_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          reason: string;
          delta: number;
          job_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          reason?: string;
          delta?: number;
          job_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_tier: "free" | "plus" | "vip";
          razorpay_subscription_id: string;
          status: string;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_tier: "free" | "plus" | "vip";
          razorpay_subscription_id: string;
          status: string;
          current_period_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_tier?: "free" | "plus" | "vip";
          razorpay_subscription_id?: string;
          status?: string;
          current_period_end?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      payments: {
        Row: {
          id: string;
          user_id: string;
          amount_paise: number;
          status: string;
          provider_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount_paise: number;
          status: string;
          provider_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount_paise?: number;
          status?: string;
          provider_ref?: string | null;
          created_at?: string;
        };
        Relationships: [];
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

      consents: {
        Row: {
          id: string;
          user_id: string;
          purpose: string;
          policy_version: string;
          granted_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          purpose: string;
          policy_version: string;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          purpose?: string;
          policy_version?: string;
          granted_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };

      deletion_log: {
        Row: {
          id: string;
          from_phone: string;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_phone: string;
          completed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_phone?: string;
          completed_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      webhook_events: {
        Row: {
          id: string;
          provider: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          meta: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          meta?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          meta?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };

      announcements: {
        Row: {
          id: string;
          user_id: string;
          shop_name: string;
          body: string;
          status: "published" | "hidden";
          reports: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          shop_name: string;
          body: string;
          status?: "published" | "hidden";
          reports?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          shop_name?: string;
          body?: string;
          status?: "published" | "hidden";
          reports?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      announcement_comments: {
        Row: {
          id: string;
          announcement_id: string;
          user_id: string;
          author_name: string;
          body: string;
          status: string;
          reports: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          user_id: string;
          author_name: string;
          body: string;
          status?: string;
          reports?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          user_id?: string;
          author_name?: string;
          body?: string;
          status?: string;
          reports?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {};

    Functions: {
      credit_used: {
        Args: { p_user: string; p_kind: string; p_since: string };
        Returns: number;
      };
      reserve_credits: {
        Args: {
          p_user: string;
          p_job: string;
          p_since: string;
          p_poster_need: number;
          p_reel_need: number;
          p_poster_limit: number;
          p_reel_limit: number;
        };
        Returns: Json;
      };
      refund_job_credits: {
        Args: { p_job: string };
        Returns: undefined;
      };
      report_announcement: {
        Args: { p_id: string };
        Returns: undefined;
      };
      report_comment: {
        Args: { p_id: string };
        Returns: undefined;
      };
    };

    Enums: {};
    CompositeTypes: {};
  };
};