import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

// इन buckets में user का डेटा है: दुकान की फोटो और बने हुए poster
const BUCKETS = ["shop-photos", "outputs", "voice-notes"] as const;
const PAGE_SIZE = 100;
const REMOVE_CHUNK = 100;

// किसी folder के अंदर की सारी फाइलों के पूरे path (अंदर के folders भी)
async function listFilesRecursive(admin: Admin, bucket: string, folder: string): Promise<string[]> {
  const found: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(folder, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(`storage list failed (${bucket}/${folder}): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) {
        // Folder है: अंदर उतरें
        found.push(...(await listFilesRecursive(admin, bucket, path)));
      } else {
        found.push(path);
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }

  return found;
}

async function removeFiles(admin: Admin, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(`storage remove failed (${bucket}): ${error.message}`);
  }
}

/**
 * दुकानदार का पूरा डेटा मिटाएं (DPDP के तहत)।
 * क्रम: फाइलें → WhatsApp रिकॉर्ड → सबूत का log → auth user (इससे profiles, shops, jobs आदि cascade से हटते हैं)।
 */
export async function eraseUserData(userId: string, phone: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. फोटो और poster फाइलें
  for (const bucket of BUCKETS) {
    const files = await listFilesRecursive(admin, bucket, userId);
    await removeFiles(admin, bucket, files);
  }

  // 2. WhatsApp बातचीत और duplicate-जांच का रिकॉर्ड (phone से)
  const { error: convError } = await admin.from("conversations").delete().eq("phone", phone);
  if (convError) throw convError;

  const { error: processedError } = await admin
    .from("processed_messages")
    .delete()
    .eq("from_phone", phone);
  if (processedError) throw processedError;

  // 3. सबूत के लिए सिर्फ phone और समय (कोई और निजी डेटा नहीं)
  const { error: logError } = await admin.from("deletion_log").insert({
    from_phone: phone,
    completed_at: new Date().toISOString(),
  });
  if (logError) console.error("erase: deletion_log insert failed", logError);

  // 4. Auth user हटाएं
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw authError;
}