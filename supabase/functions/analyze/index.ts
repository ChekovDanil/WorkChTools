import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const appOrigin = Deno.env.get("APP_ORIGIN") || "https://chekovdanil.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workpilot-visitor",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

const quotaLimit = 4;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "confidence", "goals", "tasks", "risks", "questions", "plan"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "number" },
    goals: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "successMetric", "evidence"],
        properties: {
          title: { type: "string" },
          successMetric: { type: ["string", "null"] },
          evidence: { type: "string" },
        },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "title", "owner", "deadline", "deadlineStatus", "priority", "rationale"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          owner: { type: ["string", "null"] },
          deadline: { type: ["string", "null"] },
          deadlineStatus: { type: "string", enum: ["explicit", "inferred", "missing"] },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
        },
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "severity", "mitigation", "evidence"],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          mitigation: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    questions: { type: "array", items: { type: "string" } },
    plan: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["order", "title", "description", "taskIds"],
        properties: {
          order: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          taskIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

function outputText(response: Record<string, unknown>): string | null {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function visitorHash(request: Request): Promise<string> {
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  const browserId = request.headers.get("x-workpilot-visitor")?.trim();
  const networkId = forwardedIp || connectingIp;
  const identity = browserId
    ? `${browserId}:${networkId || "unknown-network"}`
    : networkId;
  const salt = Deno.env.get("RATE_LIMIT_SALT");

  if (!identity || !salt) throw new Error("Rate limit identity is not configured");

  const bytes = new TextEncoder().encode(`${salt}:${identity}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !serviceRoleKey) throw new Error("Backend secrets are not configured");

    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone : "UTC";
    if (text.length < 40 || text.length > 12000) {
      return Response.json({ error: "Текст должен содержать от 40 до 12 000 символов" }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const hash = await visitorHash(request);
    const { data: quotaRows, error: quotaError } = await supabase.rpc("consume_analysis_quota", {
      p_visitor_hash: hash,
      p_limit: quotaLimit,
    });
    if (quotaError || !quotaRows?.[0]) throw new Error(`Quota check failed: ${quotaError?.message || "empty response"}`);

    const quota = quotaRows[0] as { allowed: boolean; remaining: number; reset_at: string };
    if (!quota.allowed) {
      return Response.json(
        {
          error: "Лимит исчерпан. Новый анализ будет доступен после сброса лимита.",
          limit: quotaLimit,
          remaining: 0,
          resetAt: quota.reset_at,
        },
        { status: 429, headers: corsHeaders },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
        store: false,
        reasoning: { effort: "low" },
        input: [
          {
            role: "developer",
            content: `Ты — деловой аналитик WorkPilot. Преврати исходный текст в краткий выполнимый план на языке пользователя. Сегодня ${today}, часовой пояс ${timezone}. Используй только факты из текста. Не выдумывай владельцев, бюджеты или даты. Если дата предложена тобой, отметь inferred; если отсутствует — missing и null. Evidence должен быть короткой цитатой из текста. Риски без прямого основания допускаются только как очевидные операционные риски и должны иметь честную формулировку. Confidence — число 0–100. Вопросы задавай только те, ответы на которые влияют на выполнение.`,
          },
          { role: "user", content: text },
        ],
        text: { format: { type: "json_schema", name: "workpilot_brief", strict: true, schema } },
      }),
    });

    const payload = await openaiResponse.json();
    if (!openaiResponse.ok) {
      console.error("OpenAI error", openaiResponse.status, payload?.error?.code);
      return Response.json({ error: "Сервис анализа временно недоступен" }, { status: 502, headers: corsHeaders });
    }

    const serialized = outputText(payload);
    if (!serialized) return Response.json({ error: "Модель не вернула полный результат" }, { status: 502, headers: corsHeaders });
    return Response.json({
      analysis: JSON.parse(serialized),
      demo: false,
      limit: quotaLimit,
      remaining: quota.remaining,
      resetAt: quota.reset_at,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Не удалось обработать запрос" }, { status: 500, headers: corsHeaders });
  }
});
