import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Task = { id: string; title: string; due_date: string | null };

// Dynamic so a missing module fails the test, not the whole file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- module shape is checked by the tests
const load = (p: string): Promise<any> => import(/* @vite-ignore */ `../app/${p}`);

const json =(body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function renderPage(fetchStub: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchStub);
  vi.stubEnv("API_URL", "http://api.test");
  const mod = await load("page");
  render(await mod.default());
}

async function renderBoard(
  initial: { ok: true; tasks: Task[] } | { ok: false },
  createTask: (input: { title: string; due_date: string | null }) => Promise<unknown>,
) {
  const { TaskBoard } = await load("_components/task-board");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the mock's result shape is checked by the tests
  render(<TaskBoard initial={initial} createTask={createTask as any} />);
}

function submit(title: string, due?: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  if (due) fireEvent.change(screen.getByLabelText("Due date"), { target: { value: due } });
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AC-001.1 root page lists tasks in API order", () => {
  it("AC-001.1 shows title and due date or 'No due date', in API order", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      json([
        { id: "1", title: "First", due_date: "2026-05-01" },
        { id: "2", title: "Second", due_date: null },
        { id: "3", title: "Third", due_date: "2026-01-09" },
      ]),
    );
    await renderPage(fetchStub);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First");
    expect(items[0]).toHaveTextContent("2026-05-01");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("Third");
    expect(items[2]).toHaveTextContent("2026-01-09");
    expect(String(fetchStub.mock.calls[0][0])).toBe("http://api.test/tasks");
  });
});

describe("AC-001.2 empty state", () => {
  it("AC-001.2 shows 'No tasks yet' and the create form when the API returns []", async () => {
    await renderPage(vi.fn().mockResolvedValue(json([])));
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Add a task" })).toBeInTheDocument();
  });
});

describe("AC-001.3 create a task", () => {
  it("AC-001.3 calls createTask untrimmed with null due date, appends the task and clears the form", async () => {
    const created = { id: "9", title: "  New one ", due_date: null };
    const createTask = vi.fn().mockResolvedValue({ ok: true, task: created });
    await renderBoard({ ok: true, tasks: [{ id: "1", title: "Old", due_date: null }] }, createTask);
    submit("  New one ");
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(2));
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith({ title: "  New one ", due_date: null });
    const items = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("New one");
    expect(items[1]).toHaveTextContent("No due date");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("AC-001.3 sends the picked due date as YYYY-MM-DD", async () => {
    const createTask = vi.fn().mockResolvedValue({ ok: true, task: { id: "9", title: "Dated", due_date: "2026-12-24" } });
    await renderBoard({ ok: true, tasks: [] }, createTask);
    submit("Dated", "2026-12-24");
    await waitFor(() => expect(screen.getByRole("list", { name: "Tasks" })).toBeInTheDocument());
    expect(createTask).toHaveBeenCalledWith({ title: "Dated", due_date: "2026-12-24" });
    expect(screen.getByText("2026-12-24")).toBeInTheDocument();
  });
});

describe("AC-001.4 title validation in the form", () => {
  it("AC-001.4 shows 'Enter a title' for whitespace and does not call createTask", async () => {
    const createTask = vi.fn();
    await renderBoard({ ok: true, tasks: [] }, createTask);
    submit("   ", "2026-02-02");
    expect(await screen.findByText("Enter a title")).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("   ");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-02-02");
  });

  it("AC-001.4 shows the too-long message for 201 code points and accepts 200 emoji", async () => {
    const createTask = vi.fn().mockResolvedValue({ ok: true, task: { id: "1", title: "x", due_date: null } });
    await renderBoard({ ok: true, tasks: [] }, createTask);
    const tooLong = "a".repeat(201);
    submit(tooLong);
    expect(await screen.findByText("Title can be at most 200 characters")).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue(tooLong);
    submit("😀".repeat(200));
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
  });
});

describe("AC-001.5 load failure", () => {
  it.each([
    ["network error", () => vi.fn().mockRejectedValue(new TypeError("fetch failed"))],
    ["timeout", () => vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))],
    ["500", () => vi.fn().mockResolvedValue(json({ detail: "boom" }, 500))],
    ["200 non-array", () => vi.fn().mockResolvedValue(json({ tasks: [] }))],
    ["200 not JSON", () => vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }))],
  ])("AC-001.5 shows the load error on %s", async (_name, make) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderPage(make());
    expect(screen.getByRole("alert")).toHaveTextContent("Tasks could not be loaded. Try again later.");
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.5 passes an abort signal to fetch so the 5 s timeout applies", async () => {
    const fetchStub = vi.fn().mockResolvedValue(json([]));
    await renderPage(fetchStub);
    expect(fetchStub.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("AC-001.6 save failure", () => {
  it("AC-001.6 shows the save error, keeps values and leaves the list unchanged", async () => {
    const createTask = vi.fn().mockResolvedValue({ ok: false, error: "unavailable" });
    await renderBoard({ ok: true, tasks: [{ id: "1", title: "Old", due_date: null }] }, createTask);
    submit("Keep me", "2026-03-03");
    expect(await screen.findByRole("alert")).toHaveTextContent("The task could not be saved. Try again.");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep me");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-03-03");
    expect(within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("AC-001.6 shows the save error when the action rejects", async () => {
    const createTask = vi.fn().mockRejectedValue(new Error("boom"));
    await renderBoard({ ok: true, tasks: [] }, createTask);
    submit("Keep me");
    expect(await screen.findByRole("alert")).toHaveTextContent("The task could not be saved. Try again.");
    expect(screen.getByLabelText("Title")).toHaveValue("Keep me");
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
  });
});
