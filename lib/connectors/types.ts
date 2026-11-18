import type { z } from "zod";
import type { Lang } from "@/lib/i18n";

// Connector kaise authorize hoga
// - none: koi login nahi chahiye (jaise public data)
// - oauth2: user apne account se login karega, token hum encrypt karke store karenge
// - api_key: user ya admin ek key dega, woh bhi same encrypted store mein jaayegi
export type AuthType = "none" | "oauth2" | "api_key";

// "auto": bina poochhe chalega (sirf padhna)
// "confirm": pehle user ki manzoor lagegi (likhna, bhejna, kharch)
export type ToolPermission = "auto" | "confirm";

// Connector ka ek scope, jaise sheet padhna ya message bhejna.
// User ko connect karte waqt yeh list dikhayi jaayegi.
export interface ConnectorScope {
  // provider ka asli scope string
  id: string;
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
  // tool ka unique naam, connector ke prefix ke saath (jaise "sheets_append_row")
  name: string;
  // model ke liye: yeh tool kab use karna hai
  description: string;
  // model ke liye arguments ka chhota format
  argsHint: string;
  schema: S;
  permission: ToolPermission;
  // yeh scopes user ne diye hon tabhi tool agent ko milega
  requiredScopes: string[];
  // permission "confirm" ho to user ko dikhne wali ek line
  summarize: (args: z.infer<S>) => string;
  run: (args: z.infer<S>, ctx: ConnectorToolContext) => Promise<ConnectorToolResult>;
}

// Registry mein sab tools ek saath rakhne ke liye
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConnectorTool = ConnectorTool<any>;

// OAuth ki jaankari. Redirect URL system khud banata hai (/api/connectors/<id>/callback),
// isliye woh yahan nahi likhna padta.
export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  // env variable ke naam, value code mein nahi likhi jaayegi
  clientIdEnv: string;
  clientSecretEnv: string;
  // provider ke khaas parameters, jaise Google ke liye access_type=offline
  extraAuthParams?: Record<string, string>;
}

export interface Connector {
  // unique id, URL mein bhi use hogi (jaise "google_sheets")
  id: string;
  name: string;
  description: string;
  authType: AuthType;
  // oauth2 ke liye hi config chahiye
  oauth?: OAuthConfig;
  scopes: ConnectorScope[];
  tools: AnyConnectorTool[];
}

// User ka connection (token ke bina). Token alag encrypted table mein rahega.
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