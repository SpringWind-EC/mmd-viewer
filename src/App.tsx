import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import MMDPage from "./pages/MMDPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/MMD" replace />} />
      <Route path="/MMD" element={<MMDPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="register" />} />
    </Routes>
  );
}
