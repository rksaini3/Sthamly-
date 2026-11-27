// Sthamly AI web: routes (Blueprint 4.0, UI spec ke hisaab se)
// Public: /chat (guest bhi chat kar sakta hai), /create (guest ko login card dikhta hai), /login.
// Login zaroori: /usage, /settings. Ye login gate sirf UI ke liye hai (asli security Worker aur RLS mein hai).
// Guest flow: chat aur create pehle khule rehte hain. Limit ya login card screen par hi dikhta hai, redirect nahi.

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { ChatPage } from "./pages/ChatPage";

// Home (chat) ke alawa sab pages lazy load hote hain, taaki pehla download halka rahe
// aur chat ka input box jaldi dikhe.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const CreatePage = lazy(() => import("./pages/CreatePage").then((m) => ({ default: m.CreatePage })));
const PlansPage = lazy(() => import("./pages/PlansPage").then((m) => ({ default: m.PlansPage })));
const UsagePage = lazy(() => import("./pages/UsagePage").then((m) => ({ default: m.UsagePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const QrPage = lazy(() => import("./pages/QrPage").then((m) => ({ default: m.QrPage })));
const GalleryPage = lazy(() => import("./pages/GalleryPage").then((m) => ({ default: m.GalleryPage })));
const NotebookPage = lazy(() => import("./pages/NotebookPage").then((m) => ({ default: m.NotebookPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
import { useFeatureState, type FeatureName } from "./lib/features";
import { PageMeta } from "./components/PageMeta";

// Login zaroori routes ke liye. Session load hone tak kuch nahi dikhata.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="boot">लोड हो रहा है…</div>;
  }
  if (status === "signed_out") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Login ho chuka ho to /login par bhi seedha chat par bhejta hai.
function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="boot">लोड हो रहा है…</div>;
  }
  if (status === "signed_in") {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
}

// Feature band hai to seedha chat par. Chalu hai to bachcha page dikhta hai. Jaankari aane tak loading.
function FeatureGate({ name, children }: { name: FeatureName; children: React.ReactNode }) {
  const state = useFeatureState(name);

  if (state === "loading") {
    return <div className="boot">लोड हो रहा है…</div>;
  }
  if (state === "off") {
    return <Navigate to="/chat" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
    <PageMeta />
    <Suspense fallback={<div className="boot">लोड हो रहा है…</div>}>
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <LoginPage />
          </RedirectIfSignedIn>
        }
      />

      {/* Chat sabke liye khula hai: guest bhi. Login card ChatPage ke andar dikhta hai. */}
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/chat/:conversationId" element={<ChatPage />} />

      {/* Creation sabke liye khula hai. Guest ko CreatePage ke andar login card dikhta hai. */}
      <Route path="/create" element={<CreatePage />} />

      {/* Plan aur top-up: sabke liye khula. Kharidne ke liye login PlansPage mein poochha jaata hai. */}
      <Route path="/plans" element={<PlansPage />} />

      <Route
        path="/usage"
        element={
          <RequireAuth>
            <UsagePage />
          </RequireAuth>
        }
      />
      <Route
        path="/gallery"
        element={
          <RequireAuth>
            <FeatureGate name="gallery">
              <GalleryPage />
            </FeatureGate>
          </RequireAuth>
        }
      />
      <Route
        path="/notebook"
        element={
          <RequireAuth>
            <FeatureGate name="notebook">
              <NotebookPage />
            </FeatureGate>
          </RequireAuth>
        }
      />
      <Route
        path="/qr"
        element={
          <RequireAuth>
            <FeatureGate name="qr_refer">
              <QrPage />
            </FeatureGate>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />

      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}