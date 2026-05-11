import { describe, expect, it } from "vitest";
import { createSolvedState } from "@skewb-ultimate/puzzle-core";
import { randomWalkSolver } from "../src";

describe("solver interface", () => {
  it("returns a placeholder result for the random walk solver", async () => {
    const result = await randomWalkSolver().solve(createSolvedState());

    expect(result.status).toBe("not-implemented");
    expect(result.solution).toEqual([]);
  });
});

