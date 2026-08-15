import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardPaste,
  Clock3,
  Copy,
  Download,
  FileText,
  Goal,
  HelpCircle,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  ScanText,
  ShieldCheck,
  WandSparkles,
  Zap,
} from "lucide-react";
import { analyzeText } from "./api";
import { examples } from "./demo";
import type { Analysis, EvidenceStatus, Priority } from "./types";

const MAX_CHARS = 12000;
const priorityLabels: Record<Priority, string> = { high: "Высокий", medium: "Средний", low: "Низкий" };
const deadlineLabels: Record<EvidenceStatus, string> = { explicit: "Из текста", inferred: "Предложено", missing: "Не указан" };

function markdownFor(result: Analysis) {
  const goals = result.goals.map((goal) => `- ${goal.title}${goal.successMetric ? ` — ${goal.successMetric}` : ""}`).join("\n");
  const tasks = result.tasks.map((task) => `- [ ] ${task.title}${task.owner ? ` · ${task.owner}` : ""}${task.deadline ? ` · ${task.deadline}` : ""}`).join("\n");
  const risks = result.risks.map((risk) => `- **${risk.title}**: ${risk.mitigation}`).join("\n");
  const questions = result.questions.map((question) => `- ${question}`).join("\n");
  const plan = result.plan.map((step) => `${step.order}. **${step.title}** — ${step.description}`).join("\n");
  return `# ${result.title}\n\n${result.summary}\n\n## Цели\n${goals}\n\n## Задачи\n${tasks}\n\n## Риски\n${risks}\n\n## Вопросы\n${questions}\n\n## План действий\n${plan}\n`;
}

export default function App() {
  const [text, setText] = useState(() => localStorage.getItem("workpilot-draft") || "");
  const [result, setResult] = useState<Analysis | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(!import.meta.env.VITE_API_URL);
  const [copied, setCopied] = useState(false);
  const [quota, setQuota] = useState({ limit: 4, remaining: 4, resetAt: null as string | null });
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => localStorage.setItem("workpilot-draft", text), 250);
    return () => window.clearTimeout(id);
  }, [text]);

  const canAnalyze = text.trim().length >= 40 && !loading;
  const stats = useMemo(() => result ? [
    [result.goals.length, "цели"],
    [result.tasks.length, "задач"],
    [result.risks.length, "риска"],
    [result.questions.length, "вопроса"],
  ] : [], [result]);

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setLoading(true);
    setError("");
    setCompleted(new Set());
    try {
      const response = await analyzeText(text.trim());
      setResult(response.analysis);
      setIsDemo(response.demo);
      setQuota({ limit: response.limit, remaining: response.remaining, resetAt: response.resetAt });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Произошла неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function copyPlan() {
    if (!result) return;
    await navigator.clipboard.writeText(markdownFor(result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadPlan() {
    if (!result) return;
    const blob = new Blob([markdownFor(result)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "workpilot-plan.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleTask(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="WorkPilot Brief — на главную">
          <span className="brand-mark">W</span>
          <span>WorkPilot <b>Brief</b></span>
        </a>
        <div className="topbar-meta">
          <span className="status-dot"><i /> {isDemo ? "Локальный деморежим" : "Данные не сохраняются"}</span>
          <span className="quota-chip"><Zap size={13} /> {isDemo ? "Демо без лимита" : `${quota.remaining} из ${quota.limit} осталось`}</span>
          <a href="https://github.com/ChekovDanil/WorkChTools" target="_blank" rel="noreferrer">GitHub <ArrowRight size={15} /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow"><span className="eyebrow-icon"><BrainCircuit size={17} /></span> AI-планировщик задач</div>
            <h1>Превратите текст<br />в <span>понятный план</span></h1>
            <p>Вставьте заметки со встречи, письмо клиента или описание проекта. Получите цели, задачи, сроки и риски в одной структуре.</p>
            <div className="trust-row">
              <span><ShieldCheck size={16} /> Без регистрации</span>
              <span><Clock3 size={16} /> {isDemo ? "Демо за несколько секунд" : "Результат за ~30 секунд"}</span>
            </div>
          </div>
          <div className="flow-card" aria-label="Как работает WorkPilot">
            <span className="flow-label">Как это работает</span>
            <div><span className="flow-step-icon"><ClipboardPaste size={18} /><i>1</i></span><p><strong>Вставьте текст</strong><small>От 40 до 12 000 символов</small></p></div>
            <div><span className="flow-step-icon"><BrainCircuit size={18} /><i>2</i></span><p><strong>{isDemo ? "Посмотрите пример разбора" : "AI разберёт содержание"}</strong><small>{isDemo ? "Без отправки текста во внешний API" : "Без выдуманных дат и исполнителей"}</small></p></div>
            <div><span className="flow-step-icon"><ListChecks size={18} /><i>3</i></span><p><strong>Заберите готовый план</strong><small>Редактируйте, копируйте или скачайте</small></p></div>
          </div>
        </section>

        <section className="composer" aria-label="Анализ текста">
          <div className="composer-head">
            <div>
              <span className="composer-icon"><FileText size={18} /></span>
              <span><small>Исходный материал</small><h2>Что нужно разобрать?</h2></span>
            </div>
            <span className="daily-limit"><Zap size={14} /> {isDemo ? "Демо без API и лимита" : "До 4 анализов за 24 часа"}</span>
          </div>
          {isDemo && (
            <div className="demo-notice" role="status">
              <WandSparkles size={17} />
              <span><b>Демонстрационный режим.</b> Текст остаётся в браузере, а кнопка показывает пример готового WorkPilot-плана.</span>
            </div>
          )}
          <div className="example-row"><span>Попробовать пример:</span>{examples.map((example) => <button type="button" key={example.label} onClick={() => setText(example.text)}>{example.label}</button>)}</div>
          <div className="editor-wrap">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
              placeholder="Вставьте сюда заметки, письмо или описание проекта…"
              aria-label="Текст для анализа"
            />
            <div className="editor-footer">
              <span className={text.length > MAX_CHARS * 0.9 ? "char-count warning" : "char-count"}>{text.length.toLocaleString("ru-RU")} / {MAX_CHARS.toLocaleString("ru-RU")}</span>
              <span>Минимум 40 символов</span>
            </div>
          </div>
          {error && <div className="error-message" role="alert"><AlertTriangle size={17} /> {error}</div>}
          <div className="composer-actions">
            <button className="primary-button" type="button" disabled={!canAnalyze} onClick={handleAnalyze}>
              {loading ? <><span className="button-icon"><LoaderCircle className="spin" size={19} /></span> Собираем план…</> : <><span className="button-icon"><ScanText size={19} /></span> {isDemo ? "Показать демо-план" : "Разобрать текст"} <ArrowRight size={19} /></>}
            </button>
            <p><ShieldCheck size={14} /> {isDemo ? "В деморежиме текст никуда не отправляется." : "Текст не сохраняется. Не добавляйте конфиденциальные данные."}</p>
          </div>
        </section>

        {!result && (
          <section className="preview-strip" aria-label="Состав результата">
            <span>На выходе</span>
            <div className="preview-item"><Goal size={18} /><b>Цели</b><small>Что должно измениться</small></div>
            <div className="preview-item"><ClipboardCheck size={18} /><b>Задачи</b><small>Кто и что делает</small></div>
            <div className="preview-item"><Clock3 size={18} /><b>Сроки</b><small>Явные и предложенные</small></div>
            <div className="preview-item"><AlertTriangle size={18} /><b>Риски</b><small>Что может помешать</small></div>
          </section>
        )}

        {result && (
          <section className="results" ref={resultRef} aria-live="polite">
            <div className="result-header">
              <div>
                <div className="eyebrow"><CheckCircle2 size={14} /> План готов {isDemo && <em>Демо</em>}</div>
                <h2>{result.title}</h2>
                <p>{result.summary}</p>
              </div>
              <div className="result-actions">
                <button type="button" onClick={copyPlan}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Скопировано" : "Копировать"}</button>
                <button type="button" onClick={downloadPlan}><Download size={16} /> Скачать .md</button>
              </div>
            </div>

            <div className="stats-row">
              {stats.map(([value, label]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}
              <div className="confidence"><strong>{result.confidence}%</strong><span>уверенность</span></div>
            </div>

            <div className="result-grid">
              <article className="panel goals-panel">
                <div className="panel-title"><span className="panel-icon violet"><Goal size={18} /></span><div><small>Направление</small><h3>Цели и критерии успеха</h3></div></div>
                <div className="goal-list">
                  {result.goals.map((goal, index) => (
                    <div className="goal-card" key={`${goal.title}-${index}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><h4>{goal.title}</h4>{goal.successMetric && <p>{goal.successMetric}</p>}<details><summary>Источник <ChevronDown size={14} /></summary><blockquote>{goal.evidence}</blockquote></details></div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel questions-panel">
                <div className="panel-title"><span className="panel-icon amber"><HelpCircle size={18} /></span><div><small>Пробелы</small><h3>Что нужно уточнить</h3></div></div>
                <ol className="question-list">{result.questions.map((question) => <li key={question}>{question}</li>)}</ol>
              </article>

              <article className="panel tasks-panel">
                <div className="panel-title"><span className="panel-icon mint"><ClipboardCheck size={18} /></span><div><small>Исполнение</small><h3>Задачи и ответственность</h3></div></div>
                <div className="task-table">
                  <div className="task-row task-head"><span>Задача</span><span>Ответственный</span><span>Срок</span><span>Приоритет</span></div>
                  {result.tasks.map((task) => (
                    <div className={`task-row ${completed.has(task.id) ? "done" : ""}`} key={task.id}>
                      <span className="task-name"><button type="button" aria-label={`Отметить задачу «${task.title}»`} onClick={() => toggleTask(task.id)}>{completed.has(task.id) && <Check size={13} />}</button><span><b>{task.title}</b><small>{task.rationale}</small><span className="task-mobile-meta"><em>{task.owner || "Не назначен"}</em><em>{task.deadline || deadlineLabels[task.deadlineStatus]}</em></span></span></span>
                      <span>{task.owner || "Не назначен"}</span>
                      <span>{task.deadline || deadlineLabels[task.deadlineStatus]}<em className={`evidence ${task.deadlineStatus}`}>{deadlineLabels[task.deadlineStatus]}</em></span>
                      <span><em className={`priority ${task.priority}`}>{priorityLabels[task.priority]}</em></span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel risks-panel">
                <div className="panel-title"><span className="panel-icon coral"><AlertTriangle size={18} /></span><div><small>Контроль</small><h3>Риски и меры</h3></div></div>
                <div className="risk-list">
                  {result.risks.map((risk) => (
                    <div className="risk-card" key={risk.title}>
                      <div><em className={`priority ${risk.severity}`}>{priorityLabels[risk.severity]}</em><h4>{risk.title}</h4></div>
                      <p><ShieldCheck size={15} /> {risk.mitigation}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel plan-panel">
                <div className="panel-title"><span className="panel-icon blue"><ArrowRight size={18} /></span><div><small>Следующие действия</small><h3>Готовый план</h3></div></div>
                <div className="timeline">
                  {result.plan.map((step) => (
                    <div className="timeline-step" key={step.order}>
                      <span>{step.order}</span><div><h4>{step.title}</h4><p>{step.description}</p><small>{step.taskIds.length} {step.taskIds.length === 1 ? "задача" : "задачи"}</small></div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
            <button className="reset-button" type="button" onClick={() => { setResult(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}><RotateCcw size={16} /> Новый анализ</button>
          </section>
        )}
      </main>

      <footer><span>WorkPilot Brief <b>v0.2</b></span><p>Из заметок — в ясные действия.</p><span>2026</span></footer>
    </div>
  );
}
