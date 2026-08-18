import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { BoardCommand, BoardSnapshot } from "./board.ts";

const decodeBoardCommand = Schema.decodeUnknownEffect(BoardCommand);
const decodeBoardSnapshot = Schema.decodeUnknownEffect(BoardSnapshot);

it.effect("decodes a revision-aware board move command", () =>
  Effect.gen(function* () {
    const command = yield* decodeBoardCommand({
      type: "board.object.move",
      commandId: "move-1",
      projectId: "project-1",
      objectId: "thread:thread-1",
      position: { x: 120, y: -40 },
      expectedRevision: 3,
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    assert.strictEqual(command.type, "board.object.move");
    if (command.type !== "board.object.move") return;
    assert.deepStrictEqual(command.position, { x: 120, y: -40 });
  }),
);

it.effect("decodes spatial thread placement with provenance", () =>
  Effect.gen(function* () {
    const command = yield* decodeBoardCommand({
      type: "board.thread-frame.place",
      commandId: "place-1",
      projectId: "project-1",
      threadId: "thread-2",
      parentThreadId: "thread-1",
      position: { x: 520, y: 0 },
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    assert.strictEqual(command.type, "board.thread-frame.place");
  }),
);

it.effect("decodes an isolated board snapshot", () =>
  Effect.gen(function* () {
    const snapshot = yield* decodeBoardSnapshot({
      projectId: "project-1",
      sequence: 2,
      objects: [
        {
          id: "thread:thread-1",
          projectId: "project-1",
          kind: "thread-frame",
          threadId: "thread-1",
          position: { x: 0, y: 0 },
          size: { width: 440, height: 560 },
          frameSize: "standard",
          revision: 1,
          createdAt: "2026-08-17T00:00:00.000Z",
          updatedAt: "2026-08-17T00:00:00.000Z",
          tombstonedAt: null,
        },
      ],
      relationships: [],
      grants: [],
      authority: {
        projectId: "project-1",
        defaultReadScope: "own",
        defaultWriteAuthority: "own",
        updatedAt: "2026-08-17T00:00:00.000Z",
      },
    });
    assert.strictEqual(snapshot.objects[0]?.kind, "thread-frame");
  }),
);

it.effect("rejects non-positive board object dimensions", () =>
  Effect.gen(function* () {
    const result = yield* Effect.result(
      decodeBoardSnapshot({
        projectId: "project-1",
        sequence: 0,
        objects: [
          {
            id: "thread:thread-1",
            projectId: "project-1",
            kind: "thread-frame",
            threadId: "thread-1",
            position: { x: 0, y: 0 },
            size: { width: 0, height: 560 },
            frameSize: "standard",
            revision: 1,
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
            tombstonedAt: null,
          },
        ],
        relationships: [],
        grants: [],
        authority: {
          projectId: "project-1",
          defaultReadScope: "own",
          defaultWriteAuthority: "own",
          updatedAt: "2026-08-17T00:00:00.000Z",
        },
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("decodes revision-aware artifact and relationship edits", () =>
  Effect.gen(function* () {
    const resize = yield* decodeBoardCommand({
      type: "board.object.update",
      commandId: "resize-1",
      projectId: "project-1",
      objectId: "group:1",
      size: { width: 800, height: 600 },
      title: "System map",
      expectedRevision: 4,
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    const relationship = yield* decodeBoardCommand({
      type: "board.relationship.update",
      commandId: "relationship-1",
      projectId: "project-1",
      relationshipId: "relationship:1",
      label: null,
      tombstoned: true,
      expectedRevision: 2,
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    assert.strictEqual(resize.type, "board.object.update");
    assert.strictEqual(relationship.type, "board.relationship.update");
  }),
);
