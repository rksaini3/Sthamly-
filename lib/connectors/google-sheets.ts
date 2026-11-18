import { z } from "zod";
import type { Connector, ConnectorToolResult } from "@/lib/connectors/types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE_READ = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SCOPE_WRITE = "https://www.googleapis.com/auth/spreadsheets";

const spreadsheetIdSchema = z
  .string()
  .trim()
  .min(10)
  .max(100)
  .regex(/^[a-zA-Z0-9-_]+$/);
const rangeSchema = z.string().trim().min(1).max(100);

async function sheetsFetch(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: await res.json() };
}

function apiErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Google Sheets ki permission nahi mili. Connect dobara karein.";
  }
  if (status === 404) return "Spreadsheet nahi mili. ID check karein.";
  if (status === 429) return "Google ne abhi bahut requests le li hain. Thodi der baad try karein.";
  return "Google Sheets se data nahi mil paya.";
}

const readRowsSchema = z.object({
  spreadsheetId: spreadsheetIdSchema,
  range: rangeSchema,
});

const appendRowSchema = z.object({
  spreadsheetId: spreadsheetIdSchema,
  range: rangeSchema,
  values: z.array(z.string().max(500)).min(1).max(30),
});

export const googleSheetsConnector: Connector = {
  id: "google_sheets",
  name: "Google Sheets",
  description: "Apni Google Sheet se data padhna aur usme nayi row jodna",
  authType: "oauth2",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    // access_type=offline se refresh token milta hai, prompt=consent se hamesha milta hai
    extraAuthParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
  scopes: [
    {
      id: SCOPE_READ,
      label: "Sheet padhna",
      description: "Aapki Google Sheets ki data padh sakega",
    },
    {
      id: SCOPE_WRITE,
      label: "Sheet mein likhna",
      description: "Aapki Google Sheets mein nayi row jod sakega, sirf aapki manzoor se",
    },
  ],
  tools: [
    {
      name: "sheets_read_rows",
      description: "Google Sheet ki kisi range ki rows padhna (sirf padhna, kuch badalta nahi)",
      argsHint: '{"spreadsheetId": "string", "range": "Sheet1!A1:D10"}',
      schema: readRowsSchema,
      permission: "auto",
      requiredScopes: [SCOPE_READ],
      summarize: (args) => `Sheet "${args.range}" padhi jaayegi`,
      async run(args, ctx): Promise<ConnectorToolResult> {
        const token = await ctx.getAccessToken();
        const url = `${SHEETS_API}/${encodeURIComponent(args.spreadsheetId)}/values/${encodeURIComponent(args.range)}`;
        const result = await sheetsFetch(url, token);
        if (!result.ok) return { ok: false, message: apiErrorMessage(result.status) };

        const values = (result.body as { values?: string[][] }).values ?? [];
        if (values.length === 0) return { ok: true, text: "Is range mein koi data nahi hai." };

        const lines = values.slice(0, 50).map((row, i) => `${i + 1}. ${row.join(" | ")}`);
        return {
          ok: true,
          text: `${values.length} row mili:\n${lines.join("\n")}`,
          data: { rowCount: values.length },
        };
      },
    },
    {
      name: "sheets_append_row",
      description: "Google Sheet mein ek nayi row jodna (sheet badalti hai, isliye user ki manzoor zaroori)",
      argsHint: '{"spreadsheetId": "string", "range": "Sheet1", "values": ["cell1", "cell2"]}',
      schema: appendRowSchema,
      permission: "confirm",
      requiredScopes: [SCOPE_WRITE],
      summarize: (args) =>
        `Sheet "${args.range}" mein nayi row jodi jaayegi: ${args.values.join(", ")}`,
      async run(args, ctx): Promise<ConnectorToolResult> {
        const token = await ctx.getAccessToken();
        const url =
          `${SHEETS_API}/${encodeURIComponent(args.spreadsheetId)}/values/${encodeURIComponent(args.range)}:append` +
          `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const result = await sheetsFetch(url, token, {
          method: "POST",
          body: JSON.stringify({ values: [args.values] }),
        });
        if (!result.ok) return { ok: false, message: apiErrorMessage(result.status) };
        return { ok: true, text: "Row jud gayi hai." };
      },
    },
  ],
};