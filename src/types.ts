export type EvidenceStatus = "explicit" | "inferred" | "missing";
export type Priority = "high" | "medium" | "low";

export interface Goal {
  title: string;
  successMetric: string | null;
  evidence: string;
}

export interface Task {
  id: string;
  title: string;
  owner: string | null;
  deadline: string | null;
  deadlineStatus: EvidenceStatus;
  priority: Priority;
  rationale: string;
}

export interface Risk {
  title: string;
  severity: Priority;
  mitigation: string;
  evidence: string;
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  taskIds: string[];
}

export interface Analysis {
  title: string;
  summary: string;
  confidence: number;
  goals: Goal[];
  tasks: Task[];
  risks: Risk[];
  questions: string[];
  plan: PlanStep[];
}
