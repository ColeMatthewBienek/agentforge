import { useRef, useEffect, useState, useCallback } from "react";
import type { TaskSpec, PoolSlot } from "@/store/agentStore";
import { TaskNode } from "./TaskNode";
import { computeStages } from "@/lib/dagUtils";

interface TaskDAGProps {
  tasks: TaskSpec[];
  slots: PoolSlot[];
}

interface ArrowData {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceComplete: boolean;
}

export function TaskDAG({ tasks, slots }: TaskDAGProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrows, setArrows] = useState<ArrowData[]>([]);

  const stages = computeStages(tasks);

  const slotByTask: Record<string, PoolSlot> = Object.fromEntries(
    slots.filter((s) => s.current_task_id).map((s) => [s.current_task_id!, s])
  );

  const measureArrows = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const newArrows: ArrowData[] = [];

    for (const task of tasks) {
      const targetEl = nodeRefs.current.get(task.id);
      if (!targetEl) continue;
      const targetRect = targetEl.getBoundingClientRect();

      for (const depId of task.dependencies) {
        const sourceEl = nodeRefs.current.get(depId);
        if (!sourceEl) continue;
        const sourceRect = sourceEl.getBoundingClientRect();
        const sourceDep = tasks.find((t) => t.id === depId);

        newArrows.push({
          x1: sourceRect.right - container.left,
          y1: sourceRect.top + sourceRect.height / 2 - container.top,
          x2: targetRect.left - container.left,
          y2: targetRect.top + targetRect.height / 2 - container.top,
          sourceComplete: sourceDep?.status === "complete",
        });
      }
    }
    setArrows(newArrows);
  }, [tasks]);

  useEffect(() => {
    measureArrows();
    window.addEventListener("resize", measureArrows);
    return () => window.removeEventListener("resize", measureArrows);
  }, [measureArrows, tasks]);

  return (
    <div ref={containerRef} className="relative flex gap-8 items-start min-h-full pb-8">
      {/* SVG arrow overlay */}
      <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ width: "100%", height: "100%" }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#30363d" />
          </marker>
          <marker id="arrowhead-complete" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#238636" />
          </marker>
        </defs>
        {arrows.map((a, i) => (
          <path
            key={i}
            d={`M ${a.x1} ${a.y1} C ${(a.x1 + a.x2) / 2} ${a.y1}, ${(a.x1 + a.x2) / 2} ${a.y2}, ${a.x2} ${a.y2}`}
            stroke={a.sourceComplete ? "#238636" : "#30363d"}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray={a.sourceComplete ? undefined : "4,3"}
            markerEnd={`url(#arrowhead${a.sourceComplete ? "-complete" : ""})`}
            opacity={0.7}
          />
        ))}
      </svg>

      {/* Stage columns */}
      {stages.map((stageTasks, stageIndex) => (
        <div key={stageIndex} className="flex flex-col gap-3 min-w-[200px] max-w-[240px]">
          <div className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-widest px-1">
            {stageIndex === 0 ? "parallel" : `stage ${stageIndex + 1}`}
          </div>
          {stageTasks.map((task) => (
            <TaskNode
              key={task.id}
              task={task}
              slot={slotByTask[task.id] ?? null}
              ref={(el) => {
                if (el) nodeRefs.current.set(task.id, el);
                else nodeRefs.current.delete(task.id);
              }}
              onMeasure={measureArrows}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
