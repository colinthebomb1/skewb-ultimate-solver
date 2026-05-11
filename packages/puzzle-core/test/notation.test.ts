import { describe, expect, it } from "vitest";
import { formatMove, invertAlgorithm, parseAlgorithm, parseMove } from "../src";

describe("notation parser", () => {
  it("parses basic Jaap-style moves", () => {
    expect(parseAlgorithm("L R D B")).toEqual([
      { axis: "L", amount: 1 },
      { axis: "R", amount: 1 },
      { axis: "D", amount: 1 },
      { axis: "B", amount: 1 },
    ]);
  });

  it("parses inverse moves", () => {
    expect(parseAlgorithm("L' R' D' B'")).toEqual([
      { axis: "L", amount: -1 },
      { axis: "R", amount: -1 },
      { axis: "D", amount: -1 },
      { axis: "B", amount: -1 },
    ]);
  });

  it("treats double turns as inverse direction for an order-3 move", () => {
    expect(parseMove("L2")).toEqual({ axis: "L", amount: -1 });
  });

  it("formats moves", () => {
    expect(formatMove({ axis: "D", amount: 1 })).toBe("D");
    expect(formatMove({ axis: "D", amount: -1 })).toBe("D'");
  });

  it("inverts algorithms", () => {
    expect(invertAlgorithm(parseAlgorithm("L R' D")).map(formatMove)).toEqual([
      "D'",
      "R",
      "L'",
    ]);
  });
});

