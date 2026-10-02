import type { PlanData } from "../services/api";

export interface MotionDraft {
  plan: PlanData | null;
  title: string;
  revision: number;
}
