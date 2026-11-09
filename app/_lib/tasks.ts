import type { TitleError } from "./validate-title";

export type Task = { id: string; title: string; due_date: string | null };
export type NewTask = { title: string; due_date: string | null };
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateTaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: "invalid"; message: TitleError }
  | { ok: false; error: "unavailable" };
