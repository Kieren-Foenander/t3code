import type { BoardObject } from "@t3tools/contracts";

export function mobileBoardContentSize(
  objects: ReadonlyArray<BoardObject>,
  viewport: { readonly width: number; readonly height: number },
) {
  return {
    width: Math.max(
      viewport.width,
      900,
      ...objects.map((object) => object.position.x + object.size.width + 40),
    ),
    height: Math.max(
      viewport.height,
      900,
      ...objects.map((object) => object.position.y + object.size.height + 40),
    ),
  };
}

export function mobileThreadBoardStatus(input: {
  readonly running: boolean;
  readonly settled: boolean;
  readonly blocked: boolean;
  readonly planStep?: string | undefined;
}): string {
  if (input.blocked) return "Waiting for user input";
  if (input.planStep) return input.planStep;
  if (input.running) return "Running";
  return input.settled ? "Complete" : "Ready";
}
