import { useState } from "react";
import { compileMotionPlan } from "../engine/MotionCompiler";
import { generateMotion } from "../services/generateMotion";
import { generateMotionPlan } from "../services/generateMotionPlan";

interface Props {
  onMotionGenerated: (motion: any) => void;
}

type Mode = "ai" | "manual";

export default function ChatPanel({
  onMotionGenerated,
}: Props) {

  const [mode, setMode] = useState<Mode>("ai");

  const [prompt, setPrompt] = useState("");
  const [jsonInput, setJsonInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =========================
  // AI GENERATION MODE
  // =========================
  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const motion = await generateMotion(prompt);

      console.log("AI MOTION RESPONSE:", motion);

      onMotionGenerated(motion);

    } catch (err: any) {
      console.error(err);
      setError("AI generation failed");
    }

    setLoading(false);
  }

  async function handleGenerateMotionPlan() {
    setLoading(true);
    setError(null);

    try {
      const plan = await generateMotionPlan(prompt);
      const motion = compileMotionPlan(plan);

      console.log("AI MOTION PLAN:", plan);
      console.log("COMPILED MOTION:", motion);

      onMotionGenerated(motion);
    } catch (err: any) {
      console.error(err);
      setError("Motion plan generation failed");
    }

    setLoading(false);
  }

  // =========================
  // MANUAL JSON MODE
  // =========================
  function handleManualSubmit() {
    setError(null);

    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.duration || typeof parsed.duration !== "number") {
        setError("Invalid motion JSON: missing duration");
        return;
      }

      if (Array.isArray(parsed.actions)) {
        if (parsed.actions.length < 1) {
          setError("Invalid motion plan JSON: missing actions");
          return;
        }

        const motion = compileMotionPlan(parsed);

        console.log("MANUAL MOTION PLAN:", parsed);
        console.log("COMPILED MANUAL MOTION:", motion);

        onMotionGenerated(motion);
        return;
      }

      if (!Array.isArray(parsed.keyframes)) {
        setError("Invalid JSON: expected keyframes or actions");
        return;
      }

      if (parsed.keyframes.length < 2) {
        setError("Invalid motion JSON: needs at least 2 keyframes");
        return;
      }
      
      onMotionGenerated(parsed);

    } catch (err) {
      console.error(err);
      setError("Invalid JSON format");
    }
  }

  return (
    <div
      style={{
        position: "relative",
        zIndex: 100,
        background: "rgba(0,0,0,0.85)",
        padding: 16,
        borderRadius: 12,
        width: 350,
        color: "white",
      }}
    >

      {/* =========================
          MODE SWITCH
      ========================= */}
      <div style={{ marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setMode("ai")}
          style={{
            marginRight: 8,
            padding: 6,
            background: mode === "ai" ? "#444" : "#222",
            color: "white",
            cursor: "pointer",
          }}
        >
          AI Mode
        </button>

        <button
          type="button"
          onClick={() => setMode("manual")}
          style={{
            padding: 6,
            background: mode === "manual" ? "#444" : "#222",
            color: "white",
            cursor: "pointer",
          }}
        >
          Manual JSON
        </button>
      </div>

      {/* =========================
          ERROR DISPLAY
      ========================= */}
      {error && (
        <div style={{ color: "red", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* =========================
          AI MODE UI
      ========================= */}
      {mode === "ai" && (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe motion..."
            rows={6}
            style={{
              width: "95%",
              padding: 10,
              marginBottom: 10,
              background: "#111",
              color: "white",
              border: "1px solid #444",
              borderRadius: 8,
              fontFamily: "monospace",
            }}
          />

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: "100%",
              padding: 10,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generating..." : "Generate Motion"}
          </button>

          <button
            type="button"
            onClick={handleGenerateMotionPlan}
            disabled={loading}
            style={{
              width: "100%",
              padding: 10,
              marginTop: 8,
              background: "#333",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Generate Motion Plan
          </button>
        </>
      )}

      {/* =========================
          MANUAL JSON MODE UI
      ========================= */}
      {mode === "manual" && (
        <>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste motion JSON or motion plan JSON here"
            rows={10}
            style={{
              width: "95%",
              padding: 10,
              marginBottom: 10,
              background: "#111",
              color: "#0f0",
              border: "1px solid #444",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 12,
              whiteSpace: "pre",
            }}
          />

          <button
            type="button"
            onClick={handleManualSubmit}
            style={{
              width: "100%",
              padding: 10,
              background: "#333",
              color: "white",
              cursor: "pointer",
            }}
          >
            Apply JSON Motion
          </button>
        </>
      )}

    </div>
  );
}
