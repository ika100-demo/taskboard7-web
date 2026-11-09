# Design — 001 Task page on the root route

## Decisions

- **Server-side list, Server Action for create.** `app/page.tsx` is an async Server Component with
  `export const dynamic = "force-dynamic"` that calls `GET /tasks` on every request (`cache: "no-store"`). The create
  form lives in one client component that calls a Server Action; the action calls `POST /tasks` and returns the result
  object below. No `app/api/tasks` route handler: the action keeps the Task API off the browser's network path (Notes for
  this repo) without adding a public JSON endpoint of our own.
- **The action is passed as a prop** (`createTask`) from the page to the client component, so the component can be
  tested with a plain mock and never imports server code.
- **One Task API client module** (`app/_lib/task-api.ts`) owns `API_URL`, the 5 s timeout
  (`AbortSignal.timeout(5000)`), response shape checks and failure logging. Nothing else calls `fetch`. It never
  retries (spec Timeouts).
- **Validation is shared** (`app/_lib/validate-title.ts`): the client component runs it before calling the action
  (so no `POST /tasks` is sent, AC-001.4) and the action runs it again before calling the API (defence; a crafted
  request gets the same messages, never a 422 from upstream).
- **Library code lives under `app/_lib/`** (private folder, next to `app/_components/`), so the existing coverage
  include (`app/**`) measures it. No new dependency.
- **Due dates are rendered as the API's string**, never parsed into `Date` (parsing `YYYY-MM-DD` shifts by time zone).
  The date picker is `<input type="date">`, whose value is already `YYYY-MM-DD` or `""` (= `null`).
- **When the list failed to load, the form still shows.** A successful create then clears the form but the list error
  stays (the list is unknown); the new task shows up on the next page load.
- No ADR: every choice here is local to this feature.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/tasks.ts` | `Task`, `NewTask`, `ListResult`, `CreateTaskResult` types (shared by server and client) | new |
| `app/_lib/validate-title.ts` | `validateTitle(title)` and the two message constants | new |
| `app/_lib/config.ts` | `apiUrl()`: `API_URL` or `http://localhost:8080`, trailing `/` stripped, read per call | new |
| `app/_lib/log.ts` | `logError(fields)`: one JSON line via `console.error` | new |
| `app/_lib/task-api.ts` | `listTasks()`, `createTask()` against the Task API (server only) | new |
| `app/actions.ts` | `"use server"` `createTaskAction(input)` | new |
| `app/_components/task-board.tsx` | `"use client"` list + form + messages | new |
| `app/page.tsx` | async Server Component: loads the list, renders `TaskBoard` | changed (starter content replaced) |
| `app/_components/feature-card.tsx`, `icons.tsx` | starter-only | deleted |
| `docs/env-vars.md` | documents `API_URL` | changed |

## Contract

### Upstream (Task API, binding, from the spec)

Unchanged; see spec "Contract", "Errors", "Timeouts". The web server is the only caller.

### Internal interfaces (what the acceptance tests target)

```ts
// app/_lib/validate-title.ts
export const TITLE_REQUIRED = "Enter a title";
export const TITLE_TOO_LONG = "Title can be at most 200 characters";
export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;
export function validateTitle(title: string): TitleError | null;
//   title.trim() === ""            -> TITLE_REQUIRED
//   [...title].length > 200        -> TITLE_TOO_LONG   (Unicode code points, not UTF-16 units)
//   otherwise                      -> null

// app/_lib/tasks.ts   (types only, safe to import from client code)
export type Task = { id: string; title: string; due_date: string | null };
export type NewTask = { title: string; due_date: string | null };
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: "invalid"; message: TitleError }   // our own validation, no API call made
  | { ok: false; error: "unavailable" };                    // any upstream failure (AC-001.6)

// app/_lib/config.ts
export function apiUrl(): string;   // process.env.API_URL ?? "http://localhost:8080", no trailing "/"

// app/_lib/task-api.ts   (server only; imported by app/page.tsx and app/actions.ts only)
export function listTasks(): Promise<ListResult>;
export function createTask(input: NewTask): Promise<{ ok: true; task: Task } | { ok: false }>;

// app/actions.ts
"use server";
export async function createTaskAction(input: NewTask): Promise<CreateTaskResult>;
//   validateTitle(input.title) !== null -> { ok:false, error:"invalid", message }, no fetch
//   else createTask(input): ok -> { ok:true, task }, failure -> { ok:false, error:"unavailable" }

// app/_components/task-board.tsx
"use client";
export function TaskBoard(props: {
  initial: ListResult;
  createTask: (input: NewTask) => Promise<CreateTaskResult>;
}): JSX.Element;
```

`listTasks()`:
- `fetch(`${apiUrl()}/tasks`, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) })`.
- Success only when status is `200` and the body parses as a JSON array whose every item has a non-empty string `id`,
  a string `title`, and `due_date` that is `null` or a string. Order is kept as returned (AC-001.1).
- Anything else (other status, non-JSON, wrong shape, network error, abort/timeout) -> `{ ok: false }` (AC-001.5).

`createTask(input)`:
- `fetch(`${apiUrl()}/tasks`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ title: input.title, due_date: input.due_date }), cache: "no-store", signal: AbortSignal.timeout(5000) })`.
- The title is sent exactly as entered, never trimmed; `due_date` is `"YYYY-MM-DD"` or `null` (AC-001.3).
- Success only on `201` with a body that is a Task (same shape check). Anything else, including `422` and `503`,
  -> `{ ok: false }` (AC-001.6). Exactly one `fetch` per call: no retry.

Failure log (both functions), one line via `console.error`:

```json
{"level":"error","msg":"task_api_failed","op":"list","status":503,"error":"http_status"}
```

`op` is `"list"` or `"create"`; `error` is `"http_status"`, `"bad_body"`, `"timeout"` or `"network"`; `status` is
present only for `http_status` and `bad_body`. The title, the request body and the API's `detail` are never logged or
shown. `timeout` = the abort from `AbortSignal.timeout` (`TimeoutError`/`AbortError`); `network` = any other thrown error.

### Page (DOM contract for tests)

`app/page.tsx` (default export `HomePage`, async, `dynamic = "force-dynamic"`) renders one `<h1>Tasks</h1>` and
`<TaskBoard initial={await listTasks()} createTask={createTaskAction} />`.

`TaskBoard` renders:

| Element | Accessible query | When |
|---|---|---|
| Task list | `getByRole("list", { name: "Tasks" })` (`<ul aria-label="Tasks">`) | `initial.ok` and at least one task (or one was created) |
| Task item | `listitem` inside it; text contains the title and either the `due_date` string verbatim or `No due date` | per task, API order, created ones appended at the end |
| Empty state | text `No tasks yet` | `initial.ok` and no tasks (list not rendered) |
| Load error | `getByRole("alert")` with text `Tasks could not be loaded. Try again later.` | `!initial.ok` (no list, no empty state) |
| Form | `getByRole("form", { name: "Add a task" })` (`<form aria-label="Add a task">`) | always |
| Title field | `getByLabelText("Title")`, `<input type="text" name="title">`, no `maxLength`, no `required` (our messages, not the browser's) | always |
| Title error | text `Enter a title` / `Title can be at most 200 characters` in `<p id="title-error">`; the input gets `aria-invalid="true"` and `aria-describedby="title-error"` | after a submit that fails validation; cleared on the next submit |
| Due date field | `getByLabelText("Due date")`, `<input type="date" name="due_date">`, optional | always |
| Submit | `getByRole("button", { name: "Add task" })`, disabled while a create is pending | always |
| Save error | `getByRole("alert")` with text `The task could not be saved. Try again.` | after `{ ok:false, error:"unavailable" }` or a rejected action; cleared on the next submit |

Behaviour on submit (prevent default, no navigation, no reload):
1. Clear both error messages. `validateTitle(title)`; on an error show it, keep values, do not call `createTask` (AC-001.4).
2. Call `createTask({ title, due_date: dueDate === "" ? null : dueDate })` once, title untrimmed.
3. `ok: true` -> append `task` to the list (an empty state turns into the list), clear both fields (AC-001.3).
4. `error: "invalid"` -> show `message` as the title error, keep values.
5. `error: "unavailable"`, or the action promise rejects -> show the save error, keep values, list unchanged (AC-001.6).

## Testing notes

- Acceptance tests are Vitest: the page via `render(await HomePage())` with `fetch` stubbed (`vi.stubGlobal`) and
  `API_URL` set through `vi.stubEnv`; `TaskBoard` with a mocked `createTask`; `task-api.ts` / `actions.ts` directly
  with a stubbed `fetch`. The timeout is tested by a `fetch` stub that rejects with a `DOMException` named
  `TimeoutError`, and by asserting `fetch` received an `AbortSignal` (no real 5 s wait).
- E2E: the Next server calls the API from the server, so Playwright `page.route` cannot stub it; no e2e acceptance
  test is planned. `e2e/home.spec.ts` is updated to the new page (it runs with no API, so it sees the load error).
  `e2e/smoke.spec.ts` (an `<h1>` is visible) keeps passing unchanged and stays read-only.

## Risks

- A create that timed out may still be stored upstream (spec Timeouts); a user retry may create a duplicate. Accepted
  by the spec; the disabled button prevents double submits within one request.
