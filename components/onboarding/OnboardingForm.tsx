"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SHOP_CATEGORIES, type ShopCategory } from "@/types/domain";

const PHOTO_BUCKET = "shop-photos";
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];

const CATEGORY_LABELS: Record<ShopCategory, string> = {
  sweets: "मिठाई / हलवाई",
  salon: "सैलून / पार्लर",
  coaching_clinic: "कोचिंग / क्लिनिक",
};

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (error.message.includes("permission denied")) {
      return "डेटा सेव नहीं हो पाया। थोड़ी देर बाद दोबारा कोशिश करें।";
    }
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
}

// भारतीय नंबर: 10 अंक हों तो आगे 91 लगाएं
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

// सेव किए नंबर को फॉर्म में 10 अंकों में दिखाएं
function displayPhone(phone: string | null): string {
  if (!phone) return "";
  return phone.length === 12 && phone.startsWith("91") ? phone.slice(2) : phone;
}

export function OnboardingForm() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // लॉग-इन user और उसकी दुकान
  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  // चरण 1: दुकान की जानकारी
  const [shopName, setShopName] = useState("");
  const [category, setCategory] = useState<ShopCategory>("sweets");
  const [city, setCity] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  // चरण 2: फोटो
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);

  // चरण 3: ऑफर
  const [offerText, setOfferText] = useState("");
  const [occasion, setOccasion] = useState("");

  // पहली बार खुलने पर: user और उसकी दुकान देखें
  // दुकान मिल जाए तो सीधे फोटो वाले चरण पर भेजें, ताकि दुकान दोबारा न बने
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login?next=/onboarding");
          return;
        }

        const { data: shop, error: shopError } = await supabase
          .from("shops")
          .select("id, name, category, city, phone")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (shopError) throw shopError;

        if (cancelled) return;

        setUserId(user.id);
        if (shop) {
          setShopId(shop.id);
          setShopName(shop.name);
          setCategory(shop.category);
          setCity(shop.city);
          setPhoneInput(displayPhone(shop.phone));
          setStep(2);
        }
      } catch (err) {
        if (!cancelled) setError(messageOf(err));
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleShopSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (!userId) throw new Error("पहले लॉग-इन करें");

      const phone = normalizePhone(phoneInput);
      if (!phone) throw new Error("सही फोन नंबर डालें (10 अंक)");

      const supabase = createSupabaseBrowserClient();
      const cityValue = city.trim();

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: userId, phone, city: cityValue }, { onConflict: "id" });
      if (profileError) throw profileError;

      const values = { name: shopName.trim(), category, city: cityValue, phone };

      if (shopId) {
        // दुकान पहले से है: बदलाव सेव करें, नई दुकान न बनाएं
        const { error } = await supabase.from("shops").update(values).eq("id", shopId);
        if (error) throw error;
      } else {
        const { data: shop, error } = await supabase
          .from("shops")
          .insert({ ...values, user_id: userId })
          .select("id")
          .single();
        if (error) throw error;
        setShopId(shop.id);
      }

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
          language: "hinglish",
          wantReel: false,
        }),
      });

      const body = (await res.json()) as {
        jobId?: string;
        error?: { message?: string };
      };

      if (!res.ok || !body.jobId) {
        throw new Error(body.error?.message ?? "पोस्टर का काम शुरू नहीं हो पाया");
      }

      router.push(`/dashboard?job=${body.jobId}`);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  if (checking) {
    return <p className="muted">लोड हो रहा है…</p>;
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
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as ShopCategory)}
            >
              {SHOP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            शहर
            <input
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              maxLength={60}
            />
          </label>

          <label className="field">
            WhatsApp नंबर (10 अंक)
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
              placeholder="9876543210"
            />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "सेव हो रहा है…" : shopId ? "बदलाव सेव करें" : "आगे बढ़ें"}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="card stack">
          <p>दुकान या प्रोडक्ट की 1 से 3 फोटो चुनें। पहली फोटो पोस्टर की बेस बनेगी।</p>

          <label className="field">
            <span className="photo-count">
              फोटो चुनें ({photoPaths.length}/{MAX_PHOTOS})
            </span>
            <input
              className="file-input"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              disabled={busy || photoPaths.length >= MAX_PHOTOS}
              onChange={(e) => handlePhotoSelect(e.target.files)}
            />
          </label>

          {photoPaths.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => setPhotoPaths([])}
            >
              फोटो फिर से चुनें
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || photoPaths.length === 0}
            onClick={() => setStep(3)}
          >
            आगे बढ़ें
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => setStep(1)}
          >
            दुकान की जानकारी बदलें
          </button>
        </div>
      )}

      {step === 3 && (
        <form className="card stack" onSubmit={handleOfferSubmit}>
          <label className="field">
            ऑफर या रेट
            <input
              className="input"
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              required
              minLength={3}
              maxLength={300}
              placeholder="जैसे: 1 किलो काजू कतली ₹600"
            />
          </label>

          <label className="field">
            मौका (वैकल्पिक)
            <input
              className="input"
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              maxLength={60}
              placeholder="जैसे: छठ, शादी सीज़न, सेल"
            />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "भेजा जा रहा है…" : "पोस्टर बनवाएं"}
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => setStep(2)}
          >
            पीछे
          </button>
        </form>
      )}
    </div>
  );
}