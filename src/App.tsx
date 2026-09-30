import { Routes, Route, Navigate } from "react-router-dom";
import MMDPage from "./pages/MMDPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/MMD" replace />} />
      <Route path="/MMD" element={<MMDPage />} />
    </Routes>
  );
}
