import type { BoardFrameSize } from "@t3tools/contracts";

export type BoardSemanticLevel = "status" | "summary" | "interactive";

const FRAME_SIZE_FACTOR: Record<BoardFrameSize, number> = {
  compact: 0.8,
  standard: 1,
  wide: 1.25,
};

export function resolveBoardSemanticLevel(input: {
  readonly frameSize: BoardFrameSize;
  readonly renderedWidth: number;
  readonly previous?: BoardSemanticLevel;
}): BoardSemanticLevel {
  const effectiveWidth = input.renderedWidth * FRAME_SIZE_FACTOR[input.frameSize];
  if (input.previous === "status") {
    if (effectiveWidth < 340) return "status";
  } else if (effectiveWidth < 300) {
    return "status";
  }
  if (input.previous === "interactive") {
    if (effectiveWidth >= 540) return "interactive";
  } else if (effectiveWidth >= 600) {
    return "interactive";
  }
  return "summary";
}
