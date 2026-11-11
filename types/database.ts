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
          role: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator" | "finance";
          full_name: string | null;
          phone: string | null;
          city: string | null;
          language: string | null;
          plan: "free" | "plus" | "vip" | "starter" | "premium" | "business";
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          role?: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator" | "finance";
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          language?: string | null;
          plan?: "free" | "plus" | "vip" | "starter" | "premium" | "business";
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          role?: "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator" | "finance";
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          language?: string | null;
          plan?: "free" | "plus" | "vip" | "starter" | "premium" | "business";
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
          category: "salon" | "general" | "kirana" | "clothing" | "mobile" | "clinic" | "coaching";
          city: string;
          phone: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: "salon" | "general" | "kirana" | "clothing" | "mobile" | "clinic" | "coaching";
          city: string;
          phone?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: "salon" | "general" | "kirana" | "clothing" | "mobile" | "clinic" | "coaching";
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

      batches: {
        Row: {
          id: string;
          user_id: string;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          total: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          total?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      jobs: {
        Row: {
          id: string;
          shop_id: string;
          batch_id: string | null;
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
          batch_id?: string | null;
          status?: "queued" | "running" | "done" | "failed";
          input?: Json;
          attempts?: number;
          error?: string | null;
          cost_paise?: number | null;
          started_at?: string | null;