// आने वाले मौके: हर साल एक ही तारीख़ वाले दिन, और 2027 के बदलने वाले त्योहार।
// 2027 की तारीख़ें officeholidays.com की भारत की 2027 सूची से हैं। क्षेत्र के हिसाब से एक-दो दिन का फ़र्क हो सकता है।
import type { Lang } from "@/lib/i18n";

interface Day {
  month: number; // 1-12
  day: number;
  year?: number; // न हो तो हर साल
  hi: string;
  en: string;
}

const DAYS: Day[] = [
  { month: 1, day: 1, hi: "नया साल", en: "New Year" },
  { month: 1, day: 13, hi: "लोहड़ी", en: "Lohri" },
  { month: 1, day: 26, hi: "गणतंत्र दिवस", en: "Republic Day" },
  { month: 2, day: 14, hi: "वैलेंटाइन डे", en: "Valentine's Day" },
  { month: 3, day: 8, hi: "महिला दिवस", en: "Women's Day" },
  { month: 8, day: 15, hi: "स्वतंत्रता दिवस", en: "Independence Day" },
  { month: 9, day: 5, hi: "शिक्षक दिवस", en: "Teachers' Day" },
  { month: 10, day: 2, hi: "गांधी जयंती", en: "Gandhi Jayanti" },
  { month: 11, day: 14, hi: "बाल दिवस", en: "Children's Day" },
  { month: 12, day: 25, hi: "क्रिसमस", en: "Christmas" },

  // 2027 के त्योहार
  { year: 2027, month: 1, day: 15, hi: "मकर संक्रांति", en: "Makar Sankranti" },
  { year: 2027, month: 3, day: 22, hi: "होली", en: "Holi" },
  { year: 2027, month: 4, day: 15, hi: "राम नवमी", en: "Ram Navami" },
  { year: 2027, month: 8, day: 17, hi: "रक्षा बंधन", en: "Raksha Bandhan" },
  { year: 2027, month: 8, day: 25, hi: "जन्माष्टमी", en: "Janmashtami" },
  { year: 2027, month: 9, day: 4, hi: "गणेश चतुर्थी", en: "Ganesh Chaturthi" },
  { year: 2027, month: 10, day: 9, hi: "दशहरा", en: "Dussehra" },
  { year: 2027, month: 10, day: 29, hi: "दीवाली", en: "Diwali" },
  { year: 2027, month: 10, day: 31, hi: "भाई दूज", en: "Bhai Dooj" },
];

export interface UpcomingFestival {
  name: string;
  daysLeft: number;
  when: string; // "आज", "कल", "5 दिन बाद"
  prompt: string; // लिखने की जगह में भरने वाला वाक्य
}

function whenLabel(daysLeft: number, lang: Lang): string {
  if (lang === "en") {
    if (daysLeft === 0) return "today";
    if (daysLeft === 1) return "tomorrow";
    return `in ${daysLeft} days`;
  }
  if (daysLeft === 0) return "आज";
  if (daysLeft === 1) return "कल";
  return `${daysLeft} दिन बाद`;
}

// अगले `withinDays` दिनों के सबसे पास के `max` मौके
export function upcomingFestivals(now: Date, lang: Lang = "hi", withinDays = 45, max = 2): UpcomingFestival[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const found: UpcomingFestival[] = [];

  for (const f of DAYS) {
    let date: Date;
    if (f.year) {
      date = new Date(f.year, f.month - 1, f.day);
    } else {
      date = new Date(today.getFullYear(), f.month - 1, f.day);
      if (date.getTime() < today.getTime()) date = new Date(today.getFullYear() + 1, f.month - 1, f.day);
    }
    const daysLeft = Math.round((date.getTime() - today.getTime()) / msPerDay);
    if (daysLeft < 0 || daysLeft > withinDays) continue;
    const name = lang === "en" ? f.en : f.hi;
    found.push({
      name,
      daysLeft,
      when: whenLabel(daysLeft, lang),
      prompt: lang === "en" ? `I want a poster for ${name}, the offer is ` : `${name} का पोस्टर बनाना है, ऑफ़र है `,
    });
  }

  return found.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, max);
}