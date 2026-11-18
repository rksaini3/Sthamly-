import type { AnyConnectorTool, Connector, ConnectionRecord } from "@/lib/connectors/types";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";

// Sabhi connectors ki master list. Naya connector yahan add karein.
export const CONNECTORS: Connector[] = [googleSheetsConnector];

export function findConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

// Kisi tool ka naam unique hona chahiye, warna model ko confusion hoga
export function findConnectorTool(toolName: string): AnyConnectorTool | undefined {
  for (const connector of CONNECTORS) {
    const tool = connector.tools.find((t) => t.name === toolName);
    if (tool) return tool;
  }
  return undefined;
}

// User ke active connections ke hisaab se sirf wahi tools lautaye jo chal sakte hain.
// Jo connector connected nahi hai, uske tools model ki list mein nahi jaayenge.
export function activeToolsFor(connections: ConnectionRecord[]): AnyConnectorTool[] {
  const activeIds = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.connectorId),
  );
  return CONNECTORS.filter((c) => activeIds.has(c.id)).flatMap((c) => {
    const connection = connections.find((x) => x.connectorId === c.id && x.status === "active");
    const granted = new Set(connection?.grantedScopes ?? []);
    // Tool tabhi milega jab uske saare zaroori scopes user ne diye hon
    return c.tools.filter((t) => t.requiredScopes.every((s) => granted.has(s)));
  });
}