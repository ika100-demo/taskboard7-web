import { apiUrl } from "./config";
import { logError } from "./log";
import type { ListResult, NewTask, Task } from "./tasks";

function isTask(x: unknown): x is Task {
  if (typeof x !== "object" || x === null) return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.title === "string" &&
    (t.due_date === null || typeof t.due_date === "string")
  );
}

type Op = "list" | "create";

async function call(
  op: Op,
  init: RequestInit,
  okStatus: number,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}/tasks`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    logError({ op, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" });
    return { ok: false };
  }
  if (res.status !== okStatus) {
    logError({ op, error: "http_status", status: res.status });
    return { ok: false };
  }
  try {
    return { ok: true, body: await res.json() };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") logError({ op, error: "timeout" });
    else logError({ op, error: "bad_body", status: res.status });
    return { ok: false };
  }
}

export async function listTasks(): Promise<ListResult> {
  const r = await call("list", { method: "GET", headers: { Accept: "application/json" } }, 200);
  if (!r.ok) return { ok: false };
  if (!Array.isArray(r.body) || !r.body.every(isTask)) {
    logError({ op: "list", error: "bad_body", status: 200 });
    return { ok: false };
  }
  return { ok: true, tasks: r.body };
}

export async function createTask(input: NewTask): Promise<{ ok: true; task: Task } | { ok: false }> {
  const r = await call(
    "create",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
    },
    201,
  );
  if (!r.ok) return { ok: false };
  if (!isTask(r.body)) {
    logError({ op: "create", error: "bad_body", status: 201 });
    return { ok: false };
  }
  return { ok: true, task: r.body };
}
