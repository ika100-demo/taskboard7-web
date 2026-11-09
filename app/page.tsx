import { createTaskAction } from "@/app/actions";
import { TaskBoard } from "@/app/_components/task-board";
import { listTasks } from "@/app/_lib/task-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <>
      <h1>Tasks</h1>
      <TaskBoard initial={await listTasks()} createTask={createTaskAction} />
    </>
  );
}
