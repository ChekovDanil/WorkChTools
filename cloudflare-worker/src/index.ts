const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast" as const;
const QUOTA_LIMIT = 4;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_TEXT_LENGTH = 40;
const MAX_TEXT_LENGTH = 12_000;
const MAX_BODY_LENGTH = 20_000;

type Priority = "high" | "medium" | "low";
type EvidenceStatus = "explicit" | "inferred" | "missing";

interface Analysis {
  title: string;
  summary: string;
  confidence: number;
  goals: Array<{ title: string; successMetric: string | null; evidence: string }>;
  tasks: Array<{
    id: string;
    title: string;
    owner: string | null;
    deadline: string | null;
    deadlineStatus: EvidenceStatus;
    priority: Priority;
    rationale: string;
  }>;
  risks: Array<{ title: string; severity: Priority; mitigation: string; evidence: string }>;
  questions: string[];
  plan: Array<{ order: number; title: string; description: string; taskIds: string[] }>;
}

interface RequestBody {
  text?: unknown;
  timezone?: unknown;
}

interface QuotaRow {
  request_count: number;
  window_started_at: number;
}

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "confidence", "goals", "tasks", "risks", "questions", "plan"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    goals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
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
        type: "object",
        additionalProperties: false,
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
        type: "object",
        additionalProperties: false,
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
        type: "object",
        additionalProperties: false,
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
} as const;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, x-workpilot-visitor",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };

  if (origin === env.APP_ORIGIN) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request, env) });
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || origin === env.APP_ORIGIN;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reserveQuota(env: Env, visitorHash: string): Promise<{ allowed: boolean; remaining: number; resetAt: string; windowStartedAt: number }> {
  const now = Date.now();
  const row = await env.DB.prepare(`
    INSERT INTO request_limits (visitor_hash, window_started_at, request_count, updated_at)
    VALUES (?1, ?2, 1, ?2)
    ON CONFLICT(visitor_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN excluded.updated_at >= request_limits.window_started_at + ?3 THEN excluded.window_started_at
        ELSE request_limits.window_started_at
      END,
      request_count = CASE
        WHEN excluded.updated_at >= request_limits.window_started_at + ?3 THEN 1
        WHEN request_limits.request_count < ?4 + 1 THEN request_limits.request_count + 1
        ELSE request_limits.request_count
      END,
      updated_at = excluded.updated_at
    RETURNING request_count, window_started_at
  `).bind(visitorHash, now, WINDOW_MS, QUOTA_LIMIT).first<QuotaRow>();

  if (!row) throw new Error("D1 quota reservation returned no row");
  return {
    allowed: row.request_count <= QUOTA_LIMIT,
    remaining: Math.max(QUOTA_LIMIT - row.request_count, 0),
    resetAt: new Date(row.window_started_at + WINDOW_MS).toISOString(),
    windowStartedAt: row.window_started_at,
  };
}

async function refundQuota(env: Env, visitorHash: string, windowStartedAt: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE request_limits
    SET request_count = MAX(request_count - 1, 0), updated_at = ?1
    WHERE visitor_hash = ?2 AND window_started_at = ?3 AND request_count > 0
  `).bind(Date.now(), visitorHash, windowStartedAt).run();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function nullableString(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  return ["null", "none", "n/a", "не указан", "не указано", "нет"].includes(normalized) ? null : value;
}

function isPlaceholder(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("нет информации") || normalized.startsWith("информация отсутствует") || normalized.startsWith("no information");
}

function normalizeAnalysisCandidate(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const goals = Array.isArray(value.goals)
    ? value.goals.map((goal) => isRecord(goal) ? { ...goal, successMetric: nullableString(goal.successMetric) } : goal)
    : value.goals;
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((task) => {
      if (!isRecord(task)) return task;
      const normalizedDeadline = nullableString(task.deadline);
      const unusableDeadline = typeof normalizedDeadline === "string" &&
        ["explicit", "inferred", "missing"].includes(normalizedDeadline.trim().toLowerCase());
      const deadline = task.deadlineStatus === "missing" || unusableDeadline ? null : normalizedDeadline;
      const deadlineStatus = deadline === null ? "missing" : task.deadlineStatus;
      return {
        ...task,
        owner: nullableString(task.owner),
        deadline,
        deadlineStatus,
      };
    })
    : value.tasks;
  const risks = Array.isArray(value.risks)
    ? value.risks.filter((risk) => !(
      isRecord(risk) &&
      (isPlaceholder(risk.title) || (isPlaceholder(risk.evidence) && isPlaceholder(risk.mitigation)))
    ))
    : value.risks;

  return { ...value, goals, tasks, risks };
}

function isAnalysis(value: unknown): value is Analysis {
  if (!isRecord(value) || !hasString(value, "title") || !hasString(value, "summary")) return false;
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 100) return false;
  if (!Array.isArray(value.goals) || !value.goals.every((goal) => isRecord(goal) && hasString(goal, "title") && hasString(goal, "evidence") && (typeof goal.successMetric === "string" || goal.successMetric === null))) return false;
  if (!Array.isArray(value.tasks) || !value.tasks.every((task) => isRecord(task) && hasString(task, "id") && hasString(task, "title") && hasString(task, "rationale") && (typeof task.owner === "string" || task.owner === null) && (typeof task.deadline === "string" || task.deadline === null) && ["explicit", "inferred", "missing"].includes(String(task.deadlineStatus)) && ["high", "medium", "low"].includes(String(task.priority)))) return false;
  if (!Array.isArray(value.risks) || !value.risks.every((risk) => isRecord(risk) && hasString(risk, "title") && hasString(risk, "mitigation") && hasString(risk, "evidence") && ["high", "medium", "low"].includes(String(risk.severity)))) return false;
  if (!isStringArray(value.questions)) return false;
  return Array.isArray(value.plan) && value.plan.every((step) => isRecord(step) && typeof step.order === "number" && hasString(step, "title") && hasString(step, "description") && isStringArray(step.taskIds));
}

function parseAiResponse(result: unknown): Analysis | null {
  if (!isRecord(result)) return null;
  const response = normalizeAnalysisCandidate(result.response);
  if (isAnalysis(response)) return response;
  if (typeof response !== "string") return null;

  try {
    const parsed: unknown = normalizeAnalysisCandidate(JSON.parse(response));
    return isAnalysis(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: "Origin not allowed" }, 403);

  const visitorId = request.headers.get("X-WorkPilot-Visitor")?.trim() ?? "";
  if (!isUuid(visitorId)) return json(request, env, { error: "Некорректный идентификатор браузера" }, 400);

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_LENGTH) return json(request, env, { error: "Запрос слишком большой" }, 413);

  let body: RequestBody;
  try {
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    return json(request, env, { error: "Некорректный JSON" }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const timezone = typeof body.timezone === "string" && body.timezone.length <= 100 ? body.timezone : "UTC";
  if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
    return json(request, env, { error: "Текст должен содержать от 40 до 12 000 символов" }, 400);
  }

  const visitorHash = await sha256(visitorId);
  const quota = await reserveQuota(env, visitorHash);
  if (!quota.allowed) {
    return json(request, env, {
      error: "Лимит исчерпан. Новый анализ будет доступен после сброса лимита.",
      limit: QUOTA_LIMIT,
      remaining: 0,
      resetAt: quota.resetAt,
    }, 429);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: `Ты — деловой аналитик WorkPilot. Преврати исходный текст в краткий выполнимый план на языке пользователя. Сегодня ${today}, часовой пояс ${timezone}. Используй только факты из текста. Не выдумывай владельцев, бюджеты или даты. Поле deadline должно содержать сам текст срока, например "к пятнице", а не слова explicit, inferred или missing. Относительная дата, прямо указанная пользователем, считается explicit. Если дата предложена тобой, отметь inferred; если отсутствует — missing и используй настоящий JSON null, никогда строку "null". Для отсутствующих owner и successMetric также используй настоящий JSON null. Evidence должен быть короткой цитатой из текста. Риски без прямого основания допускаются только как очевидные операционные риски и должны иметь честную формулировку. Если рисков или вопросов нет, верни пустой массив без заглушек вроде "нет информации". taskIds должны точно совпадать с id задач. Confidence — число 0–100. Вопросы задавай только те, ответы на которые влияют на выполнение.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 1800,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: analysisSchema },
    });

    const analysis = parseAiResponse(result);
    if (!analysis) throw new Error("Workers AI returned an invalid structured response");

    console.log(JSON.stringify({ event: "analysis_completed", model: MODEL, remaining: quota.remaining }));
    return json(request, env, {
      analysis,
      demo: false,
      limit: QUOTA_LIMIT,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  } catch (error) {
    await refundQuota(env, visitorHash, quota.windowStartedAt);
    console.error(JSON.stringify({
      event: "analysis_failed",
      message: error instanceof Error ? error.message : "Unknown Workers AI error",
    }));
    return json(request, env, { error: "Сервис анализа временно недоступен" }, 502);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json(request, env, { ok: true, service: "workpilot-api" });
    }

    if (url.pathname !== "/analyze") return json(request, env, { error: "Not found" }, 404);
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) return json(request, env, { error: "Origin not allowed" }, 403);
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== "POST") return json(request, env, { error: "Method not allowed" }, 405);

    try {
      return await handleAnalyze(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "request_failed",
        message: error instanceof Error ? error.message : "Unknown request error",
      }));
      return json(request, env, { error: "Не удалось обработать запрос" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
