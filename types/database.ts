export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ProfilesRow = {
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

type ConversationsRow = {
  phone: string;
  pending_photo_path: string | null;
  pending_photo_at: string | null;
  updated_at: string;
  pending_action: string | null;
  pending_action_at: string | null;
  pending_offer: Json | null;
  pending_offer_at: string | null;
};

type ShopsRow = {
  id: string;
  user_id: string;
  name: string;
  category: "sweets" | "salon" | "coaching_clinic";
  city: string;
  phone: string | null;
  logo_path: string | null;
  created_at: string;
};

type BrandKitsRow = {
  shop_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  font_key: string | null;
  tagline: string | null;
  updated_at: string;
};

type JobsRow = {
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

type OutputsRow = {
  id: string;
  job_id: string;
  type: string;
  storage_path: string | null;
  content: string | null;
  watermarked: boolean;
  meta: Json;
  created_at: string;
};

type OutcomesRow = {
  id: string;
  output_id: string;
  shop_id: string;
  rating: number | null;
  calls_count: number | null;
  inquiries_count: number | null;
  footfall_note: string | null;
  reported_at: string;
};

type CostEventsRow = {
  id: number;
  job_id: string | null;
  step: string;
  provider: string;
  model: string | null;
  cost_paise: number;
  meta: Json;
  created_at: string;
};

type UsageLedgerRow = {
  id: number;
  user_id: string;
  delta: number;
  reason: string;
  job_id: string | null;
  created_at: string;
  kind: string | null;
};

type SubscriptionsRow = {
  id: string;
  user_id: string;
  razorpay_subscription_id: string;
  plan_tier: "free" | "plus" | "vip";
  status: string;
  current_period_end: string | null;
  created_at: string;
};

type PaymentsRow = {
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

type ProcessedMessagesRow = {
  wa_message_id: string;
  from_phone: string;
  processed_at: string;
};

type ConsentsRow = {
  id: number;
  user_id: string;
  purpose: string;
  policy_version: string;
  granted_at: string;
  revoked_at: string | null;
};

type DeletionLogRow = {
  id: number;
  from_phone: string;
  requested_at: string;
  completed_at: string | null;
};

type WebhookEventsRow = {
  id: string;
  event_type: string;
  received_at: string;
  processed: boolean;
};

type AuditLogRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  created_at: string;
};

type AnnouncementsRow = {
  id: string;
  user_id: string;
  shop_name: string;
  body: string;
  status: "published" | "hidden";
  reports: number;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfilesRow;
        Insert: { [K in keyof ProfilesRow]?: ProfilesRow[K] } & { id: string };
        Update: { [K in keyof ProfilesRow]?: ProfilesRow[K] };
        Relationships: [];
      };
      conversations: {
        Row: ConversationsRow;
        Insert: { [K in keyof ConversationsRow]?: ConversationsRow[K] } & { phone: string };
        Update: { [K in keyof ConversationsRow]?: ConversationsRow[K] };
        Relationships: [];
      };
      shops: {
        Row: ShopsRow;
        Insert: { [K in keyof ShopsRow]?: ShopsRow[K] } & { user_id: string; name: string };
        Update: { [K in keyof ShopsRow]?: ShopsRow[K] };
        Relationships: [];
      };
      brand_kits: {
        Row: BrandKitsRow;
        Insert: { [K in keyof BrandKitsRow]?: BrandKitsRow[K] } & { shop_id: string };
        Update: { [K in keyof BrandKitsRow]?: BrandKitsRow[K] };
        Relationships: [];
      };
      jobs: {
        Row: JobsRow;
        Insert: { [K in keyof JobsRow]?: JobsRow[K] } & { shop_id: string; input: Json };
        Update: { [K in keyof JobsRow]?: JobsRow[K] };
        Relationships: [];
      };
      outputs: {
        Row: OutputsRow;
        Insert: { [K in keyof OutputsRow]?: OutputsRow[K] } & { job_id: string; type: string };
        Update: { [K in keyof OutputsRow]?: OutputsRow[K] };
        Relationships: [];
      };
      outcomes: {
        Row: OutcomesRow;
        Insert: { [K in keyof OutcomesRow]?: OutcomesRow[K] } & { output_id: string; shop_id: string };
        Update: { [K in keyof OutcomesRow]?: OutcomesRow[K] };
        Relationships: [];
      };
      cost_events: {
        Row: CostEventsRow;
        Insert: { [K in keyof CostEventsRow]?: CostEventsRow[K] } & {
          step: string;
          provider: string;
          cost_paise: number;
        };
        Update: { [K in keyof CostEventsRow]?: CostEventsRow[K] };
        Relationships: [];
      };
      usage_ledger: {
        Row: UsageLedgerRow;
        Insert: { [K in keyof UsageLedgerRow]?: UsageLedgerRow[K] } & {
          user_id: string;
          delta: number;
          reason: string;
        };
        Update: { [K in keyof UsageLedgerRow]?: UsageLedgerRow[K] };
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionsRow;
        Insert: { [K in keyof SubscriptionsRow]?: SubscriptionsRow[K] } & {
          user_id: string;
          razorpay_subscription_id: string;
          status: string;
        };
        Update: { [K in keyof SubscriptionsRow]?: SubscriptionsRow[K] };
        Relationships: [];
      };
      payments: {
        Row: PaymentsRow;
        Insert: { [K in keyof PaymentsRow]?: PaymentsRow[K] } & {
          user_id: string;
          purpose: string;
          amount_paise: number;
          status: string;
        };
        Update: { [K in keyof PaymentsRow]?: PaymentsRow[K] };
        Relationships: [];
      };
      processed_messages: {
        Row: ProcessedMessagesRow;
        Insert: { [K in keyof ProcessedMessagesRow]?: ProcessedMessagesRow[K] } & {
          wa_message_id: string;
          from_phone: string;
        };
        Update: { [K in keyof ProcessedMessagesRow]?: ProcessedMessagesRow[K] };
        Relationships: [];
      };
      consents: {
        Row: ConsentsRow;
        Insert: { [K in keyof ConsentsRow]?: ConsentsRow[K] } & {
          user_id: string;
          purpose: string;
          policy_version: string;
        };
        Update: { [K in keyof ConsentsRow]?: ConsentsRow[K] };
        Relationships: [];
      };
      deletion_log: {
        Row: DeletionLogRow;
        Insert: { [K in keyof DeletionLogRow]?: DeletionLogRow[K] } & { from_phone: string };
        Update: { [K in keyof DeletionLogRow]?: DeletionLogRow[K] };
        Relationships: [];
      };
      webhook_events: {
        Row: WebhookEventsRow;
        Insert: { [K in keyof WebhookEventsRow]?: WebhookEventsRow[K] } & {
          id: string;
          event_type: string;
        };
        Update: { [K in keyof WebhookEventsRow]?: WebhookEventsRow[K] };
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: { [K in keyof AuditLogRow]?: AuditLogRow[K] } & { action: string };
        Update: { [K in keyof AuditLogRow]?: AuditLogRow[K] };
        Relationships: [];
      };
      announcements: {
        Row: AnnouncementsRow;
        Insert: { [K in keyof AnnouncementsRow]?: AnnouncementsRow[K] } & {
          user_id: string;
          shop_name: string;
          body: string;
        };
        Update: { [K in keyof AnnouncementsRow]?: AnnouncementsRow[K] };
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
      report_announcement: {
        Args: { p_id: string };
        Returns: undefined;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};