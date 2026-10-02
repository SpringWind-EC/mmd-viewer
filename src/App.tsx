import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import MMDPage from "./pages/MMDPage";
import type { MotionDraft } from "./types/motion-draft";

export default function App() {
  const [draft, setDraft] = useState<MotionDraft>({ plan: null, title: "", revision: 0 });

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/MMD" replace />} />
      <Route path="/MMD" element={<MMDPage draft={draft} setDraft={setDraft} />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="register" />} />
    </Routes>
  );
}
