import {
  BoardObjectId,
  BoardOperationError,
  BoardRelationshipId,
  CommandId,
  type BoardPoint,
  type BoardSnapshot,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { BoardService, type BoardServiceShape } from "../../../board/BoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { BoardToolkit } from "./tools.ts";

interface Invocation {
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly board: BoardServiceShape;
  readonly snapshot: BoardSnapshot;
  readonly uuid: string;
  readonly commandId: CommandId;
  readonly createdAt: string;
}

const invoke = Effect.fn("BoardToolkit.invoke")(function* <A>(
  operation: string,
  run: (context: Invocation) => Effect.Effect<A, BoardOperationError>,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.capabilities.has("board")) {
    return yield* new BoardOperationError({
      reason: "unauthorized",
      message: "This provider session does not have board capability.",
    });
  }
  const board = yield* BoardService;
  const snapshot = yield* board.getAccessibleSnapshot(scope.threadId);
  const crypto = yield* Crypto.Crypto;
  const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
  const timestamp = DateTime.formatIso(yield* DateTime.now);
  return yield* run({
    scope,
    board,
    snapshot,
    uuid,
    commandId: CommandId.make(`board-tool:${operation}:${uuid}`),
    createdAt: timestamp,
  }).pipe(
    Effect.withSpan(`BoardToolkit.${operation}`, {
      attributes: { threadId: scope.threadId, providerInstanceId: scope.providerInstanceId },
    }),
  );
});

function relativePosition(snapshot: BoardSnapshot, threadId: string): BoardPoint {
  const frame = snapshot.objects.find(
    (object) => object.kind === "thread-frame" && object.threadId === threadId,
  );
  return frame
    ? { x: frame.position.x + frame.size.width + 80, y: frame.position.y }
    : { x: 0, y: 0 };
}

const handlers = {
  board_search: ({ query }) =>
    invoke("search", ({ snapshot }) => {
      const needle = query.trim().toLowerCase();
      return Effect.succeed(
        needle.length === 0
          ? snapshot.objects
          : snapshot.objects.filter((object) =>
              JSON.stringify(object).toLowerCase().includes(needle),
            ),
      );
    }),
  board_manifest: () =>
    invoke("manifest", ({ snapshot }) =>
      Effect.succeed({
        projectId: snapshot.projectId,
        sequence: snapshot.sequence,
        objects: snapshot.objects.map((object) => ({
          id: object.id,
          kind: object.kind,
          revision: object.revision,
          label:
            object.kind === "thread-frame"
              ? `Thread ${object.threadId}`
              : object.kind === "text-note" || object.kind === "group"
                ? object.title
                : object.kind === "file-reference"
                  ? object.path
                  : object.label,
        })),
      }),
    ),
  board_read: ({ objectIds }) =>
    invoke("read", ({ snapshot }) => {
      const requested = new Set(objectIds);
      return Effect.succeed(snapshot.objects.filter((object) => requested.has(object.id)));
    }),
  board_create_note: (input) =>
    invoke("create-note", ({ scope, board, snapshot, uuid, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.note.create",
        commandId,
        projectId: snapshot.projectId,
        objectId: BoardObjectId.make(`note:${uuid}`),
        position: input.position ?? relativePosition(snapshot, scope.threadId),
        title: input.title,
        text: input.text,
        originatingThreadId: scope.threadId,
        ...(scope.activeTurnId === undefined ? {} : { originatingTurnId: scope.activeTurnId }),
        originatingProviderInstanceId: scope.providerInstanceId,
        originatingOperationId: commandId,
        createdAt,
      }),
    ),
  board_create_shape: (input) =>
    invoke("create-shape", ({ scope, board, snapshot, uuid, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.diagram-shape.create",
        commandId,
        projectId: snapshot.projectId,
        objectId: BoardObjectId.make(`shape:${uuid}`),
        position: input.position ?? relativePosition(snapshot, scope.threadId),
        shape: input.shape,
        label: input.label,
        originatingThreadId: scope.threadId,
        ...(scope.activeTurnId === undefined ? {} : { originatingTurnId: scope.activeTurnId }),
        originatingProviderInstanceId: scope.providerInstanceId,
        originatingOperationId: commandId,
        createdAt,
      }),
    ),
  board_update_note: (input) =>
    invoke("update-note", ({ scope, board, snapshot, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.note.update",
        commandId,
        projectId: snapshot.projectId,
        objectId: input.objectId,
        title: input.title,
        text: input.text,
        expectedRevision: input.expectedRevision,
        createdAt,
      }),
    ),
  board_place: (input) =>
    invoke("place", ({ scope, board, snapshot, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.object.move",
        commandId,
        projectId: snapshot.projectId,
        objectId: input.objectId,
        position: input.position,
        expectedRevision: input.expectedRevision,
        createdAt,
      }),
    ),
  board_connect: (input) =>
    invoke("connect", ({ scope, board, snapshot, uuid, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.relationship.create",
        commandId,
        projectId: snapshot.projectId,
        relationshipId: BoardRelationshipId.make(`relationship:${uuid}`),
        kind: input.kind,
        ...(input.label === undefined ? {} : { label: input.label }),
        sourceObjectId: input.sourceObjectId,
        targetObjectId: input.targetObjectId,
        originatingThreadId: scope.threadId,
        ...(scope.activeTurnId === undefined ? {} : { originatingTurnId: scope.activeTurnId }),
        originatingProviderInstanceId: scope.providerInstanceId,
        originatingOperationId: commandId,
        createdAt,
      }),
    ),
  board_create_group: (input) =>
    invoke("create-group", ({ scope, board, snapshot, uuid, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.group.create",
        commandId,
        projectId: snapshot.projectId,
        objectId: BoardObjectId.make(`group:${uuid}`),
        position: input.position ?? relativePosition(snapshot, scope.threadId),
        size: {
          width: Math.max(120, input.width ?? 720),
          height: Math.max(120, input.height ?? 560),
        },
        title: input.title,
        originatingThreadId: scope.threadId,
        ...(scope.activeTurnId === undefined ? {} : { originatingTurnId: scope.activeTurnId }),
        originatingProviderInstanceId: scope.providerInstanceId,
        originatingOperationId: commandId,
        createdAt,
      }),
    ),
  board_tombstone: (input) =>
    invoke("tombstone", ({ scope, board, snapshot, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: input.restore ? "board.object.restore" : "board.object.tombstone",
        commandId,
        projectId: snapshot.projectId,
        objectId: input.objectId,
        expectedRevision: input.expectedRevision,
        createdAt,
      }),
    ),
  board_batch: ({ operations }) =>
    invoke("batch", ({ scope, board, snapshot, commandId, createdAt }) =>
      board.dispatchAsThread(scope.threadId, {
        type: "board.batch",
        commandId,
        projectId: snapshot.projectId,
        operations,
        originatingThreadId: scope.threadId,
        ...(scope.activeTurnId === undefined ? {} : { originatingTurnId: scope.activeTurnId }),
        originatingProviderInstanceId: scope.providerInstanceId,
        originatingOperationId: commandId,
        createdAt,
      }),
    ),
} satisfies Parameters<typeof BoardToolkit.toLayer>[0];

export const BoardToolkitHandlersLive = BoardToolkit.toLayer(handlers);
