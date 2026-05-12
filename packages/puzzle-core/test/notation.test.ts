import { describe, expect, it } from "vitest";
import {
  formatAlgorithm,
  formatMove,
  invertAlgorithm,
  parseAlgorithm,
  parseMove,
  simplifyAlgorithm,
} from "../src";

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

  it("formats algorithms", () => {
    expect(formatAlgorithm(parseAlgorithm("L R' D"))).toBe("L R' D");
  });

  it("inverts algorithms", () => {
    expect(invertAlgorithm(parseAlgorithm("L R' D")).map(formatMove)).toEqual([
      "D'",
      "R",
      "L'",
    ]);
  });

  it("simplifies adjacent moves with order-3 turn rules", () => {
    expect(formatAlgorithm(simplifyAlgorithm(parseAlgorithm("L L")))).toBe("L'");
    expect(formatAlgorithm(simplifyAlgorithm(parseAlgorithm("L L L")))).toBe("");
    expect(formatAlgorithm(simplifyAlgorithm(parseAlgorithm("L L'")))).toBe("");
    expect(formatAlgorithm(simplifyAlgorithm(parseAlgorithm("L R R R L'")))).toBe("");
  });
});
