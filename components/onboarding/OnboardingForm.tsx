"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SHOP_CATEGORIES, type Language, type ShopCategory } from "@/types/domain";

const PHOTO_BUCKET = "shop-photos";
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];

const CATEGORY_LABELS: Record<ShopCategory, string> = {
  sweets: "मिठाई / हलवाई",
  salon: "सैलून / पार्लर",
  coaching_clinic: "कोचिंग / क्लिनिक",
};

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "hinglish", label: "हिंग्लिश" },
  { value: "hindi", label: "हिंदी" },
  { value: "bhojpuri", label: "भोजपुरी" },
  { value: "awadhi", label: "अवधी" },
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
}

// भारतीय नंबर: 10 अंक हों तो आगे 91 लगाएं (WhatsApp के "from" जैसा फॉर्मेट)
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

export function OnboardingForm() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // चरण 1
  const [shopName, setShopName] = useState("");
  const [category, setCategory] = useState<ShopCategory>("sweets");
  const [city, setCity] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  // चरण 1 के बाद बनने वाली चीज़ें
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  // चरण 2
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);

  // चरण 3
  const [offerText, setOfferText] = useState("");
  const [occasion, setOccasion] = useState("");
  const [language, setLanguage] = useState<Language>("hinglish");
  const [wantReel, setWantReel] = useState(false);

  async function handleShopSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const phone = normalizePhone(phoneInput);
      if (!phone) throw new Error("सही फोन नंबर डालें (10 अंक)");

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("पहले लॉग-इन करें");

      // Profile: phone और शहर (RLS: सिर्फ अपना)
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, phone, city: city.trim() }, { onConflict: "id" });
      if (profileError) throw profileError;

      // दुकान बनाएं (दोबारा बने नहीं, अगर पहले बन चुकी हो)
      if (!shopId) {
        const { data: shop, error: shopError } = await supabase
          .from("shops")
          .insert({
            user_id: user.id,
            name: shopName.trim(),
            category,
            city: city.trim(),
            phone,
          })
          .select("id")
          .single();
        if (shopError) throw shopError;
        setShopId(shop.id);
      }

      setUserId(user.id);
      setStep(2);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoSelect(files: FileList | null) {
    if (!files || !userId) return;
    setError(null);
    setBusy(true);

    try {
      const remaining = MAX_PHOTOS - photoPaths.length;
      const selected = Array.from(files).slice(0, remaining);
      if (selected.length === 0) throw new Error(`अधिकतम ${MAX_PHOTOS} फोटो`);

      const supabase = createSupabaseBrowserClient();
      const uploaded: string[] = [];

      for (const file of selected) {
        if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
          throw new Error("सिर्फ JPG या PNG फोटो चलेगी");
        }
        if (file.size > MAX_PHOTO_BYTES) {
          throw new Error("फोटो 10 MB से छोटी होनी चाहिए");
        }

        const ext = file.type === "image/png" ? "png" : "jpg";
        // पाथ यूज़र के folder में, जैसा API जांचती है
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;

        uploaded.push(path);
      }

      setPhotoPaths((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOfferSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (!shopId) throw new Error("दुकान की जानकारी फिर से भरें");

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          offerText: offerText.trim(),
          occasion: occasion.trim() || null,
          photoPaths,
          language,
          wantReel,
        }),
      });

      const body = (await res.json()) as {
        jobId?: string;
        error?: { message?: string };
      };

      if (!res.ok || !body.jobId) {
        throw new Error(body.error?.message ?? "job नहीं बन पाया");
      }

      router.push(`/dashboard?job=${body.jobId}`);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 8 }}>
        <p className="muted">चरण {step} / 3</p>
        <div className="progress" aria-hidden>
          <div className="progress-bar" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}

      {step === 1 && (
        <form className="card stack" onSubmit={handleShopSubmit}>
          <label className="field">
            दुकान का नाम
            <input
              className="input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
              maxLength={80}
            />
          </label>

          <label className="field">
            दुकान का प्रकार