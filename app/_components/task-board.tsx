"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { CreateTaskResult, ListResult, NewTask, Task } from "@/app/_lib/tasks";
import { validateTitle } from "@/app/_lib/validate-title";

export type TaskBoardProps = {
  initial: ListResult;
  createTask: (input: NewTask) => Promise<CreateTaskResult>;
};

export function TaskBoard({ initial, createTask }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>(initial.ok ? initial.tasks : []);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTitleError(null);
    setSaveError(false);
    const error = validateTitle(title);
    if (error) {
      setTitleError(error);
      return;
    }
    setPending(true);
    try {
      const result = await createTask({ title, due_date: dueDate === "" ? null : dueDate });
      if (result.ok) {
        setTasks((prev) => [...prev, result.task]);
        setTitle("");
        setDueDate("");
      } else if (result.error === "invalid") {
        setTitleError(result.message);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="task-board">
      {!initial.ok ? (
        <p role="alert" className="form-error">
          Tasks could not be loaded. Try again later.
        </p>
      ) : tasks.length === 0 ? (
        <p className="task-empty">No tasks yet</p>
      ) : (
        <ul aria-label="Tasks" className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="task-item">
              <span className="task-title">{task.title}</span>
              <span className="task-due">{task.due_date ?? "No due date"}</span>
            </li>
          ))}
        </ul>
      )}

      <form aria-label="Add a task" className="task-form" onSubmit={onSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="task-title">Title</label>
          <input
            id="task-title"
            type="text"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={titleError ? "true" : undefined}
            aria-describedby={titleError ? "title-error" : undefined}
          />
          {titleError ? (
            <p id="title-error" className="form-error">
              {titleError}
            </p>
          ) : null}
        </div>
        <div className="form-field">
          <label htmlFor="task-due-date">Due date</label>
          <input
            id="task-due-date"
            type="date"
            name="due_date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Add task
        </button>
        {saveError ? (
          <p role="alert" className="form-error">
            The task could not be saved. Try again.
          </p>
        ) : null}
      </form>
    </div>
  );
}
