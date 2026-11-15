import { createClient } from "@supabase/supabase-js";

// Bearer token से user पहचानें। वैध न हो तो null।
// Supabase खुद token की जाँच करता है (service key के साथ, anon key के साथ नहीं)।
export async function userFromBearer(request: Request): Promise<{ id: string } | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase env सेट नहीं है");

  // हर call पर नया client, ताकि user का token किसी और request में न चिपके
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}