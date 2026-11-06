"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

const inputStyle = { display: "block", width: "100%", padding: 10, fontSize: "1rem", marginTop: 4 };
const labelStyle = { display: "block", marginBottom: 12, fontWeight: 600 };

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
    <div>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>चरण {step} / 3</p>

      {error && (
        <Card>
          <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>
            {error}
          </p>
        </Card>
      )}

      {step === 1 && (
        <form onSubmit={handleShopSubmit}>
          <label style={labelStyle}>
            दुकान का नाम
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
              maxLength={80}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            दुकान का प्रकार
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ShopCategory)}
              style={inputStyle}
            >
              {SHOP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            शहर
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              maxLength={60}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            WhatsApp नंबर (10 अंक)
            <input
              type="tel"
              inputMode="numeric"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
              placeholder="9876543210"
              style={inputStyle}
            />
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? "सेव हो रहा है…" : "आगे बढ़ें"}
          </Button>
        </form>
      )}

      {step === 2 && (
        <div>
          <p style={{ marginTop: 0 }}>
            दुकान या प्रोडक्ट की 1 से 3 फोटो चुनें। पहली फोटो पोस्टर की बेस बनेगी।
          </p>

          <label style={labelStyle}>
            फोटो चुनें ({photoPaths.length}/{MAX_PHOTOS})
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              disabled={busy || photoPaths.length >= MAX_PHOTOS}
              onChange={(e) => handlePhotoSelect(e.target.files)}
              style={{ display: "block", marginTop: 8 }}
            />
          </label>

          <Button
            type="button"
            disabled={busy || photoPaths.length === 0}
            onClick={() => setStep(3)}
          >
            आगे बढ़ें
          </Button>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handleOfferSubmit}>
          <label style={labelStyle}>
            ऑफर या रेट
            <input
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              required
              minLength={3}
              maxLength={300}
              placeholder="जैसे: 1 किलो काजू कतली ₹600"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            मौका (वैकल्पिक)
            <input
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              maxLength={60}
              placeholder="जैसे: छठ, शादी सीज़न, सेल"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            भाषा
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              style={inputStyle}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={wantReel}
              onChange={(e) => setWantReel(e.target.checked)}
            />
            रील भी बनवाएं (अभी प्रायोगिक, credit ज़्यादा लगता है)
          </label>

          <Button type="submit" disabled={busy}>
            {busy ? "भेजा जा रहा है…" : "पोस्टर बनवाएं"}
          </Button>
        </form>
      )}
    </div>
  );
}