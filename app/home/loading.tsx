export default function Loading() {
  return (
    <main
      aria-busy="true"
      style={{ maxWidth: 640, margin: "0 auto", minHeight: "100dvh", padding: "64px 16px 24px" }}
    >
      <div style={{ height: 26, width: 120, borderRadius: 8, background: "#e5e7eb" }} />
      <div style={{ marginTop: 24, height: 130, borderRadius: 16, background: "#f3f4f6" }} />
      <div style={{ marginTop: 16, height: 130, borderRadius: 16, background: "#f3f4f6" }} />
      <div style={{ marginTop: 16, height: 130, borderRadius: 16, background: "#f3f4f6" }} />
    </main>
  );
}