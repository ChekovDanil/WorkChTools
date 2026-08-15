import { demoAnalysis } from "./demo";
import type { Analysis } from "./types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export async function analyzeText(text: string): Promise<{ analysis: Analysis; demo: boolean }> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 1250));
    return { analysis: demoAnalysis, demo: true };
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.analysis) {
    throw new Error(payload?.error || "Не удалось проанализировать текст");
  }

  return { analysis: payload.analysis as Analysis, demo: Boolean(payload.demo) };
}
