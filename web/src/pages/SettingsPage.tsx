// Sthamly AI web: settings (Blueprint 3.0, section 9 aur 10)
// Profile (naam, bhasha), privacy toggles (history, memory), data export aur data delete.
// Memory default off hai (blueprint 8). Delete sirf conversations hatata hai, account nahi.
// Har change Worker par jaata hai. Client par koi plan ya usage ka faisla nahi hota.

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { applyPrefs, readPrefs, writePrefs, type Prefs } from "../lib/prefs";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiClientError,
  getProfile,
  updateProfile,
  type ProfileView,
} from "../api/client";

const DELETE_CONFIRM_TEXT = "DELETE_MY_DATA";
const NAME_MAX = 60;

const LANGUAGE_OPTIONS: Array<{ value: ProfileView["language"]; label: string }> = [
  { value: "hi", label: "हिंदी" },
  { value: "hinglish", label: "Hinglish" },
  { value: "en", label: "English" },
];

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।";
}

// Export file browser mein download karta hai. Blob URL turant free hota hai.
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsPage() {
  const { getAccessToken, user } = useAuth();

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Partner mode aur akshar ka aakar: yahin se badalte hain, chat screen par ye bhi dikhta hai.
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());

  function changePrefs(next: Prefs): void {
    setPrefs(next);
    writePrefs(next);
    applyPrefs(next);
  }
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState("");

  // Pehli baar profile load karna.
  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
        }
        const res = await getProfile(token, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setProfile(res.profile);
        setName(res.profile.display_name ?? "");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(errorText(err));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [getAccessToken]);

  // Ek hi jagah se patch: Worker ka response hi naya state banta hai.
  async function applyPatch(
    patch: Partial<Pick<ProfileView, "display_name" | "language" | "history_enabled" | "memory_enabled">>,
    successMessage: string,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
      }
      const res = await updateProfile(token, patch);
      setProfile(res.profile);
      setName(res.profile.display_name ?? "");
      setNotice(successMessage);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function handleNameSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (Array.from(trimmed).length > NAME_MAX) {
      setError(`नाम ${NAME_MAX} अक्षर से ज़्यादा नहीं हो सकता।`);
      return;
    }
    void applyPatch({ display_name: trimmed.length === 0 ? null : trimmed }, "नाम सहेज लिया गया।");
  }

  function handleLanguage(value: ProfileView["language"]): void {
    if (profile?.language === value) return;
    void applyPatch({ language: value }, "भाषा बदल गई।");
  }

  function handleHistoryToggle(enabled: boolean): void {
    void applyPatch(
      { history_enabled: enabled },
      enabled
        ? "इतिहास चालू हो गया।"
        : "इतिहास बंद हो गया। नई बातचीत सेव नहीं होगी।",
    );
  }

  function handleMemoryToggle(enabled: boolean): void {
    void applyPatch(
      { memory_enabled: enabled },
      enabled ? "याददाश्त चालू हो गई।" : "याददाश्त बंद हो गई।",
    );
  }

  async function handleExport(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
      }
      const res = await fetch(
        `${(import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "")}/api/user/export`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        let code: ApiClientError["code"] = "internal";
        let message = "डेटा निर्यात नहीं हो सका। दोबारा कोशिश करें।";
        try {
          const body = (await res.json()) as { error?: { code?: string; message?: string } };
          if (body.error?.message) message = body.error.message;
          if (body.error?.code === "unauthenticated") code = "unauthenticated";
        } catch {
          // body galat hai: default message
        }
        throw new ApiClientError(code, message, false, null);
      }
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `sthamly-export-${date}.json`);
      setNotice("आपका डेटा डाउनलोड हो गया।");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteData(): Promise<void> {
    if (busy) return;
    if (deleteText !== DELETE_CONFIRM_TEXT) {
      setError(`पुष्टि के लिए "${DELETE_CONFIRM_TEXT}" लिखें।`);
      return;
    }
    if (!window.confirm("सभी बातचीत हमेशा के लिए हट जाएँगी। क्या आप पक्का चाहते हैं?")) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
      }
      const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
      const res = await fetch(`${base}/api/user/data`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: DELETE_CONFIRM_TEXT }),
      });
      if (!res.ok) {
        throw new ApiClientError("internal", "डेटा नहीं हटाया जा सका। दोबारा कोशिश करें।", false, null);
      }
      const body = (await res.json()) as { conversations_deleted?: number };
      setDeleteText("");
      setNotice(`${body.conversations_deleted ?? 0} बातचीत हटा दी गईं।`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page">
      <header className="page-header">
        <Link to="/chat" className="btn-ghost">
          ← वापस चैट पर
        </Link>
        <h1>सेटिंग्स</h1>
      </header>

      {loading && <p className="muted">लोड हो रहा है…</p>}

      {error !== null && (
        <p className="page-error" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="page-notice" role="status">
          {notice}
        </p>
      )}

      {!loading && profile !== null && (
        <>
          <section className="card" aria-labelledby="account-title">
            <h2 id="account-title">खाता</h2>
            <p className="muted small">{user?.email ?? ""}</p>

            <form className="settings-form" onSubmit={handleNameSubmit}>
              <label className="auth-field">
                <span>नाम</span>
                <input
                  type="text"
                  value={name}
                  maxLength={NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>
                नाम सहेजें
              </button>
            </form>

            <fieldset className="lang-group" disabled={busy}>
              <legend>भाषा</legend>
              {LANGUAGE_OPTIONS.map((opt) => (
                <label key={opt.value} className="radio">
                  <input
                    type="radio"
                    name="language"
                    value={opt.value}
                    checked={profile.language === opt.value}
                    onChange={() => handleLanguage(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>
          </section>

          <section className="card" aria-labelledby="look-title">
            <h2 id="look-title">दिखावट और मोड</h2>

            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.role === "partner"}
                onChange={(e) =>
                  changePrefs({ ...prefs, role: e.target.checked ? "partner" : "user" })
                }
              />
              <span>
                <strong>पार्टनर मोड (CSC / वकील)</strong>
                <br />
                <span className="muted small">चालू करने पर चैट की शुरुआत में पार्टनर के कार्ड दिखेंगे।</span>
              </span>
            </label>
          </section>

          <section className="card" aria-labelledby="privacy-title">
            <h2 id="privacy-title">गोपनीयता</h2>

            <label className="toggle">
              <input
                type="checkbox"
                checked={profile.history_enabled}
                onChange={(e) => handleHistoryToggle(e.target.checked)}
                disabled={busy}
              />
              <span>
                <strong>बातचीत का इतिहास सेव करें</strong>
                <span className="muted small">
                  बंद करने पर नई बातचीत सेव नहीं होगी, और पुरानी सूची नहीं दिखेगी।
                </span>
              </span>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={profile.memory_enabled}
                onChange={(e) => handleMemoryToggle(e.target.checked)}
                disabled={busy}
              />
              <span>
                <strong>याददाश्त चालू करें</strong>
                <span className="muted small">
                  डिफ़ॉल्ट रूप से बंद है। चालू करने पर AI आपकी बातें याद रख सकता है।
                </span>
              </span>
            </label>
          </section>

          <section className="card" aria-labelledby="data-title">
            <h2 id="data-title">आपका डेटा</h2>

            <p className="muted small">
              आपका सारा डेटा एक JSON फ़ाइल में डाउनलोड कर सकते हैं: प्रोफ़ाइल, बातचीत और संदेश।
            </p>
            <button type="button" className="btn-ghost" onClick={() => void handleExport()} disabled={busy}>
              डेटा डाउनलोड करें
            </button>

            <div className="danger-zone">
              <h3>बातचीत हटाएँ</h3>
              <p className="muted small">
                यह सारी बातचीत हमेशा के लिए हटा देगा। खाता नहीं हटेगा। पुष्टि के लिए{" "}
                <code>{DELETE_CONFIRM_TEXT}</code> लिखें।
              </p>
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder={DELETE_CONFIRM_TEXT}
                disabled={busy}
                aria-label="पुष्टि लिखें"
              />
              <button
                type="button"
                className="btn-danger"
                onClick={() => void handleDeleteData()}
                disabled={busy || deleteText !== DELETE_CONFIRM_TEXT}
              >
                सारी बातचीत हटाएँ
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}