import { useState, type Dispatch, type SetStateAction } from "react";
import { isRawVmdJson, rawVmdJsonToMotion } from "../engine/RawVmdMotion";
import { generateMotion } from "../services/generateMotion";
import { generatePlan, type PlanData } from "../services/api";
import type { MotionDraft } from "../types/motion-draft";
import PlanLibrary from "./PlanLibrary";
import "./motionPanel.css";

interface Props {
  onMotionGenerated: (motion: any) => void;
  onPlanGenerated: (plan: PlanData) => void;
  playbackError: string | null;
  draft: MotionDraft;
  setDraft: Dispatch<SetStateAction<MotionDraft>>;
}

type Mode = "ai" | "manual";

export default function ChatPanel({
  onMotionGenerated,
  onPlanGenerated,
  playbackError,
  draft,
  setDraft,
}: Props) {

  const [mode, setMode] = useState<Mode>("ai");

  const [prompt, setPrompt] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const { plan: currentPlan, title: planTitle, revision: planRevision } = draft;

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
      setDraft((current) => ({ ...current, plan: null }));

    } catch (err: any) {
      console.error(err);
      setError((err as Error).message || "AI generation failed");
    }

    setLoading(false);
  }

  async function handleGenerateMotionPlan() {
    setLoading(true);
    setError(null);

    try {
      const plan = await generatePlan(prompt);

      console.log("AI MOTION PLAN:", plan);

      onPlanGenerated(plan);
      setDraft((current) => ({
        plan,
        title: prompt.trim().slice(0, 120) || "Untitled plan",
        revision: current.revision + 1,
      }));
    } catch (err: any) {
      console.error(err);
      setError((err as Error).message || "Motion plan generation failed");
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

      if (isRawVmdJson(parsed)) {
        const motion = rawVmdJsonToMotion(parsed);

        console.log("RAW VMD JSON:", parsed);
        console.log("COMPILED RAW VMD MOTION:", motion);

        onMotionGenerated(motion);
        setDraft((current) => ({ ...current, plan: null }));
        return;
      }

      if (!parsed.duration || typeof parsed.duration !== "number") {
        setError("Invalid motion JSON: missing duration");
        return;
      }

      if (Array.isArray(parsed.actions) || Array.isArray(parsed.operators)) {
        if (
          (!Array.isArray(parsed.actions) || parsed.actions.length < 1) &&
          (!Array.isArray(parsed.operators) || parsed.operators.length < 1)
        ) {
          setError("Invalid motion plan JSON: missing actions or operators");
          return;
        }

        console.log("MANUAL MOTION PLAN:", parsed);

        onPlanGenerated(parsed);
        setDraft((current) => ({ plan: parsed, title: "Manual plan", revision: current.revision + 1 }));
        return;
      }

      if (!Array.isArray(parsed.keyframes)) {
        setError("Invalid JSON: expected keyframes, actions, or operators");
        return;
      }

      if (parsed.keyframes.length < 2) {
        setError("Invalid motion JSON: needs at least 2 keyframes");
        return;
      }
      
      onMotionGenerated(parsed);
      setDraft((current) => ({ ...current, plan: null }));

    } catch (err) {
      console.error(err);
      setError("Invalid JSON format");
    }
  }

  return (
    <section className="motion-panel" aria-label="Motion controls">
      <header className="motion-panel-header">
        <span className="motion-panel-mark" aria-hidden="true" />
        <h1>Motion Studio</h1>
      </header>

      <div className="motion-mode-switch" role="group" aria-label="Motion input mode">
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={mode === "ai" ? "is-active" : ""}
          aria-pressed={mode === "ai"}
        >
          AI
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={mode === "manual" ? "is-active" : ""}
          aria-pressed={mode === "manual"}
        >
          Manual JSON
        </button>
      </div>

      {(error || playbackError) && (
        <div className="motion-panel-error" role="alert">
          {error || playbackError}
        </div>
      )}

      {mode === "ai" && (
        <div className="motion-panel-form">
          <label htmlFor="motion-prompt">Describe a motion</label>
          <textarea
            id="motion-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A slow wave, then a small bow..."
            rows={4}
          />
          <button
            type="button"
            onClick={handleGenerateMotionPlan}
            disabled={loading || !prompt.trim()}
            className="motion-action motion-action-primary"
          >
            {loading ? "Generating..." : "Generate Motion Plan"}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="motion-action motion-action-secondary"
          >
            Generate Raw Motion
          </button>
        </div>
      )}

      {mode === "manual" && (
        <div className="motion-panel-form">
          <label htmlFor="motion-json">Motion JSON</label>
          <textarea
            id="motion-json"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste motion JSON here"
            rows={8}
            className="motion-json-input"
          />
          <button
            type="button"
            onClick={handleManualSubmit}
            className="motion-action motion-action-secondary"
          >
            Apply JSON Motion
          </button>
        </div>
      )}

      <PlanLibrary
        currentPlan={currentPlan}
        suggestedTitle={planTitle}
        revision={planRevision}
        onLoad={(plan) => {
          setDraft((current) => ({ ...current, plan }));
          onPlanGenerated(plan);
        }}
      />

    </section>
  );
}
