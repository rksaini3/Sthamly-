// Sthamly AI web: routes (Blueprint 4.0, UI spec ke hisaab se)
// Public: /chat (guest bhi chat kar sakta hai), /create (guest ko login card dikhta hai), /login.
// Login zaroori: /usage, /settings. Ye login gate sirf UI ke liye hai (asli security Worker aur RLS mein hai).
// Guest flow: chat aur create pehle khule rehte hain. Limit ya login card screen par hi dikhta hai, redirect nahi.

import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { CreatePage } from "./pages/CreatePage";
import { PlansPage } from "./pages/PlansPage";
import { UsagePage } from "./pages/UsagePage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

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

function AppRoutes() {
  return (
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
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}