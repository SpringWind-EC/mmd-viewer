import { Routes, Route, Link } from "react-router-dom";
import MMDPage from "./pages/MMDPage";

function Home() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Home Page</h1>
      <Link to="/MMD">Go to MMD</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/MMD" element={<MMDPage />} />
    </Routes>
  );
}