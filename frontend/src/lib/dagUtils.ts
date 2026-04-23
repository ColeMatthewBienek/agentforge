import type { TaskSpec } from "@/store/agentStore";

export function computeStages(tasks: TaskSpec[]): TaskSpec[][] {
  if (tasks.length === 0) return [];

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const stageCache = new Map<string, number>();

  function stageOf(id: string): number {
    if (stageCache.has(id)) return stageCache.get(id)!;
    const task = taskMap.get(id);
    if (!task || task.dependencies.length === 0) {
      stageCache.set(id, 0);
      return 0;
    }
    const stage = Math.max(...task.dependencies.map(stageOf)) + 1;
    stageCache.set(id, stage);
    return stage;
  }

  tasks.forEach((t) => stageOf(t.id));

  const maxStage = Math.max(0, ...Array.from(stageCache.values()));
  const stages: TaskSpec[][] = Array.from({ length: maxStage + 1 }, () => []);
  tasks.forEach((t) => stages[stageCache.get(t.id)!].push(t));
  return stages;
}

export function getEdges(tasks: TaskSpec[]): Array<{ from: string; to: string }> {
  const edges: Array<{ from: string; to: string }> = [];
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      edges.push({ from: dep, to: task.id });
    }
  }
  return edges;
}
