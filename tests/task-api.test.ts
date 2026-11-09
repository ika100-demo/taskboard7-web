import { afterEach, describe, expect, it, vi } from "vitest";

// Dynamic so a missing module fails the test, not the whole file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- module shape is checked by the tests
const load = (p: string): Promise<any> => import(/* @vite-ignore */ `../app/${p}`);

const json =(body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AC-001.4 title validation", () => {
  it("AC-001.4 validateTitle rejects empty/whitespace and over 200 code points", async () => {
    const { validateTitle } = await load("_lib/validate-title");
    expect(validateTitle("")).toBe("Enter a title");
    expect(validateTitle(" \t\n")).toBe("Enter a title");
    expect(validateTitle("a".repeat(201))).toBe("Title can be at most 200 characters");
    expect(validateTitle("😀".repeat(201))).toBe("Title can be at most 200 characters");
    expect(validateTitle("😀".repeat(200))).toBeNull();
    expect(validateTitle("a".repeat(200))).toBeNull();
  });

  it("AC-001.4 createTaskAction returns invalid and sends no request", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const { createTaskAction } = await load("actions");
    expect(await createTaskAction({ title: "  ", due_date: null })).toEqual({
      ok: false,
      error: "invalid",
      message: "Enter a title",
    });
    expect(await createTaskAction({ title: "a".repeat(201), due_date: null })).toEqual({
      ok: false,
      error: "invalid",
      message: "Title can be at most 200 characters",
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("AC-001.3 POST /tasks", () => {
  it("AC-001.3 sends the untrimmed title and due_date and returns the created task on 201", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const task = { id: "7", title: " Padded ", due_date: "2026-04-04" };
    const fetchStub = vi.fn().mockResolvedValue(json(task, 201));
    vi.stubGlobal("fetch", fetchStub);
    const { createTaskAction } = await load("actions");
    expect(await createTaskAction({ title: " Padded ", due_date: "2026-04-04" })).toEqual({ ok: true, task });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0];
    expect(String(url)).toBe("http://api.test/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: " Padded ", due_date: "2026-04-04" });
  });

  it("AC-001.3 sends due_date null when none is picked", async () => {
    const fetchStub = vi.fn().mockResolvedValue(json({ id: "7", title: "T", due_date: null }, 201));
    vi.stubGlobal("fetch", fetchStub);
    const { createTaskAction } = await load("actions");
    await createTaskAction({ title: "T", due_date: null });
    expect(JSON.parse(fetchStub.mock.calls[0][1].body)).toEqual({ title: "T", due_date: null });
  });
});

describe("AC-001.6 POST failures", () => {
  it.each([
    ["422", () => vi.fn().mockResolvedValue(json({ detail: "x" }, 422))],
    ["503", () => vi.fn().mockResolvedValue(json({ detail: "x" }, 503))],
    ["200 instead of 201", () => vi.fn().mockResolvedValue(json({ id: "1", title: "T", due_date: null }, 200))],
    ["201 with wrong shape", () => vi.fn().mockResolvedValue(json({ nope: true }, 201))],
    ["network error", () => vi.fn().mockRejectedValue(new TypeError("fetch failed"))],
    ["timeout", () => vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))],
  ])("AC-001.6 createTaskAction returns unavailable on %s, one attempt, no retry", async (_n, make) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchStub = make();
    vi.stubGlobal("fetch", fetchStub);
    const { createTaskAction } = await load("actions");
    expect(await createTaskAction({ title: "T", due_date: null })).toEqual({ ok: false, error: "unavailable" });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("AC-001.6 uses a 5 s abort signal and logs without the title", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchStub = vi.fn().mockResolvedValue(json({ detail: "secret-detail" }, 503));
    vi.stubGlobal("fetch", fetchStub);
    const { createTask } = await load("_lib/task-api");
    expect(await createTask({ title: "secret-title", due_date: null })).toEqual({ ok: false });
    expect(fetchStub.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    const logged = err.mock.calls.map((c) => String(c[0])).join("\n");
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({
      level: "error",
      msg: "task_api_failed",
      op: "create",
      status: 503,
      error: "http_status",
    });
    expect(logged).not.toContain("secret-title");
    expect(logged).not.toContain("secret-detail");
  });
});

describe("AC-001.1 GET /tasks client", () => {
  it("AC-001.1 listTasks keeps API order and uses API_URL without trailing slash", async () => {
    vi.stubEnv("API_URL", "http://api.test/");
    const tasks = [
      { id: "b", title: "B", due_date: null },
      { id: "a", title: "A", due_date: "2026-01-01" },
    ];
    const fetchStub = vi.fn().mockResolvedValue(json(tasks));
    vi.stubGlobal("fetch", fetchStub);
    const { listTasks } = await load("_lib/task-api");
    expect(await listTasks()).toEqual({ ok: true, tasks });
    expect(String(fetchStub.mock.calls[0][0])).toBe("http://api.test/tasks");
    expect(fetchStub.mock.calls[0][1].method).toBe("GET");
  });

  it("AC-001.1 apiUrl defaults to http://localhost:8080", async () => {
    vi.stubEnv("API_URL", undefined as unknown as string);
    const { apiUrl } = await load("_lib/config");
    expect(apiUrl()).toBe("http://localhost:8080");
  });
});

describe("AC-001.5 GET failures", () => {
  it.each([
    ["500", () => vi.fn().mockResolvedValue(json([], 500))],
    ["object body", () => vi.fn().mockResolvedValue(json({}))],
    ["item with wrong shape", () => vi.fn().mockResolvedValue(json([{ id: "1", title: 5, due_date: null }]))],
    ["network error", () => vi.fn().mockRejectedValue(new TypeError("fetch failed"))],
    ["timeout", () => vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))],
  ])("AC-001.5 listTasks returns { ok: false } on %s, one attempt", async (_n, make) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchStub = make();
    vi.stubGlobal("fetch", fetchStub);
    const { listTasks } = await load("_lib/task-api");
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
