// Sthamly AI web: routes (Blueprint 3.0, section 10, guest mode)
// Public: /chat (guest bhi chat kar sakta hai), /login (opt-in, login ya signup).
// Login zaroori: /usage, /settings. Ye login gate sirf UI ke liye hai (asli security Worker aur RLS mein hai).
// Guest flow: pehle chat, limit khatam hone par ChatPage login card dikhata hai, yahan redirect nahi hota.

import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
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