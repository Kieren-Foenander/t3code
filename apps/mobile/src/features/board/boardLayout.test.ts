import { describe, expect, it } from "vite-plus/test";

import { mobileBoardContentSize, mobileThreadBoardStatus } from "./boardLayout";

describe("mobile board layout", () => {
  it("adapts the supervisory canvas to the viewport and object bounds", () => {
    expect(mobileBoardContentSize([], { width: 1_100, height: 700 })).toEqual({
      width: 1_100,
      height: 900,
    });
  });

  it("prioritizes blockers and current plan work in thread summaries", () => {
    expect(
      mobileThreadBoardStatus({ running: true, settled: false, blocked: true, planStep: "Build" }),
    ).toBe("Waiting for user input");
    expect(
      mobileThreadBoardStatus({ running: true, settled: false, blocked: false, planStep: "Build" }),
    ).toBe("Build");
  });
});
