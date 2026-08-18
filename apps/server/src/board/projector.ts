import type { BoardObject } from "@t3tools/contracts";

import type { BoardDomainEvent } from "./decider.ts";

export function projectBoardEvent(
  objects: ReadonlyArray<BoardObject>,
  event: BoardDomainEvent,
): ReadonlyArray<BoardObject> {
  if (event.type === "board.relationship-created" || event.type === "board.grant-updated") {
    return objects;
  }
  if (event.type === "board.object-updated") {
    return [...objects.filter((object) => object.id !== event.object.id), event.object];
  }
  if (event.type === "board.object-created") {
    return [...objects.filter((object) => object.id !== event.object.id), event.object];
  }
  return objects.map((object) =>
    object.id === event.objectId
      ? {
          ...object,
          position: event.position,
          revision: event.revision,
          updatedAt: event.occurredAt,
        }
      : object,
  );
}
