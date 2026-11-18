import type { AnyConnectorTool, Connector, ConnectionRecord } from "@/lib/connectors/types";
import { googleSheetsConnector } from "@/lib/connectors/google-sheets";

// Sabhi connectors ki master list. Naya connector sirf yahan add karein.
export const CONNECTORS: Connector[] = [
  googleSheetsConnector,
];

export function findConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function findConnectorTool(toolName: string): AnyConnectorTool | undefined {
  for (const connector of CONNECTORS) {
    const tool = connector.tools.find((t) => t.name === toolName);
    if (tool) return tool;
  }
  return undefined;
}

// User ke active connections ke hisaab se sirf wahi tools lautaye jo chal sakte hain.
// Jo connector connected nahi hai, uske tools agent ki list mein nahi jaayenge.
// Tool tabhi milega jab uske saare requiredScopes user ne diye hon.
export function activeToolsFor(connections: ConnectionRecord[]): AnyConnectorTool[] {
  const result: AnyConnectorTool[] = [];

  for (const connector of CONNECTORS) {
    const connection = connections.find(
      (c) => c.connectorId === connector.id && c.status === "active",
    );
    if (!connection) continue;

    const granted = new Set(connection.grantedScopes);
    for (const tool of connector.tools) {
      if (tool.requiredScopes.every((s) => granted.has(s))) {
        result.push(tool);
      }
    }
  }

  return result;
}