import { describe, it, expect } from "vitest";
import { computeStages, getEdges } from "@/lib/dagUtils";
import type { TaskSpec } from "@/store/agentStore";

function t(id: string, deps: string[] = []): TaskSpec {
  return {
    id,
    session_id: "plan-1",
    title: `Task ${id}`,
    prompt: `Do ${id}`,
    status: "pending",
    complexity: "low",
    dependencies: deps,
    slot_id: null,
    worktree_path: null,
    error: null,
    created_at: "2024-01-01T00:00:00",
    completed_at: null,
  };
}

describe("computeStages", () => {
  it("computeStages_empty_returns_empty", () => {
    expect(computeStages([])).toEqual([]);
  });

  it("computeStages_no_deps_all_in_stage_0", () => {
    const stages = computeStages([t("a"), t("b"), t("c")]);
    expect(stages).toHaveLength(1);
    expect(stages[0].map((x) => x.id)).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("computeStages_linear_chain_each_in_own_stage", () => {
    const stages = computeStages([t("a"), t("b", ["a"]), t("c", ["b"])]);
    expect(stages).toHaveLength(3);
    expect(stages[0][0].id).toBe("a");
    expect(stages[1][0].id).toBe("b");
    expect(stages[2][0].id).toBe("c");
  });

  it("computeStages_diamond_pattern_correct_stages", () => {
    // a → b, a → c, b → d, c → d
    const stages = computeStages([t("a"), t("b", ["a"]), t("c", ["a"]), t("d", ["b", "c"])]);
    expect(stages).toHaveLength(3);
    expect(stages[0][0].id).toBe("a");
    expect(stages[1].map((x) => x.id)).toEqual(expect.arrayContaining(["b", "c"]));
    expect(stages[2][0].id).toBe("d");
  });

  it("computeStages_mixed_deps_correct_ordering", () => {
    // t1 (no dep), t2 (dep t1), t3 (no dep) → stages: [t1,t3], [t2]
    const stages = computeStages([t("t1"), t("t2", ["t1"]), t("t3")]);
    expect(stages).toHaveLength(2);
    expect(stages[0].map((x) => x.id)).toEqual(expect.arrayContaining(["t1", "t3"]));
    expect(stages[1][0].id).toBe("t2");
  });
});

describe("getEdges", () => {
  it("getEdges_no_deps_returns_empty", () => {
    expect(getEdges([t("a"), t("b")])).toEqual([]);
  });

  it("getEdges_returns_correct_from_to_pairs", () => {
    const edges = getEdges([t("a"), t("b", ["a"]), t("c", ["a", "b"])]);
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ])
    );
    expect(edges).toHaveLength(3);
  });
});
