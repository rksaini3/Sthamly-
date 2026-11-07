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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          phone: string;
          state?: string;
          context?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          phone?: string;
          state?: string;
          context?: Json | null;
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
          razorpay_