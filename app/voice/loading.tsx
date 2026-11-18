export default function Loading() {
  return (
    <main
      aria-busy="true"
      style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <p style={{ color: "#6b7280", fontSize: 16 }}>लोड हो रहा है…</p>
    </main>
  );
}