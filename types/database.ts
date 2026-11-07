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
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          phone: string;
          pending_photo_path: string | null;
          pending_photo_at: string | null;
          updated_at: string;
          pending_action: string | null;
          pending_action_at: string | null;
          pending_offer: Json | null;
          pending_offer_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]> & { phone: string };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>;
        Relationships: [];
      };
      shops: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string | null;
          city: string | null;
          phone: string | null;
          logo_path: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["shops"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["shops"]["Row"]>;
        Relationships: [];
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
        Insert: Partial<Database["public"]["Tables"]["brand_kits"]["Row"]> & { shop_id: string };
        Update: Partial<Database["public"]["Tables"]["brand_kits"]["Row"]>;
        Relationships: [];
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
          finished_at: string | null;
          started_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["jobs"]["Row"]> & { shop_id: string; input: Json };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
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
          meta: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["outputs"]["Row"]> & { job_id: string; type: string };
        Update: Partial<Database["public"]["Tables"]["outputs"]["Row"]>;
        Relationships: [];
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
        Insert: Partial<Database["public"]["Tables"]["outcomes"]["Row"]> & { output_id: string; shop_id: string };
        Update: Partial<Database["public"]["Tables"]["outcomes"]["Row"]>;
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
        Insert: Partial<Database["public"]["Tables"]["cost_events"]["Row"]> & {
          step: string;
          provider: string;
          cost_paise: number;
        };
        Update: Partial<Database["public"]["Tables"]["cost_events"]["Row"]>;
        Relationships: [];
      };
      usage_ledger: {
        Row: {
          id: number;
          user_id: string;
          delta: number;
          reason: string;
          job_id: string | null;
          created_at: string;
          kind: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["usage_ledger"]["Row"]> & {
          user_id: string;
          delta: number;
          reason: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_ledger"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          razorpay_subscription_id: string;
          plan_tier: "free" | "plus" | "vip";
          status: string;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & {
          user_id: string;
          razorpay_subscription_id: string;
          status: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          purpose: string;
          consultation_id: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          amount_paise: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          user_id: string;
          purpose: string;
          amount_paise: number;
          status: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      processed_messages: {
        Row: {
          wa_message_id: string;
          from_phone: string;
          processed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["processed_messages"]["Row"]> & {
          wa_message_id: string;
          from_phone: string;
        };
        Update: Partial<Database["public"]["Tables"]["processed_messages"]["Row"]>;
        Relationships: [];
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
        Insert: Partial<Database["public"]["Tables"]["consents"]["Row"]> & {
          user_id: string;
          purpose: string;
          policy_version: string;
        };
        Update: Partial<Database["public"]["Tables"]["consents"]["Row"]>;
        Relationships: [];
      };
      deletion_log: {
        Row: {
          id: number;
          from_phone: string;
          requested_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["deletion_log"]["Row"]> & { from_phone: string };
        Update: Partial<Database["public"]["Tables"]["deletion_log"]["Row"]>;
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          event_type: string;
          received_at: string;
          processed: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["webhook_events"]["Row"]> & {
          id: string;
          event_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_events"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]> & { action: string };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record