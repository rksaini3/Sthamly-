// बातचीत (चैट थ्रेड) के छोटे सहायक

export const THREAD_TITLE_MAX = 40;

// पहले संदेश से शीर्षक: एक लाइन, छोटा
export function titleFromMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "नई बातचीत";
  return oneLine.length > THREAD_TITLE_MAX ? `${oneLine.slice(0, THREAD_TITLE_MAX)}…` : oneLine;
}

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
}