import {
  BOARD_WS_METHODS,
  CommandId,
  type BoardObjectId,
  type BoardPoint,
  type BoardRelationshipId,
  type BoardSize,
  type BoardSnapshot,
  type BoardStreamItem,
  type CheckpointRef,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { EnvironmentRegistry } from "../connection/registry.ts";
import { request, subscribeDynamic } from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  followStreamInEnvironment,
} from "./runtime.ts";

export type BoardSyncStatus = "empty" | "synchronizing" | "live";

export interface BoardState {
  readonly snapshot: BoardSnapshot | null;
  readonly status: BoardSyncStatus;
  readonly error: string | null;
}

export const EMPTY_BOARD_STATE: BoardState = {
  snapshot: null,
  status: "empty",
  error: null,
};

export function applyBoardStreamItem(
  current: BoardSnapshot | null,
  item: BoardStreamItem,
): BoardSnapshot | null {
  if (item.kind === "snapshot") return item.snapshot;
  if (item.kind === "synchronized" || current === null || item.sequence <= current.sequence) {
    return current;
  }
  if (item.kind === "object-upserted") {
    return {
      ...current,
      sequence: item.sequence,
      objects: [...current.objects.filter((object) => object.id !== item.object.id), item.object],
    };
  }
  if (item.kind === "relationship-upserted") {
    return {
      ...current,
      sequence: item.sequence,
      relationships: [
        ...current.relationships.filter((relationship) => relationship.id !== item.relationship.id),
        item.relationship,
      ],
    };
  }
  return {
    ...current,
    sequence: item.sequence,
    grants: [
      ...current.grants.filter(
        (grant) => grant.threadId !== item.grant.threadId || grant.objectId !== item.grant.objectId,
      ),
      item.grant,
    ],
  };
}

const makeBoardState = Effect.fn("BoardState.make")(function* (projectId: ProjectId) {
  const state = yield* SubscriptionRef.make<BoardState>({
    snapshot: null,
    status: "synchronizing",
    error: null,
  });
  const cursor = yield* Ref.make(0);

  const applyItem = Effect.fn("BoardState.applyItem")(function* (item: BoardStreamItem) {
    if (item.kind === "synchronized") {
      yield* SubscriptionRef.update(state, (current) => ({
        ...current,
        status: "live" as const,
      }));
      return;
    }
    const current = yield* SubscriptionRef.get(state);
    const snapshot = applyBoardStreamItem(current.snapshot, item);
    if (snapshot !== null) yield* Ref.set(cursor, snapshot.sequence);
    yield* SubscriptionRef.set(state, { snapshot, status: "live", error: null });
  });

  yield* subscribeDynamic(
    BOARD_WS_METHODS.subscribe,
    Effect.fn("BoardState.subscribeInput")(function* () {
      const afterSequence = yield* Ref.get(cursor);
      yield* SubscriptionRef.update(state, (current) => ({
        ...current,
        status: "synchronizing" as const,
        error: null,
      }));
      return {
        projectId,
        ...(afterSequence > 0 ? { afterSequence } : {}),
        requestCompletionMarker: true,
      };
    }),
    {
      onExpectedFailure: () =>
        SubscriptionRef.update(state, (current) => ({
          ...current,
          status: current.snapshot === null ? "empty" : current.status,
          error: "Could not synchronize the project board.",
        })),
      retryExpectedFailureAfter: "250 millis",
    },
  ).pipe(Stream.runForEach(applyItem), Effect.forkScoped);

  return state;
});

export function boardStateChanges(environmentId: EnvironmentId, projectId: ProjectId) {
  return followStreamInEnvironment(
    environmentId,
    Stream.unwrap(makeBoardState(projectId).pipe(Effect.map(SubscriptionRef.changes))),
  );
}

export function createEnvironmentBoardAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const family = Atom.family((key: string) => {
    const [environmentId, projectId] = JSON.parse(key) as [EnvironmentId, ProjectId];
    return runtime
      .atom(boardStateChanges(environmentId, projectId), {
        initialValue: EMPTY_BOARD_STATE,
      })
      .pipe(Atom.withLabel(`environment-board-state:${key}`));
  });
  const stateAtom = (key: { environmentId: EnvironmentId; projectId: ProjectId }) =>
    family(JSON.stringify([key.environmentId, key.projectId]));
  const valueFamily = Atom.family((key: string) =>
    Atom.make((get) => {
      const [environmentId, projectId] = JSON.parse(key) as [EnvironmentId, ProjectId];
      return Option.getOrElse(
        AsyncResult.value(get(stateAtom({ environmentId, projectId }))),
        () => EMPTY_BOARD_STATE,
      );
    }).pipe(Atom.withLabel(`environment-board-state-value:${key}`)),
  );
  const stateValueAtom = (key: { environmentId: EnvironmentId; projectId: ProjectId }) =>
    valueFamily(JSON.stringify([key.environmentId, key.projectId]));
  const scheduler = createAtomCommandScheduler();
  const move = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:move-object",
    execute: (input: MoveBoardObjectInput) => moveBoardObject(input),
    scheduler,
    concurrency: {
      mode: "latest" as const,
      key: ({ environmentId, input }) => JSON.stringify([environmentId, input.objectId]),
    },
  });
  const placeThreadFrame = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:place-thread-frame",
    execute: (input: PlaceBoardThreadFrameInput) => placeBoardThreadFrame(input),
    scheduler,
  });
  const ensureThreadFrames = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:ensure-thread-frames",
    execute: (input: EnsureBoardThreadFramesInput) => ensureBoardThreadFrames(input),
    scheduler,
    concurrency: {
      mode: "latest" as const,
      key: ({ environmentId, input }) => JSON.stringify([environmentId, input.projectId]),
    },
  });
  const createNote = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:create-note",
    execute: (input: CreateBoardNoteInput) => createBoardNote(input),
    scheduler,
  });
  const updateNote = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:update-note",
    execute: (input: UpdateBoardNoteInput) => updateBoardNote(input),
    scheduler,
    concurrency: {
      mode: "latest" as const,
      key: ({ environmentId, input }) => JSON.stringify([environmentId, input.objectId]),
    },
  });
  const setTombstoned = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:set-tombstoned",
    execute: (input: SetBoardObjectTombstonedInput) => setBoardObjectTombstoned(input),
    scheduler,
  });
  const createFileReference = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:create-file-reference",
    execute: (input: CreateBoardFileReferenceInput) => createBoardFileReference(input),
    scheduler,
  });
  const createDiagramShape = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:create-diagram-shape",
    execute: (input: CreateBoardDiagramShapeInput) => createBoardDiagramShape(input),
    scheduler,
  });
  const createGroup = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:create-group",
    execute: (input: CreateBoardGroupInput) => createBoardGroup(input),
    scheduler,
  });
  const createRelationship = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:create-relationship",
    execute: (input: CreateBoardRelationshipInput) => createBoardRelationship(input),
    scheduler,
  });
  const setGrant = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:set-grant",
    execute: (input: SetBoardGrantInput) => setBoardGrant(input),
    scheduler,
  });
  const setAuthority = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:board:set-authority",
    execute: (input: SetBoardThreadAuthorityInput) => setBoardThreadAuthority(input),
    scheduler,
  });
  return {
    stateAtom,
    stateValueAtom,
    move,
    placeThreadFrame,
    ensureThreadFrames,
    createNote,
    updateNote,
    setTombstoned,
    createFileReference,
    createDiagramShape,
    createGroup,
    createRelationship,
    setGrant,
    setAuthority,
  };
}

export interface MoveBoardObjectInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly position: BoardPoint;
  readonly expectedRevision?: number;
  readonly commandId?: CommandId;
}

export const moveBoardObject = Effect.fn("BoardCommands.moveObject")(function* (
  input: MoveBoardObjectInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.object.move",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    position: input.position,
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface PlaceBoardThreadFrameInput {
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly position: BoardPoint;
  readonly parentThreadId?: ThreadId;
  readonly commandId?: CommandId;
}

export const placeBoardThreadFrame = Effect.fn("BoardCommands.placeThreadFrame")(function* (
  input: PlaceBoardThreadFrameInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.thread-frame.place",
    commandId,
    projectId: input.projectId,
    threadId: input.threadId,
    position: input.position,
    ...(input.parentThreadId === undefined ? {} : { parentThreadId: input.parentThreadId }),
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface EnsureBoardThreadFramesInput {
  readonly projectId: ProjectId;
  readonly commandId?: CommandId;
}

export const ensureBoardThreadFrames = Effect.fn("BoardCommands.ensureThreadFrames")(function* (
  input: EnsureBoardThreadFramesInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.thread-frames.ensure",
    commandId,
    projectId: input.projectId,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface CreateBoardNoteInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly position: BoardPoint;
  readonly title: string;
  readonly text: string;
  readonly originatingThreadId?: ThreadId;
  readonly commandId?: CommandId;
}

export const createBoardNote = Effect.fn("BoardCommands.createNote")(function* (
  input: CreateBoardNoteInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.note.create",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    position: input.position,
    title: input.title,
    text: input.text,
    ...(input.originatingThreadId === undefined
      ? {}
      : { originatingThreadId: input.originatingThreadId }),
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface UpdateBoardNoteInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly title: string;
  readonly text: string;
  readonly expectedRevision: number;
  readonly commandId?: CommandId;
}

export const updateBoardNote = Effect.fn("BoardCommands.updateNote")(function* (
  input: UpdateBoardNoteInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.note.update",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    title: input.title,
    text: input.text,
    expectedRevision: input.expectedRevision,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface SetBoardObjectTombstonedInput {
  readonly projectId: ProjectId;
  readonly object: { readonly id: BoardObjectId; readonly revision: number };
  readonly tombstoned: boolean;
  readonly commandId?: CommandId;
}

export const setBoardObjectTombstoned = Effect.fn("BoardCommands.setObjectTombstoned")(function* (
  input: SetBoardObjectTombstonedInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: input.tombstoned ? "board.object.tombstone" : "board.object.restore",
    commandId,
    projectId: input.projectId,
    objectId: input.object.id,
    expectedRevision: input.object.revision,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface CreateBoardFileReferenceInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly position: BoardPoint;
  readonly path: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly checkpointRef?: CheckpointRef;
  readonly originatingThreadId?: ThreadId;
  readonly commandId?: CommandId;
}

export const createBoardFileReference = Effect.fn("BoardCommands.createFileReference")(function* (
  input: CreateBoardFileReferenceInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.file-reference.create",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    position: input.position,
    path: input.path,
    ...(input.startLine === undefined ? {} : { startLine: input.startLine }),
    ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
    ...(input.checkpointRef === undefined ? {} : { checkpointRef: input.checkpointRef }),
    ...(input.originatingThreadId === undefined
      ? {}
      : { originatingThreadId: input.originatingThreadId }),
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface CreateBoardDiagramShapeInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly position: BoardPoint;
  readonly shape: "rectangle" | "ellipse" | "diamond";
  readonly label: string;
  readonly commandId?: CommandId;
}

export const createBoardDiagramShape = Effect.fn("BoardCommands.createDiagramShape")(function* (
  input: CreateBoardDiagramShapeInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.diagram-shape.create",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    position: input.position,
    shape: input.shape,
    label: input.label,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface CreateBoardGroupInput {
  readonly projectId: ProjectId;
  readonly objectId: BoardObjectId;
  readonly position: BoardPoint;
  readonly size: BoardSize;
  readonly title: string;
  readonly commandId?: CommandId;
}

export const createBoardGroup = Effect.fn("BoardCommands.createGroup")(function* (
  input: CreateBoardGroupInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.group.create",
    commandId,
    projectId: input.projectId,
    objectId: input.objectId,
    position: input.position,
    size: input.size,
    title: input.title,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface CreateBoardRelationshipInput {
  readonly projectId: ProjectId;
  readonly relationshipId: BoardRelationshipId;
  readonly kind: "connector" | "spawned-from" | "context-shared-with" | "blocked-by";
  readonly label?: string;
  readonly sourceObjectId: BoardObjectId;
  readonly targetObjectId: BoardObjectId;
  readonly commandId?: CommandId;
}

export const createBoardRelationship = Effect.fn("BoardCommands.createRelationship")(function* (
  input: CreateBoardRelationshipInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: "board.relationship.create",
    commandId,
    projectId: input.projectId,
    relationshipId: input.relationshipId,
    kind: input.kind,
    ...(input.label === undefined ? {} : { label: input.label }),
    sourceObjectId: input.sourceObjectId,
    targetObjectId: input.targetObjectId,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface SetBoardGrantInput {
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly objectIds: ReadonlyArray<BoardObjectId>;
  readonly access: "read" | "edit";
  readonly revoked?: boolean;
  readonly commandId?: CommandId;
}

export const setBoardGrant = Effect.fn("BoardCommands.setGrant")(function* (
  input: SetBoardGrantInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: input.revoked ? "board.grant.revoke" : "board.grant.set",
    commandId,
    projectId: input.projectId,
    threadId: input.threadId,
    objectIds: [...input.objectIds],
    access: input.access,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});

export interface SetBoardThreadAuthorityInput {
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly access: "read" | "edit";
  readonly revoked?: boolean;
  readonly commandId?: CommandId;
}

export const setBoardThreadAuthority = Effect.fn("BoardCommands.setThreadAuthority")(function* (
  input: SetBoardThreadAuthorityInput,
) {
  const crypto = yield* Crypto.Crypto;
  const commandId =
    input.commandId ?? (yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make)));
  return yield* request(BOARD_WS_METHODS.dispatchCommand, {
    type: input.revoked ? "board.authority.revoke" : "board.authority.set",
    commandId,
    projectId: input.projectId,
    threadId: input.threadId,
    access: input.access,
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });
});
