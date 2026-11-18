import type { z } from "zod";
import type { Lang } from "@/lib/i18n";

// Connector kaise authorize hoga
// - none: koi login nahi chahiye (jaise public data)
// - oauth2: user Google/Meta jaise account se login karega, token hum store karenge
// - api_key: admin ek key dega (server par env mein rakhi jaayegi)
export type AuthType = "none" | "oauth2" | "api_key";

// "auto": bina poochhe chalega (sirf padhna)
// "confirm": pehle user ki manzoor lagegi (likhna, bhejna, kharch)
export type ToolPermission = "auto" | "confirm";

// Har connector ka ek scope hota hai, jaise sheet padhna ya message bhejna.
// User ko connect karte waqt yeh list dikhayi jaayegi.
export interface ConnectorScope {
  // provider ka asli scope string, jaise "https://www.googleapis.com/auth/spreadsheets.readonly"
  id: string;
  // user ko dikhne wala naam
  label: string;
  description: string;
}

// Tool ke run ke time jo context milta hai
export interface ConnectorToolContext {
  userId: string;
  lang: Lang;
  // token sirf server ke andar milta hai, model ko kabhi nahi dikhaya jaata
  getAccessToken: () => Promise<string>;
}

// Tool ka result. Model ko sirf text aur safe data jaata hai, token nahi.
export type ConnectorToolResult =
  | { ok: true; text: string; data?: Record<string, unknown> }
  | { ok: false; message: string };

export interface ConnectorTool<S extends z.ZodType = z.ZodType> {
  // tool ka unique naam, jaise "sheets_append_row"
  name: string;
  // model ke liye: yeh tool kab use karna hai
  description: string;
  // model ke liye arguments ka chhota format
  argsHint: string;
  schema: S;
  permission: ToolPermission;
  // permission "confirm" ho to user ko dikhne wali ek line
  summarize: (args: z.infer<S>) => string;
  // ye scope tool chalane ke liye zaroori hain (check ke liye)
  requiredScopes: string[];
  run: (args: z.infer<S>, ctx: ConnectorToolContext) => Promise<ConnectorToolResult>;
}

// Registry mein sab tools ek saath rakhne ke liye (type safety ke liye any use hua hai)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConnectorTool = ConnectorTool<any>;

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  // env variable ke naam, value code mein nahi likhi jaayegi
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectPath: string;
}

export interface Connector {
  // unique id, jaise "google_sheets"
  id: string;
  name: string;
  description: string;
  authType: AuthType;
  // oauth2 ke liye hi config chahiye
  oauth?: OAuthConfig;
  scopes: ConnectorScope[];
  tools: AnyConnectorTool[];
}

// User ka connection (database row ka shape). Token is mein nahi hai, woh alag encrypted table mein rahega.
export type ConnectionStatus = "active" | "revoked" | "error";

export interface ConnectionRecord {
  id: string;
  userId: string;
  connectorId: string;
  status: ConnectionStatus;
  grantedScopes: string[];
  createdAt: string;
  updatedAt: string;
}