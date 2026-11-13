const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** paise (1/100 रुपया) को ₹ में दिखाएं */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

// भाषा न दें तो हिंदी में दिखता है (पुरानी जगहों पर कुछ नहीं बदलता)
export function formatDate(date: Date | string, lang: "hi" | "en" = "hi"): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-IN" : "hi-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}