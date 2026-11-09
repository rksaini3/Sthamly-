import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function SettingRow({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card stack" style={{ gap: 4, textDecoration: "none" }}>
      <strong>{title}</strong>
      <span className="muted" style={{ fontSize: "0.9rem" }}>{desc}</span>
    </Link>
  );
}

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  return (
    <main className="page stack">
      <div className="row">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand">Sthamly</span>
          <h1 style={{ margin: 0 }}>सेटिंग्स</h1>
        </div>
        <Link href="/feed" className="btn btn-ghost">
          फ़ीड
        </Link>
      </div>

      <SettingRow
        href="/onboarding"
        title="दुकान की जानकारी"
        desc="दुकान का नाम, प्रकार, शहर और WhatsApp नंबर बदलें"
      />
      <SettingRow
        href="/notifications"
        title="सूचनाएं"
        desc="कमेंट और तैयार पोस्टर की सूचनाएं देखें"
      />
      <SettingRow
        href="/my-posters"
        title="मेरे पोस्ट"
        desc="अपने पोस्टर, रील और घोषणाएं देखें, बदलें या हटाएं"
      />
      <SettingRow
        href="/pricing"
        title="प्लान और रिचार्ज"
        desc="मुफ़्त कोटा, रिचार्ज और VIP प्लान"
      />
      <SettingRow
        href="/account"
        title="खाता"
        desc="लॉग-आउट करें या खाता हटाएं"
      />
    </main>
  );
}