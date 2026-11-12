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

      cost_events: Table