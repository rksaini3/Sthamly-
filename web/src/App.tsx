// Sthamly AI web: routes (Blueprint 3.0, section 10)
// Public: /login
// Private (login zaroori): /chat, /chat/:conversationId, /usage, /settings
// Route guard sirf UI ke liye hai. Asli security Worker aur RLS mein hai (blueprint 9).
// Session ka kaam AuthProvider mein hoga, jo agli file hai.

import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { UsagePage } from "./pages/UsagePage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Login nahi hai to /login par bhejta hai. Session load hone tak kuch nahi dikhata.
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

// Login ho chuka ho to seedha chat par bhejta hai.
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

      <Route
        path="/chat"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/:conversationId"
        element={
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        }
      />
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