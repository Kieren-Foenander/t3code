import { describe, expect, it } from "vite-plus/test";

import { resolveBoardSemanticLevel } from "./BoardSemanticZoom";

describe("board semantic zoom", () => {
  it("selects stable status, summary, and interactive levels", () => {
    expect(resolveBoardSemanticLevel({ frameSize: "standard", renderedWidth: 260 })).toBe("status");
    expect(resolveBoardSemanticLevel({ frameSize: "standard", renderedWidth: 440 })).toBe(
      "summary",
    );
    expect(resolveBoardSemanticLevel({ frameSize: "standard", renderedWidth: 640 })).toBe(
      "interactive",
    );
  });

  it("uses hysteresis around both boundaries", () => {
    expect(
      resolveBoardSemanticLevel({ frameSize: "standard", renderedWidth: 320, previous: "status" }),
    ).toBe("status");
    expect(
      resolveBoardSemanticLevel({
        frameSize: "standard",
        renderedWidth: 570,
        previous: "interactive",
      }),
    ).toBe("interactive");
  });

  it("accounts for compact and wide frame sizes", () => {
    expect(resolveBoardSemanticLevel({ frameSize: "compact", renderedWidth: 360 })).toBe("status");
    expect(resolveBoardSemanticLevel({ frameSize: "wide", renderedWidth: 500 })).toBe(
      "interactive",
    );
  });
});
