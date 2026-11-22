// Sthamly AI web: session, login, signup, Google login, phone OTP aur logout (Blueprint 3.0, section 9 aur 10)
// Email/password, Google aur phone OTP (WhatsApp par) ek hi session mein milte hain.
// Supabase Auth browser mein token sambhalta hai (auto refresh ke saath).
// Worker ko token getAccessToken() se milta hai. Token kabhi console ya log mein nahi jaata.
// Raw Supabase error UI tak nahi jaata, sirf Hindi message jaata hai.

import { createClient, type AuthError, type Session, type User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("VITE_SUPABASE_URL aur VITE_SUPABASE_ANON_KEY set karein (web/.env.local mein).");
}

// Session ka lock: browser ka navigator.locks kuch WebView / mobile browsers mein atak jaata hai.
// Lock seedha chalane se getSession kabhi na ruke. Trade-off: do tabs ek saath token refresh karein to dono chalenge.
const SESSION_WAIT_MS = 8_000;

// Sirf anon key browser mein jaati hai (public). Service role key kabhi nahi.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;
const MAX_NAME = 60;
// Bharatiya mobile: 10 ank, 6 se 9 se shuru.
const INDIA_MOBILE_RE = /^[6-9]\d{9}$/;

export type AuthStatus = "loading" | "signed_in" | "signed_out";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface SignUpResult {
  // true ho to user ko pehle email confirm karna hoga.
  needsConfirmation: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<SignUpResult>;
  signInWithGoogle: () => Promise<void>;
  // Phone par OTP bhejta hai. Safal hone par normalized +91 wala number lautata hai.
  signInWithPhone: (phone: string) => Promise<string>;
  // OTP check karta hai. Sahi hone par session ban jaata hai.
  verifyPhoneOtp: (e164Phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

// Supabase ka error code dekh kar Hindi message banata hai. Raw message kabhi nahi.
function friendlyError(err: AuthError | null, fallback: string): Error {
  const code = err?.code ?? "";
  if (code === "invalid_credentials") return new Error("ईमेल या पासवर्ड गलत है।");
  if (code === "email_not_confirmed") return new Error("पहले अपना ईमेल कन्फर्म करें।");
  if (code === "user_already_exists") return new Error("इस ईमेल से खाता पहले से है।");
  if (code === "otp_expired") return new Error("OTP की समय सीमा खत्म हो गई। नया OTP मँगाएँ।");
  if (code === "phone_provider_disabled") return new Error("फ़ोन से लॉग-इन अभी चालू नहीं है।");
  if (
    code === "over_request_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    err?.status === 429
  ) {
    return new Error("बहुत कोशिशें हो गईं। थोड़ी देर बाद कोशिश करें।");
  }
  return new Error(fallback);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// 10 ank ka mobile ya +91 ke saath number, dono ko +91XXXXXXXXXX banata hai. Galat ho to null.
function toIndiaE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return INDIA_MOBILE_RE.test(local) ? `+91${local}` : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    // Ek baar bhi session ka faisla ho gaya (listener ya getSession se) to timeout fallback nahi chalta.
    let settled = false;

    const apply = (session: Session | null): void => {
      if (!active) return;
      settled = true;
      setUser(toUser(session?.user ?? null));
      setStatus(session ? "signed_in" : "signed_out");
    };

    // Pehle listener, taaki koi change miss na ho (token refresh, Google redirect, doosre tab se logout).
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    // Safety: agar session kuch seconds mein tay na ho, to screen 'loading' par na atke.
    // Guest ki tarah khulta hai. Baad mein listener sahi session aane par status apne aap sudhar jaata hai.
    const timer = setTimeout(() => {
      if (!settled) apply(null);
    }, SESSION_WAIT_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const cleanEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(cleanEmail)) throw new Error("सही ईमेल डालें।");
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw new Error("पासवर्ड सही नहीं है।");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) throw friendlyError(error, "लॉग-इन नहीं हो सका। दोबारा कोशिश करें।");
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string): Promise<SignUpResult> => {
      const cleanEmail = normalizeEmail(email);
      const cleanName = name.trim();
      if (!EMAIL_RE.test(cleanEmail)) throw new Error("सही ईमेल डालें।");
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        throw new Error(`पासवर्ड ${MIN_PASSWORD} से ${MAX_PASSWORD} अक्षर का होना चाहिए।`);
      }
      if (cleanName.length > MAX_NAME) {
        throw new Error(`नाम ${MAX_NAME} अक्षर से ज़्यादा नहीं हो सकता।`);
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: cleanName ? { full_name: cleanName } : {},
          emailRedirectTo: `${window.location.origin}/chat`,
        },
      });
      if (error) throw friendlyError(error, "खाता नहीं बन सका। दोबारा कोशिश करें।");

      // Email confirmation on ho to session nahi milta.
      return { needsConfirmation: data.session === null };
    },
    [],
  );

  // Google se login. Browser Google par jaata hai, wapas aane par Supabase session bana deta hai.
  // Ye page ko redirect karta hai, isliye successful hone par ye function kuch return nahi karta.
  const signInWithGoogle = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
    if (error) throw friendlyError(error, "Google से लॉग-इन नहीं हो सका। दोबारा कोशिश करें।");
  }, []);

  // Phone par OTP. Supabase hook ke zariye ye OTP WhatsApp par jaata hai (Worker: /api/auth/sms-hook).
  // Naya number ho to khata apne-aap bante hai, alag signup ki zaroorat nahi.
  const signInWithPhone = useCallback(async (phone: string): Promise<string> => {
    const e164 = toIndiaE164(phone);
    if (!e164) throw new Error("सही 10 अंकों का मोबाइल नंबर डालें।");

    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) throw friendlyError(error, "OTP नहीं भेजा जा सका। थोड़ी देर बाद कोशिश करें।");
    return e164;
  }, []);

  const verifyPhoneOtp = useCallback(async (e164Phone: string, token: string): Promise<void> => {
    const clean = token.replace(/\D/g, "");
    if (clean.length < 4) throw new Error("OTP सही नहीं है।");

    const { error } = await supabase.auth.verifyOtp({
      phone: e164Phone,
      token: clean,
      type: "sms",
    });
    if (error) throw friendlyError(error, "OTP सही नहीं है या समय खत्म हो गया।");
  }, []);

  // Sirf is device ka session hatata hai. Doosre devices par login rehta hai.
  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("लॉग-आउट नहीं हो सका। दोबारा कोशिश करें।");
  }, []);

  // Worker ko bhejne ke liye current token. supabase-js zaroorat padne par khud refresh karta hai.
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithPhone,
      verifyPhoneOtp,
      signOut,
      getAccessToken,
    }),
    [
      status,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithPhone,
      verifyPhoneOtp,
      signOut,
      getAccessToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth sirf AuthProvider ke andar use karein.");
  }
  return ctx;
}