import { useState } from "react";
import { generateMotion } from "../services/generateMotion"; 


interface Props {
  onMotionGenerated: (motion: any) => void;
}

export default function ChatPanel({

  onMotionGenerated,

}: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);

    try {
      const motion = await generateMotion(prompt);

      console.log("AI MOTION RESPONSE:", motion);

      onMotionGenerated(motion);
      
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: 20,
        zIndex: 100,
        background: "rgba(0,0,0,0.8)",
        padding: 16,
        borderRadius: 12,
        width: 300,
      }}
    >
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe motion"
        style={{
          width: "100%",
          padding: 10,
          marginBottom: 10,
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading
          ? "Generating..."
          : "Generate Motion"}
      </button>
    </div>
  );
}