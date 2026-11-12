export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Role = "user" | "practitioner" | "admin" | "shopkeeper" | "student" | "creator" | "finance";
type PlanTier = "free" | "plus" | "vip" | "starter" | "premium" | "business";
type ShopCategory = "salon" | "general" | "kirana" | "clothing" | "mobile" | "clinic" | "coaching";
type JobStatus = "queued" | "running" | "done" | "failed";

// हर टेबल का Insert और Update उसके Row से बनता है।
// Req = वे कॉलम जो नई row बनाते समय देना ज़रूरी हैं। Rel = दूसरी टेबल से रिश्ते।
type Table<Row, Req extends keyof Row = never, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Req>;
  Update: Partial<Row>;
  Relationships: Rel;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          role: Role;
          full_name: string | null;
          phone: string | null;
          city: string | null;
          language: string | null;
          plan: PlanTier;
          created_at: string;
          deleted_at: string | null;
        },
        "id"
      >;

      conversations: Table<
        {
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
        },
        "phone"
      >;

      // बातचीत का इतिहास (WhatsApp वाली `conversations` से अलग)
      chat_threads: Table<
        {
          id: string;
          user_id: string;
          title: string;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        },
        "user_id"
      >;

      chat_messages: Table<
        {
          id: string;
          thread_id: string;
          user_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        },
        "thread_id" | "user_id" | "role" | "content",
        [
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ]
      >;

      shops: Table<
        {
          id: string;
          user_id: string;
          name: string;
          category: ShopCategory;
          city: string;
          phone: string | null;
          created_at: string;
        },
        "user_id" | "name" | "city"
      >;

      brand_kits: Table<
        {
          id: string;
          shop_id: string;
          primary_color: string | null;
          logo_path: string | null;
          created_at: string;
        },
        "shop_id"
      >;

      batches: Table<
        {
          id: string;
          user_id: string;
          total: number;
          created_at: string;
        },
        "user_id" | "total"
      >;

      jobs: Table<
        {
          id: string;
          shop_id: string;
          batch_id: string | null;
          status: JobStatus;
          input: Json;
          attempts: number;
          error: string | null;
          cost_paise: number | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string | null;
        },
        "shop_id",
        [
          {
            foreignKeyName: "jobs_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ]
      >;

      outputs: Table<
        {
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
        },
        "job_id" | "type",
        [
          {
            foreignKeyName: "outputs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ]
      >;

      outcomes: Table<
        {
          id: string;
          job_id: string | null;
          kind: string;
          value: Json | null;
          created_at: string;
        },
        "kind"
      >;

      cost_events: Table<
        {
          id: string;
          job_id: string | null;
          step: string;
          provider: string;
          model: string | null;
          cost_paise: number;
          meta: Json | null;
          created_at: string;
        },
        "step" | "provider" | "cost_paise"
      >;

      usage_ledger: Table<
        {
          id: string;
          user_id: string;
          kind: string;
          reason: string;
          delta: number;
          job_id: string | null;
          created_at: string;
        },
        "user_id" | "kind" | "reason" | "delta"
      >;

      subscriptions: Table<
        {
          id: string;
          user_id: string;
          plan_tier: PlanTier;
          razorpay_subscription_id: string;
          status: string;
          current_period_end: string | null;
          created_at: string;
        },
        "user_id" | "plan_tier" | "razorpay_subscription_id" | "status"
      >;

      wallets: Table<
        {
          user_id: string;
          balance_paise: number;
          topup_bonus_used: boolean;
          updated_at: string;
        },
        "user_id"
      >;

      wallet_ledger: Table<
        {
          id: number;
          user_id: string;
          delta_paise: number;
          reason: "topup" | "bonus" | "debit" | "refund" | "admin";
          ref: string | null;
          job_id: string | null;
          created_at: string;
        },
        "user_id" | "delta_paise" | "reason"
      >;

      payments: Table<
        {
          id: string;
          user_id: string;
          amount_paise: number;
          status: string;
          provider_ref: string | null;
          created_at: string;
        },
        "user_id" | "amount_paise" | "status"
      >;

      processed_messages: Table<
        {
          wa_message_id: string;
          from_phone: string;
          processed_at: string;
        },
        "wa_message_id" | "from_phone"
      >;

      consents: Table<
        {
          id: string;
          user_id: string;
          purpose: string;
          policy_version: string;
          granted_at: string;
          revoked_at: string | null;
        },
        "user_id" | "purpose" | "policy_version"
      >;

      deletion_log: Table<
        {
          id: string;
          from_phone: string;
          completed_at: string;
          created_at: string;
        },
        "from_phone"
      >;

      webhook_events: Table<
        {
          id: string;
          provider: string;
          payload: Json;
          created_at: string;
        },
        "provider" | "payload"
      >;

      audit_log: Table<
        {
          id: string;
          user_id: string | null;
          action: string;
          meta: Json | null;
          created_at: string;
        },
        "action"
      >;

      announcements: Table<
        {
          id: string;
          user_id: string;
          shop_name: string;
          body: string;
          status: "published" | "hidden";
          reports: number;
          created_at: string;
        },
        "user_id" | "shop_name" | "body"
      >;

      notifications: Table<
        {
          id: string;
          user_id: string;
          kind: "comment" | "job_done";
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        },
        "user_id" | "kind" | "title"
      >;

      announcement_comments: Table<
        {
          id: string;
          announcement_id: string;
          user_id: string;
          author_name: string;
          body: string;
          status: string;
          reports: number;
          created_at: string;
        },
        "announcement_id" | "user_id" | "author_name" | "body"
      >;
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
      wallet_credit: {
        Args: {
          p_user: string;
          p_amount: number;
          p_ref: string;
          p_bonus_percent: number;
          p_bonus_min: number;
        };
        Returns: Json;
      };
      wallet_debit: {
        Args: { p_user: string; p_amount: number; p_item: string; p_job: string };
        Returns: Json;
      };
      wallet_refund_job: {
        Args: { p_job: string };
        Returns: number;
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