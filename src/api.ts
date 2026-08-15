import { demoAnalysis } from "./demo";
import type { Analysis } from "./types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export interface AnalyzeResult {
  analysis: Analysis;
  demo: boolean;
  limit: number;
  remaining: number;
  resetAt: string | null;
}

function visitorId() {
  const key = "workpilot-visitor";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export async function analyzeText(text: string): Promise<AnalyzeResult> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 1250));
    return { analysis: demoAnalysis, demo: true, limit: 4, remaining: 4, resetAt: null };
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-WorkPilot-Visitor": visitorId() },
    body: JSON.stringify({ text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.analysis) {
    throw new Error(payload?.error || "Не удалось проанализировать текст");
  }

  return {
    analysis: payload.analysis as Analysis,
    demo: Boolean(payload.demo),
    limit: Number(payload.limit || 4),
    remaining: Number(payload.remaining ?? 0),
    resetAt: typeof payload.resetAt === "string" ? payload.resetAt : null,
  };
}
