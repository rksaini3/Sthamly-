import { useEffect, useRef, useState, type CSSProperties } from "react";
import { authedFetch, ApiError } from "../api";
import { IS_NATIVE, type Store } from "../db";
import { formatRupees } from "../ledger/money";
import { listParties } from "../ledger/repo";
import { createApproval, decideApproval, pendingApprovals, type LedgerPayload } from "./approvals";
import { parseIntent, sameName } from "./rules";

// ---- Types ----

type ServerState = "idle" | "busy" | "done" | "rejected" | "failed" | "expired";

interface Msg {
  id: number;
  role: "user" | "bot";
  text: string;
  // Android के अपने हिसाब (udhaar, paisa) की मंज़ूरी
  ledger?: { approvalId: number; open: boolean };
  // Server (LLM agent) के काम की मंज़ूरी (पोस्टर आदि)
  server?: { actionId: string; expiresAt: string; state: ServerState };
}

interface AgentAction {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

interface AgentResponse {
  runId: string;
  status: "done" | "waiting_confirm" | "failed";
  reply: string;
  actions: AgentAction[];
}

// server को भेजी जाने वाली बातचीत की सीमा (route में max 12 संदेश, हर 1000 अक्षर तक)
const MAX_HISTORY_MESSAGES = 11;
const MAX_MESSAGE_CHARS = 1000;

const HELP = [
  "ये काम कर सकता हूँ:",
  "• udhaar Ramesh 500 chini (हिसाब में उधार)",
  "• paisa mila Ramesh 200 (भुगतान दर्ज)",
  "• balance Ramesh (बाकी रकम)",
  "• poster Diwali sale 20% off (इंटरनेट से, पोस्टर)",
  "• कोई भी सवाल, जैसे आज का बाज़ार कैसा है",
  "हिसाब वाले काम इंटरनेट के बिना भी चलते हैं। बाकी के लिए इंटरनेट चाहिए।",
  "पैसे या पोस्टर वाले काम पहले आपकी मंज़ूरी माँगेंगे।",
].join("\n");

function balanceText(paise: number): string {
  if (paise === 0) return "हिसाब बराबर है";
  return paise > 0 ? `लेना है ${formatRupees(paise)}` : `देना है ${formatRupees(-paise)}`;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

// server के error code के हिसाब से सादा संदेश
function serverErrorText(status: number): string {
  if (status === 401) return "पहले लॉग-इन करें";
  if (status === 402) return "आज की मुफ़्त बातचीत पूरी हो गई। जारी रखने के लिए वॉलेट भरें।";
  if (status === 429) return "बहुत जल्दी-जल्