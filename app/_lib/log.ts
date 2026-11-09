export type TaskApiFailure = {
  op: "list" | "create";
  error: "http_status" | "bad_body" | "timeout" | "network";
  status?: number;
};

export function logError(fields: TaskApiFailure): void {
  console.error(JSON.stringify({ level: "error", msg: "task_api_failed", ...fields }));
}
