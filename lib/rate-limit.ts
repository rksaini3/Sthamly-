// सरल in-memory rate limit। एक serverless instance के अंदर काम करता है।
// सख्त सीमा के लिए बाद में Supabase टेबल से करें।
const hits = new Map<string, number[]>();

export async function allowRequest(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) hits.clear();
  return true;
}