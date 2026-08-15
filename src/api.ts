import { demoAnalysis } from "./demo";
import type { Analysis } from "./types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const REQUEST_TIMEOUT_MS = 70_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function requestAnalysis(text: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(API_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WorkPilot-Visitor": visitorId() },
      body: JSON.stringify({ text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function analyzeText(text: string): Promise<AnalyzeResult> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 1250));
    return { analysis: demoAnalysis, demo: true, limit: 4, remaining: 4, resetAt: null };
  }

  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await requestAnalysis(text);
    } catch (caught) {
      const timedOut = caught instanceof DOMException && caught.name === "AbortError";
      if (timedOut) throw new Error("Анализ занял слишком много времени. Попробуйте отправить текст ещё раз.");
      if (attempt === 0) {
        await wait(900);
        continue;
      }
      throw new Error("Не удалось связаться с сервисом анализа. Проверьте интернет и повторите попытку.");
    }

    if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) break;
    await wait(900);
  }

  if (!response) throw new Error("Сервис анализа временно недоступен. Повторите попытку.");

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
