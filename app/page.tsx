import { redirect } from "next/navigation";

// पहला पन्ना असिस्टेंट है (/voice)। पुराना WhatsApp वाला landing हटा दिया गया है।
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  // Google/Supabase login के बाद कभी-कभी code यहीं आ जाता है।
  // उसे सही callback रास्ते पर भेजें, ताकि session बन सके।
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=/voice`);
  }

  redirect("/voice");
}