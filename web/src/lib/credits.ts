// Sthamly AI web: credits ki pre-check. Server bhi wahi check karta hai; ye bas user ko pehle hi plan page dikha deta hai.
// Costs worker ke barabar: chat sandesh 1, tasveer edit / background hatana 10.
import { fetchBillingStatus } from "../api/billing";

export const CREDITS_CHAT = 1;
export const CREDITS_IMAGE = 10;

// Khaate mein itne credits hain? Balance na pata chale (network) to aage badhne dete hain: server phir bhi rokega.
export async function hasCredits(token: string, needed: number): Promise<boolean> {
  try {
    const status = await fetchBillingStatus(token);
    return status.credits.total >= needed;
  } catch {
    return true;
  }
}