import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

// यूज़र की फाइलें जिन buckets में रहती हैं
const BUCKETS = ["shop-photos", "outputs"] as const;
const REMOVE_CHUNK = 100;

// किसी folder की सारी फाइलें (अंदर की sub-folders समेत) पाथ की सूची में
async function listAllFiles(admin: Admin, bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;

  const paths: string[] = [];
  for (const entry of data ?? []) {
    const full = `${prefix}/${entry.name}`;
    // Supabase में folder का id null होता है
    if (entry.id === null) {
      paths.push(...(await listAllFiles(admin, bucket, full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

async function removeUserFolder(admin: Admin, bucket: string, userId: string): Promise<void> {
  const paths = await listAllFiles(admin, bucket, userId);
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + REMOVE_CHUNK));
    if (error) throw error;
  }
}

/**
 * यूज़र का पूरा डेटा हटाएं: फाइलें, खाता, और संदेश के रिकॉर्ड।
 * खाता हटने पर profile, दुकानें, jobs, outputs, ledger और consents अपने-आप हट जाते हैं (cascade)।
 */
export async function eraseUserData(userId: string, phone: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. पहले फाइलें, ताकि खाता हटने के बाद उनके रास्ते न बचें
  for (const bucket of BUCKETS) {
    await removeUserFolder(admin, bucket, userId);
  }

  // 2. खाता (और उससे जुड़ा सारा डेटाबेस का हिस्सा)
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw authError;

  // 3. फोन से जुड़े बचे रिकॉर्ड
  const { error: convError } = await admin.from("conversations").delete().eq("phone", phone);
  if (convError) console.error("erase: conversations delete failed", convError);

  const { error: msgError } = await admin.from("processed_messages").delete().eq("from_phone", phone);
  if (msgError) console.error("erase: processed_messages delete failed", msgError);

  // 4. सबूत के लिए: फोन नंबर और समय
  const { error: logError } = await admin.from("deletion_log").insert({
    from_phone: phone,
    completed_at: new Date().toISOString(),
  });
  if (logError) console.error("erase: deletion_log insert failed", logError);
}