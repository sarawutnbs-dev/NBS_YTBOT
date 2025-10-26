export type JobType = "sync-comments" | "generate-drafts" | "post-reply";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type JobRecord = {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  payload?: Record<string, unknown>;
  error?: string;
};

const jobs = new Map<string, JobRecord>();

export function enqueueJob(input: Omit<JobRecord, "createdAt" | "updatedAt" | "status">) {
  const record: JobRecord = {
    ...input,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  jobs.set(record.id, record);
  return record;
}

export function updateJob(id: string, updates: Partial<Omit<JobRecord, "id" | "createdAt">>) {
  const existing = jobs.get(id);
  if (!existing) {
    throw new Error(`Job ${id} not found`);
  }

  const merged = {
    ...existing,
    ...updates,
    updatedAt: Date.now()
  } satisfies JobRecord;

  jobs.set(id, merged);
  return merged;
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export function listJobs(limit = 50) {
  return Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
