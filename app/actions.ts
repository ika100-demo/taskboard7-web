"use server";

import { createTask } from "./_lib/task-api";
import type { CreateTaskResult, NewTask } from "./_lib/tasks";
import { validateTitle } from "./_lib/validate-title";

export async function createTaskAction(input: NewTask): Promise<CreateTaskResult> {
  const message = validateTitle(input.title);
  if (message !== null) return { ok: false, error: "invalid", message };
  try {
    const r = await createTask(input);
    if (r.ok) return { ok: true, task: r.task };
  } catch {
    // never throw for an upstream failure
  }
  return { ok: false, error: "unavailable" };
}
