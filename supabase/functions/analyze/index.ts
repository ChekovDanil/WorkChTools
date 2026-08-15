const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const timezone = typeof body.timezone === "string" ? body.timezone : "UTC";
    if (text.length < 40 || text.length > 12000) {
      return Response.json({ error: "Текст должен содержать от 40 до 12 000 символов" }, { status: 400, headers: corsHeaders });
    }

    const today = new Date().toISOString().slice(0, 10);
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
        store: false,
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
    return Response.json({ analysis: JSON.parse(serialized), demo: false }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Не удалось обработать запрос" }, { status: 500, headers: corsHeaders });
  }
});
