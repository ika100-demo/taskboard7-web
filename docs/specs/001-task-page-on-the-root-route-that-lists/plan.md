---
spec_id: 001-task-page-on-the-root-route-that-lists
shape: web-nextjs
spec_hash: f6e3a7170609
summary: Root page lists tasks from the Task API (server-rendered) and adds one through a Server Action
tasks:
  - id: t1
    title: Shared task types and title validation
    files: [app/_lib/tasks.ts, app/_lib/validate-title.ts]
    covers: [AC-001.4]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Task API client (config, timeout, shape checks, structured failure log)
    files: [app/_lib/config.ts, app/_lib/log.ts, app/_lib/task-api.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.5, AC-001.6]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t3
    title: TaskBoard client component (list, empty state, form, messages)
    files: [app/_components/task-board.tsx, app/globals.css]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: createTaskAction Server Action
    files: [app/actions.ts]
    covers: [AC-001.3, AC-001.4, AC-001.6]
    parallel_safe: true
    depends_on: [t1, t2]
    done: true
  - id: t5
    title: Replace the starter root page with the task page
    files: [app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.5]
    parallel_safe: false
    depends_on: [t2, t3, t4]
    done: true
---

# Plan — 001 Task page on the root route

Contract and DOM queries: [design.md](design.md). Levels: t1 → t2, t3 → t4 → t5. No gitops task: `API_URL` is wired
by the system plan ("Provided by the system").

## t1 — Shared task types and title validation

**Files:** app/_lib/tasks.ts, app/_lib/validate-title.ts
**Covers:** AC-001.4
**Goal:** the types every other module shares and the one validation rule, exactly as in design.md "Internal interfaces".

**Implementation notes:**
- `validate-title.ts`: export `TITLE_REQUIRED`, `TITLE_TOO_LONG`, `TitleError`, `validateTitle`. Empty/whitespace via `title.trim() === ""`; length in code points via `[...title].length > 200` (a 200-emoji title is valid).
- `tasks.ts`: types only (`Task`, `NewTask`, `ListResult`, `CreateTaskResult`), importing `TitleError` as a type. No runtime code, no server imports, so the client component can use it.

**Done when:** the AC-001.4 validation unit tests pass (empty, whitespace-only, 200 vs 201 code points, astral characters).

## t2 — Task API client

**Files:** app/_lib/config.ts, app/_lib/log.ts, app/_lib/task-api.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.5, AC-001.6
**Goal:** the only module that talks to the Task API, with the success/failure rules of the spec's "Errors" and "Timeouts".

**Implementation notes:**
- `config.ts`: `apiUrl()` reads `process.env.API_URL` on every call (tests use `vi.stubEnv`), default `http://localhost:8080`, strips trailing `/`.
- `log.ts`: `logError(fields)` writes `JSON.stringify({ level: "error", msg: "task_api_failed", ...fields })` via `console.error`.
- `task-api.ts`: `listTasks()` and `createTask()` exactly as design.md (method, headers, `cache: "no-store"`, `AbortSignal.timeout(5000)`, one `fetch`, no retry).
- Shape guard `isTask(x)`: non-empty string `id`, string `title`, `due_date` null or string. List success = 200 + array of tasks; create success = 201 + task.
- Classify failures as `http_status` / `bad_body` / `timeout` / `network` and log them; never log the title, body or `detail`.
- `docs/env-vars.md`: add `API_URL` under Core (default `http://localhost:8080`, server-only, cluster value `http://taskboard7-api` set by the gitops repo, never `NEXT_PUBLIC_`).

**Done when:** the client-level tests for AC-001.1 (order kept), AC-001.3 (body sent untrimmed, `due_date` null or date), AC-001.5 and AC-001.6 (non-200/201, 422, 503, bad JSON, wrong shape, network error, timeout -> `{ ok: false }`, one fetch, log line without title) pass.

## t3 — TaskBoard client component

**Files:** app/_components/task-board.tsx, app/globals.css
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6
**Goal:** the interactive part of the page, matching design.md "Page (DOM contract for tests)" and its submit steps.

**Implementation notes:**
- `"use client"`; props `{ initial: ListResult; createTask }`; import types from `@/app/_lib/tasks` and `validateTitle` from `@/app/_lib/validate-title` only (never `task-api.ts`).
- State: tasks (from `initial`), title, dueDate, titleError, saveError, pending (`useTransition` or a boolean).
- Render list / "No tasks yet" / load-error alert as specified; each item shows the title and `due_date` verbatim or "No due date".
- Controlled form with labels "Title" and "Due date", `aria-label="Add a task"`, submit "Add task" disabled while pending; title input has no `maxLength`/`required`.
- Submit: steps 1–5 of design.md; a rejected `createTask` promise is treated like `unavailable`.
- Styles: small additions in `globals.css` using the existing tokens (list, form row, error text); no new CSS file.

**Done when:** the component tests for AC-001.1–AC-001.6 pass with a mocked `createTask` (append at end + form cleared, no call on invalid title, save error keeps values and list).

## t4 — createTaskAction Server Action

**Files:** app/actions.ts
**Covers:** AC-001.3, AC-001.4, AC-001.6
**Goal:** the server entry point the form calls.

**Implementation notes:**
- `"use server"` at the top; export only `createTaskAction(input: NewTask): Promise<CreateTaskResult>`.
- Re-validate with `validateTitle`; on error return `{ ok: false, error: "invalid", message }` without calling the API.
- Otherwise call `createTask(input)` (title untouched); map success to `{ ok: true, task }`, failure to `{ ok: false, error: "unavailable" }`. Never throw for an upstream failure.

**Done when:** action tests pass: invalid title makes no fetch; 201 returns the task; 422/503/timeout return `unavailable`.

## t5 — Replace the starter root page

**Files:** app/page.tsx, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.5
**Goal:** the root route renders the task page from the server on every request.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; async default export `HomePage` renders `<h1>Tasks</h1>` and `<TaskBoard initial={await listTasks()} createTask={createTaskAction} />`. Replace all starter content.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (only the starter page used them; the icons' notice says delete both together).
- `tests/page.test.tsx` (existing starter test, not an acceptance test): rewrite to the new page (h1 "Tasks", one h1) using `render(await HomePage())` with `fetch` stubbed, or delete what the acceptance tests already cover.
- `e2e/home.spec.ts`: change the h1 expectation to "Tasks" and drop the "Check health" link check (keep the `/api/health` request check, 404 and phone-width tests). It runs without a Task API, so the page shows the load error; that must not break the layout tests.
- `e2e/smoke.spec.ts` stays as is (read-only, any visible h1).

**Done when:** all acceptance tests pass, `devbox run ci` is green (coverage >= 80%), and `devbox run e2e` passes.
