import { accessToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Server को login token के साथ call करें। Token न हो तो सीधे ApiError। */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new ApiError(401, "पहले लॉग-इन करें");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

/** वॉलेट बैलेंस (paise में) */
export async function getWalletPaise(): Promise<number> {
  const res = await authedFetch("/api/mobile/wallet");
  if (!res.ok) throw new ApiError(res.status, `बैलेंस नहीं मिला (${res.status})`);
  const data = (await res.json()) as { walletPaise?: unknown };
  if (typeof data.walletPaise !== "number") throw new ApiError(500, "सर्वर का जवाब सही नहीं है");
  return data.walletPaise;
}