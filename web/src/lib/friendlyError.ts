// Sthamly AI web: error ko aam aadmi ki bhasha mein badalna.
// Server ka code, HTTP status ya provider ka text kabhi UI tak nahi jaata.
// Har error ke liye: ek chhoti sursi (title), ek saaf vakya (message), aur agla kadam.
// Pure functions hain, isliye Node mein test hote hain.

import { ApiClientError, NETWORK_MESSAGE } from "../api/client";

export type ErrorKind =
  | "offline" // net nahi / server tak nahi pahunchay
  | "busy" // AI seva abhi vyast (503) ya thodi der mein
  | "limit" // aaj ki seema puri
  | "login" // login chahiye
  | "plan" // plan mein nahi
  | "mic_denied" // mic ki anumati nahi
  | "mic_missing" // mic mila hi nahi
  | "mic_unclear" // awaaz saaf nahi / khaali transcript
  | "mic_long" // awaaz bahut lambi
  | "mic_unsupported" // browser mein recording nahi
  | "input" // user ke input ki dikkat
  | "other"; // baaki sab

export interface FriendlyError {
  kind: ErrorKind;
  title: string;
  message: string;
  // Button "फिर कोशिश करें" dikhana hai ya nahi.
  canRetry: boolean;
  // Thodi der baad apne-aap dobara koshish karni hai ya nahi.
  autoRetry: boolean;
  // Mic ki madad (chitra ke saath) dikhani hai ya nahi.
  showMicHelp: boolean;
  // Sujhaav: likhkar bhejne ka rasta khula hai.
  offerTyping: boolean;
}

const BASE: Omit<FriendlyError, "kind" | "title" | "message"> = {
  canRetry: false,
  autoRetry: false,
  showMicHelp: false,
  offerTyping: false,
};

// Auto retry ka antaral (ms). Do baar se zyada apne-aap nahi.
const AUTO_RETRY_DELAYS_MS = [5000, 15000] as const;

export function autoRetryDelay(attempt: number): number | null {
  if (attempt < 0 || attempt >= AUTO_RETRY_DELAYS_MS.length) return null;
  return AUTO_RETRY_DELAYS_MS[attempt] ?? null;
}

// Net ki dikkat hai? (API client ka NETWORK_MESSAGE, ya browser offline hai.)
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err instanceof ApiClientError && err.code === "internal" && err.message === NETWORK_MESSAGE;
}

export function friendlyFromApi(err: unknown): FriendlyError {
  if (isNetworkError(err)) {
    return {
      ...BASE,
      kind: "offline",
      title: "नेट कमज़ोर है",
      message: "नेट कमज़ोर है, संदेश सुरक्षित है, जुड़ते ही भेजेंगे।",
      canRetry: true,
      offerTyping: false,
    };
  }

  if (err instanceof ApiClientError) {
    switch (err.code) {
      case "provider_unavailable":
        return {
          ...BASE,
          kind: "busy",
          title: "थोड़ी देर में",
          message: "अभी जवाब देने में थोड़ी देर लग रही है। हम थोड़ी देर में अपने-आप फिर कोशिश करेंगे।",
          canRetry: true,
          autoRetry: true,
        };
      case "rate_limited":
        return {
          ...BASE,
          kind: "busy",
          title: "थोड़ी देर में",
          message: "बहुत जल्दी-जल्दी भेजा गया। कुछ सेकंड रुककर फिर कोशिश करें।",
          canRetry: true,
          autoRetry: true,
        };
      case "budget_exceeded":
        return {
          ...BASE,
          kind: "limit",
          title: "आज की सीमा पूरी",
          message:
            "आज की सीमा पूरी, कल सुबह फिर। तब तक फ़ोटो, दस्तावेज़ और बनाने वाली सुविधाएँ चलती रहेंगी।",
        };
      case "unauthenticated":
        return {
          ...BASE,
          kind: "login",
          title: "लॉग-इन करें",
          message: "आगे बढ़ने के लिए पहले लॉग-इन करें। आपकी पिछली बातचीत सुरक्षित है।",
        };
      case "plan_required":
        return {
          ...BASE,
          kind: "plan",
          title: "प्लान में नहीं",
          message: "यह सुविधा आपके मौजूदा प्लान में नहीं है।",
        };
      case "invalid_request":
        return {
          ...BASE,
          kind: "input",
          title: "संदेश सही नहीं",
          message: "संदेश सही नहीं है। थोड़ा बदलकर दोबारा भेजें।",
          offerTyping: true,
        };
      case "tool_denied":
        return {
          ...BASE,
          kind: "other",
          title: "अनुमति नहीं",
          message: "यह कार्रवाई अभी अनुमति में नहीं है।",
        };
      default:
        return {
          ...BASE,
          kind: "other",
          title: "कुछ गड़बड़",
          message: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें।",
          canRetry: true,
        };
    }
  }

  return {
    ...BASE,
    kind: "other",
    title: "कुछ गड़बड़",
    message: "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।",
    canRetry: true,
  };
}

// Mic (recorder ya transcript) ki dikkat. code: RecorderError ka code, ya "empty" (khaali transcript).
export function friendlyFromMic(code: string | undefined): FriendlyError {
  switch (code) {
    case "permission_denied":
      return {
        ...BASE,
        kind: "mic_denied",
        title: "माइक की अनुमति दें",
        message: "माइक चालू नहीं है। नीचे दिए तरीके से अनुमति दें, या लिखकर भेजें।",
        showMicHelp: true,
        offerTyping: true,
      };
    case "no_microphone":
      return {
        ...BASE,
        kind: "mic_missing",
        title: "माइक नहीं मिला",
        message: "इस फ़ोन या कंप्यूटर में माइक नहीं मिला। लिखकर भेजें।",
        offerTyping: true,
      };
    case "unsupported":
      return {
        ...BASE,
        kind: "mic_unsupported",
        title: "इस ब्राउज़र में आवाज़ नहीं",
        message: "इस ब्राउज़र में आवाज़ रिकॉर्ड नहीं हो सकती। लिखकर भेजें।",
        offerTyping: true,
      };
    case "too_long":
      return {
        ...BASE,
        kind: "mic_long",
        title: "संदेश लंबा है",
        message: "आवाज़ बहुत लंबी है। छोटा संदेश बोलें।",
        offerTyping: true,
      };
    case "empty":
      return {
        ...BASE,
        kind: "mic_unclear",
        title: "फिर से बोलिए",
        message: "आवाज़ साफ़ सुनाई नहीं दी। फिर से बोलिए, या नीचे लिखकर भेजें।",
        offerTyping: true,
      };
    default:
      return {
        ...BASE,
        kind: "mic_unclear",
        title: "फिर से बोलिए",
        message: "आवाज़ को लिखा नहीं जा सका। फिर से बोलिए, या लिखकर भेजें।",
        canRetry: true,
        offerTyping: true,
      };
  }
}