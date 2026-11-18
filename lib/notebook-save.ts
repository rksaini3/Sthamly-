import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// नोट की सीमाएं (migration 0012 के check के हिसाब से)
const NOTE_QUESTION_MAX = 4000;
const NOTE_CONTENT_MAX = 50000;
const NOTE_TITLE_MAX = 60;

// इससे छोटा जवाब काम की जानकारी नहीं माना जाता (जैसे "ज़रूर!", "हो गया")
const MIN_ANSWER_CHARS = 50;

// नमस्ते, धन्यवाद, ठीक है जैसे सिर्फ़ औपचारिक या छोटे संदेश (पूरे संदेश में, इसके आगे-पीछे कुछ नहीं)
const SMALL_TALK =
  /^(hi+|hello+|hey|namaste|हाय|हैलो|हेलो|नमस्ते|नमस्कार|थैंक ?(यू|you)|thanks?|thank you|धन्यवाद|शुक्रिया|ok(ay)?|ठीक ?है|ठीक|हां|हाँ|हा|जी|जी ?हां|जी ?हाँ|बाय|bye|good (morning|night|evening)|गुड (मॉर्निंग|नाइट|इवनिंग)|कैसे ?हो|कैसी ?हो|क्या हाल ?है|how are you|ok thanks|ओके|बढ़िया|बढ़िया है|अच्छा)[\s!.?।,]*$/i;

/**
 * क्या यह सवाल-जवाब नोटबुक में रखने लायक है?
 * फालतू बातचीत (नमस्ते, धन्यवाद, "ठीक है") और बहुत छोटे जवाब नहीं रखे जाते।
 */
export function isWorthSaving(question: string, answer: string): boolean {
  const q = question.replace(/\s+/g, " ").trim();
  const a = answer.trim();
  if (!q || !a) return false;
  if (SMALL_TALK.test(q)) return false;
  if (a.length < MIN_ANSWER_CHARS) return false;
  return true;
}

/**
 * चैट के सवाल-जवाब को नोटबुक नोट के रूप में सेव करें।
 * - फालतू बातें और छोटे जवाब नहीं सेव होते (isWorthSaving)।
 * - सेटिंग (profiles.notebook_auto) बंद हो तो कुछ नहीं होता।
 * - यह सहायक काम है: विफल हो तो सिर्फ़ log होता है, चैट का जवाब नहीं रुकता।
 * - Admin client से लिखते हैं, इसलिए user_id हमेशा इसी user का रखते हैं।
 */
export async function saveChatNote(input: {
  userId: string;
  threadId: string | null;
  question: string;
  answer: string;
}): Promise<void> {
  try {
    if (!isWorthSaving(input.question, input.answer)) return;

    const admin = createSupabaseAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("notebook_auto")
      .eq("id", input.userId)
      .maybeSingle();
    if (profileError) {
      console.error("chat: notebook setting read failed", profileError);
    }
    // सेटिंग न पढ़ी जा सके तो चालू माना जाता है (जैसा डिफ़ॉल्ट है)
    const auto = profileError ? true : (profile?.notebook_auto ?? true);
    if (!auto) return;

    const question = input.question.slice(0, NOTE_QUESTION_MAX);
    const content = input.answer.slice(0, NOTE_CONTENT_MAX);
    const title = (question.trim() || content.split("\n")[0] || "बिना नाम")
      .trim()
      .slice(0, NOTE_TITLE_MAX);

    const { error } = await admin.from("notebook_notes").insert({
      user_id: input.userId,
      kind: "chat",
      thread_id: input.threadId,
      title,
      question,
      content,
      tags: [],
      pinned: false,
    });
    if (error) console.error("chat: notebook note save failed", error);
  } catch (error) {
    console.error("chat: notebook note save threw", error);
  }
}