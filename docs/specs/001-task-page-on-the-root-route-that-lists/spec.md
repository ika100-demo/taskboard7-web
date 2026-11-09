---
spec_id: 001-task-page-on-the-root-route-that-lists
title: Task page on the root route that lists tasks and adds a task through the Task API
status: building
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard7-gitops:001-persistent-tasks-in-postgres-with-web-ui
---

# 001 — Task page on the root route that lists tasks and adds a task through the Task API

## Problem

The taskboard7 Task API can create and list tasks, but keeps them in memory: every restart or redeploy empties the board, and two instances of the API would each show a different list. People also have no way to use the board except by calling the API by hand, because the web front end has no task features yet. Keeping tasks in a Postgres database and giving the web app a task page turns the board into something people can actually rely on and use.

## System context

Slice of the system plan `001-persistent-tasks-in-postgres-with-web-ui` in `ika100-demo/taskboard7-gitops` for `taskboard7-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.5** Given tasks exist, when a person opens the web app's root page, then it shows every task, oldest first, each with its title and its due date as `YYYY-MM-DD`, or "No due date" when it has none; given no task exists, the page shows "No tasks yet".
- **AC-001.6** Given the web app's root page, when a person enters a title and optionally picks a due date and submits the form, then the new task appears at the end of the list without a manual page reload, the form is cleared, and a following `GET /tasks` on the Task API contains the task with that title and due date.
- **AC-001.7** Given the create form, when a person submits a title that is empty, only whitespace or longer than 200 characters, then the form shows "Enter a title" or "Title can be at most 200 characters" respectively next to the title field, keeps the entered values, and no task is created.
- **AC-001.8** Given the Task API cannot be reached or answers with an error, when a person opens the root page, then it shows "Tasks could not be loaded. Try again later." instead of the list; and when a person submits the create form, then it shows "The task could not be saved. Try again." and keeps the entered values.

### Contract

Caller: the taskboard7-web **server** (never the browser). Callee: taskboard7-api at `API_URL` (cluster:
`http://taskboard7-api`). JSON over HTTP, `Content-Type: application/json`, UTF-8. No authentication (non-goal).
Unchanged from the Task API's component spec 001; no version prefix.

**Task** object: `{"id": string, "title": string, "due_date": "YYYY-MM-DD" | null}`. `id` is an opaque, non-empty,
server-generated string (today a uuid4); clients must not parse it. `due_date` is always present, `null` when unset.

`POST /tasks`
- Request: `{"title": string, "due_date": "YYYY-MM-DD" | null}`; `due_date` may be omitted (= null). Unknown fields
  are ignored.
- `title`: a string of 1 to 200 characters (Unicode code points) with at least one non-whitespace character, stored
  exactly as sent (no trimming). `due_date`: a calendar date `YYYY-MM-DD`, no time, past dates allowed.
- `201`: the created Task.
- `422`: invalid input, FastAPI's standard shape `{"detail": [{"loc": ["body", "<field>"], "msg": ..., "type": ...}]}`
  naming `title` or `due_date`. Validation runs before any database access, so invalid input answers 422 even when
  the database is down. Nothing is stored.
- `503`: the database is unreachable or too slow: `{"detail": "Database unavailable"}`. Nothing is stored.

`GET /tasks`
- `200`: a JSON array of all Tasks, oldest first (creation order), no paging; `[]` when there are none.
- `503`: `{"detail": "Database unavailable"}`.

`GET /ready` (platform probe, not called by the web app)
- `200 {"status": "ready"}` when a `SELECT 1` on the database succeeds within 1 s; otherwise
  `503 {"status": "not ready"}`. `GET /health` stays `200 {"status": "ok"}` regardless of the database.

No events.

### Errors

- The Task API's error bodies are JSON with a `detail` field: a list of validation items for `422`, a string for
  `503` (and for any other framework error such as `404`/`405`/`500`).
- The web app treats exactly two responses as success: `200` with a JSON array for `GET /tasks`, `201` with a Task
  object for `POST /tasks`. Every other outcome — any other status (`422`, `503`, `5xx`, `4xx`), a body that is not
  the expected JSON, a connection error or a timeout — is a failure: the page shows "Tasks could not be loaded. Try
  again later." (list) or "The task could not be saved. Try again." (create, values kept). The web app never shows
  the API's `detail` text and never retries a `POST`.
- The web app logs the failure (status or error kind) server-side as structured JSON, without the task title.

### Timeouts

- web -> `GET /tasks`: 5 s total per request, no retry; on timeout the list error message is shown.
- web -> `POST /tasks`: 5 s total per request, no retry (a retry could create a duplicate task); on timeout the save
  error message is shown. A create that timed out on the web side may still have been stored; it shows up on the next
  page load.
- Task API -> Postgres: connect timeout 2 s, statement timeout 3 s, so the API answers `503` within 5 s and before the
  web app gives up; `/ready` checks with a 1 s timeout. The API keeps no request waiting on a dead database: each
  request tries a (pooled) connection and fails fast; it reconnects by itself on the next request once the database is
  back.
- Database down: the Task API stays up (`/health` 200), reports not ready (Kubernetes removes it from the Service),
  and the web app shows the AC-001.8 messages. The web app's own `/api/ready` does not depend on the Task API.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `API_URL=http://taskboard7-api`

### Notes for this repo

The browser never calls the Task API: the Next.js server does, at the base URL from the server-only env var
API_URL (default http://localhost:8080 for local dev; set to http://taskboard7-api in the cluster; never a
NEXT_PUBLIC_ variable). Render the list on the server (dynamic, no caching) and submit the form through a Server
Action or an app/api route handler that calls POST /tasks and returns the created task to a client component.
Replace the starter content of app/page.tsx; document API_URL in docs/env-vars.md. Unit/e2e tests stub the
Task API (contract below); no live API needed.

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the Task API's GET /tasks returns tasks, when a person opens the root page, then it lists every task in the order the API returns them (oldest first), each with its title and its due_date as YYYY-MM-DD, or "No due date" when due_date is null (system AC-001.5)
- **AC-001.2** Given the Task API's GET /tasks returns [], when a person opens the root page, then it shows "No tasks yet" and the create form (system AC-001.5)
- **AC-001.3** Given the root page, when a person enters a valid title, optionally picks a due date in the date picker and submits, then the web app sends POST /tasks with {"title": <as entered, not trimmed>, "due_date": "YYYY-MM-DD" or null} to the Task API, and on 201 the returned task appears at the end of the list without a page reload and the form is cleared (system AC-001.6)
- **AC-001.4** Given the create form, when a person submits a title that is empty or only whitespace, then "Enter a title" is shown next to the title field; when the title is longer than 200 characters (Unicode code points), then "Title can be at most 200 characters" is shown there; in both cases the entered values stay and no POST /tasks is sent (system AC-001.7)
- **AC-001.5** Given the Task API is unreachable, does not answer within 5 seconds, or answers GET /tasks with anything but 200 and a JSON array, when a person opens the root page, then it shows "Tasks could not be loaded. Try again later." instead of the list (system AC-001.8)
- **AC-001.6** Given the Task API is unreachable, does not answer within 5 seconds, or answers POST /tasks with anything but 201 (including 422 and 503), when a person submits the create form, then it shows "The task could not be saved. Try again.", keeps the entered values and leaves the list unchanged (system AC-001.8)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

## Changelog

- 2026-11-09 created from the system plan, with its criteria (spec 147)
- 2026-11-09 approved
- 2026-11-09 building
