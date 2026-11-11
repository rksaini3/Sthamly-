import { getServerEnv } from "@/lib/env";

// एडमिन की पहचान: ADMIN_USER_IDS में कॉमा से अलग Supabase user id।
// कोड में कोई id न लिखें। सिर्फ़ Vercel के environment variables में रखें।
// यही नियम वित्त (शेयर/कंपनी विश्लेषण) वाले हिस्से को सिर्फ़ टीम तक रखता है।

function adminIds(): Set<string> {
  const raw = getServerEnv().ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0),
  );
}

/** यह user एडमिन है या नहीं। server पर ही इस्तेमाल करें। */
export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return adminIds().has(userId.toLowerCase());
}