import * as Schema from "effect/Schema";

import {
  CommandId,
  CheckpointRef,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TurnId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const BOARD_WS_METHODS = {
  dispatchCommand: "board.dispatchCommand",
  subscribe: "board.subscribe",
} as const;

export const BoardObjectId = TrimmedNonEmptyString.pipe(Schema.brand("BoardObjectId"));
export type BoardObjectId = typeof BoardObjectId.Type;
export const BOARD_WHOLE_BOARD_OBJECT_ID = "board:*" as BoardObjectId;

export const BoardRevision = NonNegativeInt;
export type BoardRevision = typeof BoardRevision.Type;

export const BoardPoint = Schema.Struct({ x: Schema.Number, y: Schema.Number });
export type BoardPoint = typeof BoardPoint.Type;

export const BoardSize = Schema.Struct({
  width: Schema.Number.check(Schema.isGreaterThan(0)),
  height: Schema.Number.check(Schema.isGreaterThan(0)),
});
export type BoardSize = typeof BoardSize.Type;

export const BoardFrameSize = Schema.Literals(["compact", "standard", "wide"]);
export type BoardFrameSize = typeof BoardFrameSize.Type;

const BoardObjectBase = {
  id: BoardObjectId,
  projectId: ProjectId,
  position: BoardPoint,
  size: BoardSize,
  revision: BoardRevision,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  tombstonedAt: Schema.NullOr(IsoDateTime),
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
} as const;

export const BoardThreadFrame = Schema.Struct({
  ...BoardObjectBase,
  kind: Schema.Literal("thread-frame"),
  threadId: ThreadId,
  frameSize: BoardFrameSize,
});
export type BoardThreadFrame = typeof BoardThreadFrame.Type;

export const BoardTextNote = Schema.Struct({
  ...BoardObjectBase,
  kind: Schema.Literal("text-note"),
  title: TrimmedNonEmptyString,
  text: Schema.String,
  promotedAt: Schema.optional(IsoDateTime),
});
export type BoardTextNote = typeof BoardTextNote.Type;

export const BoardFileReference = Schema.Struct({
  ...BoardObjectBase,
  kind: Schema.Literal("file-reference"),
  path: TrimmedNonEmptyString,
  startLine: Schema.optional(NonNegativeInt),
  endLine: Schema.optional(NonNegativeInt),
  checkpointRef: Schema.optional(CheckpointRef),
});
export type BoardFileReference = typeof BoardFileReference.Type;

export const BoardDiagramShape = Schema.Struct({
  ...BoardObjectBase,
  kind: Schema.Literal("diagram-shape"),
  shape: Schema.Literals(["rectangle", "ellipse", "diamond"]),
  label: Schema.String,
});
export type BoardDiagramShape = typeof BoardDiagramShape.Type;

export const BoardGroup = Schema.Struct({
  ...BoardObjectBase,
  kind: Schema.Literal("group"),
  title: TrimmedNonEmptyString,
});
export type BoardGroup = typeof BoardGroup.Type;

export const BoardObject = Schema.Union([
  BoardThreadFrame,
  BoardTextNote,
  BoardFileReference,
  BoardDiagramShape,
  BoardGroup,
]);
export type BoardObject = typeof BoardObject.Type;

export const BoardRelationshipId = TrimmedNonEmptyString.pipe(Schema.brand("BoardRelationshipId"));
export type BoardRelationshipId = typeof BoardRelationshipId.Type;

export const BoardRelationship = Schema.Struct({
  id: BoardRelationshipId,
  projectId: ProjectId,
  kind: Schema.Literals(["connector", "spawned-from", "context-shared-with", "blocked-by"]),
  label: Schema.optional(Schema.String),
  sourceObjectId: BoardObjectId,
  targetObjectId: BoardObjectId,
  revision: BoardRevision,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  tombstonedAt: Schema.NullOr(IsoDateTime),
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
});
export type BoardRelationship = typeof BoardRelationship.Type;

export const BoardGrant = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  objectId: BoardObjectId,
  access: Schema.Literals(["read", "edit"]),
  createdAt: IsoDateTime,
  revokedAt: Schema.NullOr(IsoDateTime),
});
export type BoardGrant = typeof BoardGrant.Type;

export const BoardProjectAuthority = Schema.Struct({
  projectId: ProjectId,
  defaultReadScope: Schema.Literals(["own", "board"]),
  defaultWriteAuthority: Schema.Literals(["own", "board"]),
  updatedAt: IsoDateTime,
});
export type BoardProjectAuthority = typeof BoardProjectAuthority.Type;

export const BoardActivity = Schema.Struct({
  operationId: CommandId,
  commandId: CommandId,
  projectId: ProjectId,
  summary: TrimmedNonEmptyString,
  objectIds: Schema.Array(BoardObjectId),
  originatingThreadId: ThreadId,
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: ProviderInstanceId,
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  undoneAt: Schema.NullOr(IsoDateTime),
});
export type BoardActivity = typeof BoardActivity.Type;

export const BoardSnapshot = Schema.Struct({
  projectId: ProjectId,
  sequence: NonNegativeInt,
  objects: Schema.Array(BoardObject),
  relationships: Schema.Array(BoardRelationship),
  grants: Schema.Array(BoardGrant),
  authority: Schema.optional(BoardProjectAuthority),
  activities: Schema.optional(Schema.Array(BoardActivity)),
});
export type BoardSnapshot = typeof BoardSnapshot.Type;

export const BoardObjectUpsertedDelta = Schema.Struct({
  kind: Schema.Literal("object-upserted"),
  projectId: ProjectId,
  sequence: NonNegativeInt,
  commandId: CommandId,
  object: BoardObject,
});
export type BoardObjectUpsertedDelta = typeof BoardObjectUpsertedDelta.Type;

export const BoardRelationshipUpsertedDelta = Schema.Struct({
  kind: Schema.Literal("relationship-upserted"),
  projectId: ProjectId,
  sequence: NonNegativeInt,
  commandId: CommandId,
  relationship: BoardRelationship,
});
export type BoardRelationshipUpsertedDelta = typeof BoardRelationshipUpsertedDelta.Type;

export const BoardGrantUpsertedDelta = Schema.Struct({
  kind: Schema.Literal("grant-upserted"),
  projectId: ProjectId,
  sequence: NonNegativeInt,
  commandId: CommandId,
  grant: BoardGrant,
});
export type BoardGrantUpsertedDelta = typeof BoardGrantUpsertedDelta.Type;

export const BoardAuthorityUpsertedDelta = Schema.Struct({
  kind: Schema.Literal("authority-upserted"),
  projectId: ProjectId,
  sequence: NonNegativeInt,
  commandId: CommandId,
  authority: BoardProjectAuthority,
});

export const BoardActivityUpsertedDelta = Schema.Struct({
  kind: Schema.Literal("activity-upserted"),
  projectId: ProjectId,
  sequence: NonNegativeInt,
  commandId: CommandId,
  activity: BoardActivity,
});

export const BoardDelta = Schema.Union([
  BoardObjectUpsertedDelta,
  BoardRelationshipUpsertedDelta,
  BoardGrantUpsertedDelta,
  BoardAuthorityUpsertedDelta,
  BoardActivityUpsertedDelta,
]);
export type BoardDelta = typeof BoardDelta.Type;

export const BoardStreamItem = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("snapshot"), snapshot: BoardSnapshot }),
  Schema.Struct({ kind: Schema.Literal("synchronized") }),
  BoardDelta,
]);
export type BoardStreamItem = typeof BoardStreamItem.Type;

export const BoardEnsureThreadFramesCommand = Schema.Struct({
  type: Schema.Literal("board.thread-frames.ensure"),
  commandId: CommandId,
  projectId: ProjectId,
  createdAt: IsoDateTime,
});

export const BoardMoveObjectCommand = Schema.Struct({
  type: Schema.Literal("board.object.move"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  position: BoardPoint,
  resolveCollisions: Schema.optional(Schema.Boolean),
  expectedRevision: Schema.optional(BoardRevision),
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardPlaceThreadFrameCommand = Schema.Struct({
  type: Schema.Literal("board.thread-frame.place"),
  commandId: CommandId,
  projectId: ProjectId,
  threadId: ThreadId,
  position: BoardPoint,
  parentThreadId: Schema.optional(ThreadId),
  createdAt: IsoDateTime,
});

export const BoardCreateNoteCommand = Schema.Struct({
  type: Schema.Literal("board.note.create"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  position: BoardPoint,
  title: TrimmedNonEmptyString,
  text: Schema.String,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardUpdateNoteCommand = Schema.Struct({
  type: Schema.Literal("board.note.update"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  title: Schema.optional(TrimmedNonEmptyString),
  text: Schema.optional(Schema.String),
  expectedRevision: BoardRevision,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardUpdateObjectCommand = Schema.Struct({
  type: Schema.Literal("board.object.update"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  size: Schema.optional(BoardSize),
  frameSize: Schema.optional(BoardFrameSize),
  title: Schema.optional(TrimmedNonEmptyString),
  shape: Schema.optional(Schema.Literals(["rectangle", "ellipse", "diamond"])),
  label: Schema.optional(Schema.String),
  path: Schema.optional(TrimmedNonEmptyString),
  startLine: Schema.optional(Schema.NullOr(NonNegativeInt)),
  endLine: Schema.optional(Schema.NullOr(NonNegativeInt)),
  checkpointRef: Schema.optional(Schema.NullOr(CheckpointRef)),
  expectedRevision: BoardRevision,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardPromoteNoteCommand = Schema.Struct({
  type: Schema.Literal("board.note.promote"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  expectedRevision: BoardRevision,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardSetObjectTombstoneCommand = Schema.Struct({
  type: Schema.Literals(["board.object.tombstone", "board.object.restore"]),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  expectedRevision: BoardRevision,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardCreateFileReferenceCommand = Schema.Struct({
  type: Schema.Literal("board.file-reference.create"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  position: BoardPoint,
  path: TrimmedNonEmptyString,
  startLine: Schema.optional(NonNegativeInt),
  endLine: Schema.optional(NonNegativeInt),
  checkpointRef: Schema.optional(CheckpointRef),
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardCreateDiagramShapeCommand = Schema.Struct({
  type: Schema.Literal("board.diagram-shape.create"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  position: BoardPoint,
  shape: Schema.Literals(["rectangle", "ellipse", "diamond"]),
  label: Schema.String,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardCreateGroupCommand = Schema.Struct({
  type: Schema.Literal("board.group.create"),
  commandId: CommandId,
  projectId: ProjectId,
  objectId: BoardObjectId,
  position: BoardPoint,
  size: BoardSize,
  title: TrimmedNonEmptyString,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardCreateRelationshipCommand = Schema.Struct({
  type: Schema.Literal("board.relationship.create"),
  commandId: CommandId,
  projectId: ProjectId,
  relationshipId: BoardRelationshipId,
  kind: Schema.Literals(["connector", "spawned-from", "context-shared-with", "blocked-by"]),
  label: Schema.optional(Schema.String),
  sourceObjectId: BoardObjectId,
  targetObjectId: BoardObjectId,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardUpdateRelationshipCommand = Schema.Struct({
  type: Schema.Literal("board.relationship.update"),
  commandId: CommandId,
  projectId: ProjectId,
  relationshipId: BoardRelationshipId,
  label: Schema.optional(Schema.NullOr(Schema.String)),
  tombstoned: Schema.optional(Schema.Boolean),
  expectedRevision: BoardRevision,
  originatingThreadId: Schema.optional(ThreadId),
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardSetGrantCommand = Schema.Struct({
  type: Schema.Literals(["board.grant.set", "board.grant.revoke"]),
  commandId: CommandId,
  projectId: ProjectId,
  threadId: ThreadId,
  objectIds: Schema.Array(BoardObjectId).check(Schema.isMinLength(1)),
  access: Schema.optional(Schema.Literals(["read", "edit"])),
  createdAt: IsoDateTime,
});

export const BoardSetThreadAuthorityCommand = Schema.Struct({
  type: Schema.Literals(["board.authority.set", "board.authority.revoke"]),
  commandId: CommandId,
  projectId: ProjectId,
  threadId: ThreadId,
  access: Schema.optional(Schema.Literals(["read", "edit"])),
  createdAt: IsoDateTime,
});

export const BoardSetProjectAuthorityCommand = Schema.Struct({
  type: Schema.Literal("board.project-authority.set"),
  commandId: CommandId,
  projectId: ProjectId,
  defaultReadScope: Schema.Literals(["own", "board"]),
  defaultWriteAuthority: Schema.Literals(["own", "board"]),
  createdAt: IsoDateTime,
});

const BoardBatchCreateNoteOperation = Schema.Struct({
  type: Schema.Literal("note.create"),
  objectId: BoardObjectId,
  position: BoardPoint,
  title: TrimmedNonEmptyString,
  text: Schema.String,
});
const BoardBatchCreateShapeOperation = Schema.Struct({
  type: Schema.Literal("shape.create"),
  objectId: BoardObjectId,
  position: BoardPoint,
  shape: Schema.Literals(["rectangle", "ellipse", "diamond"]),
  label: Schema.String,
});
const BoardBatchMoveOperation = Schema.Struct({
  type: Schema.Literal("object.move"),
  objectId: BoardObjectId,
  position: BoardPoint,
  resolveCollisions: Schema.optional(Schema.Boolean),
  expectedRevision: BoardRevision,
});
const BoardBatchUpdateNoteOperation = Schema.Struct({
  type: Schema.Literal("note.update"),
  objectId: BoardObjectId,
  title: Schema.optional(TrimmedNonEmptyString),
  text: Schema.optional(Schema.String),
  expectedRevision: BoardRevision,
});
const BoardBatchUpdateObjectOperation = Schema.Struct({
  type: Schema.Literal("object.update"),
  objectId: BoardObjectId,
  size: Schema.optional(BoardSize),
  frameSize: Schema.optional(BoardFrameSize),
  title: Schema.optional(TrimmedNonEmptyString),
  shape: Schema.optional(Schema.Literals(["rectangle", "ellipse", "diamond"])),
  label: Schema.optional(Schema.String),
  path: Schema.optional(TrimmedNonEmptyString),
  startLine: Schema.optional(Schema.NullOr(NonNegativeInt)),
  endLine: Schema.optional(Schema.NullOr(NonNegativeInt)),
  checkpointRef: Schema.optional(Schema.NullOr(CheckpointRef)),
  expectedRevision: BoardRevision,
});
const BoardBatchConnectOperation = Schema.Struct({
  type: Schema.Literal("relationship.create"),
  relationshipId: BoardRelationshipId,
  kind: Schema.Literals(["connector", "blocked-by"]),
  label: Schema.optional(Schema.String),
  sourceObjectId: BoardObjectId,
  targetObjectId: BoardObjectId,
});
const BoardBatchUpdateRelationshipOperation = Schema.Struct({
  type: Schema.Literal("relationship.update"),
  relationshipId: BoardRelationshipId,
  label: Schema.optional(Schema.NullOr(Schema.String)),
  tombstoned: Schema.optional(Schema.Boolean),
  expectedRevision: BoardRevision,
});
const BoardBatchTombstoneOperation = Schema.Struct({
  type: Schema.Literals(["object.tombstone", "object.restore"]),
  objectId: BoardObjectId,
  expectedRevision: BoardRevision,
});

export const BoardBatchOperation = Schema.Union([
  BoardBatchCreateNoteOperation,
  BoardBatchCreateShapeOperation,
  BoardBatchMoveOperation,
  BoardBatchUpdateNoteOperation,
  BoardBatchUpdateObjectOperation,
  BoardBatchConnectOperation,
  BoardBatchUpdateRelationshipOperation,
  BoardBatchTombstoneOperation,
]);
export type BoardBatchOperation = typeof BoardBatchOperation.Type;

export const BoardBatchCommand = Schema.Struct({
  type: Schema.Literal("board.batch"),
  commandId: CommandId,
  projectId: ProjectId,
  operations: Schema.Array(BoardBatchOperation).check(Schema.isMinLength(1)),
  originatingThreadId: ThreadId,
  originatingTurnId: Schema.optional(TurnId),
  originatingProviderInstanceId: Schema.optional(ProviderInstanceId),
  originatingProviderKind: Schema.optional(TrimmedNonEmptyString),
  originatingOperationId: Schema.optional(CommandId),
  createdAt: IsoDateTime,
});

export const BoardUndoOperationCommand = Schema.Struct({
  type: Schema.Literal("board.operation.undo"),
  commandId: CommandId,
  projectId: ProjectId,
  operationId: CommandId,
  createdAt: IsoDateTime,
});

export const BoardCommand = Schema.Union([
  BoardEnsureThreadFramesCommand,
  BoardMoveObjectCommand,
  BoardPlaceThreadFrameCommand,
  BoardCreateNoteCommand,
  BoardUpdateNoteCommand,
  BoardUpdateObjectCommand,
  BoardPromoteNoteCommand,
  BoardSetObjectTombstoneCommand,
  BoardCreateFileReferenceCommand,
  BoardCreateDiagramShapeCommand,
  BoardCreateGroupCommand,
  BoardCreateRelationshipCommand,
  BoardUpdateRelationshipCommand,
  BoardSetGrantCommand,
  BoardSetThreadAuthorityCommand,
  BoardSetProjectAuthorityCommand,
  BoardBatchCommand,
  BoardUndoOperationCommand,
]);
export type BoardCommand = typeof BoardCommand.Type;

export const BoardDispatchResult = Schema.Struct({
  sequence: NonNegativeInt,
  duplicate: Schema.Boolean,
});
export type BoardDispatchResult = typeof BoardDispatchResult.Type;

export const BoardSubscribeInput = Schema.Struct({
  projectId: ProjectId,
  afterSequence: Schema.optionalKey(NonNegativeInt),
  requestCompletionMarker: Schema.optionalKey(Schema.Boolean),
});
export type BoardSubscribeInput = typeof BoardSubscribeInput.Type;

export class BoardOperationError extends Schema.TaggedErrorClass<BoardOperationError>()(
  "BoardOperationError",
  {
    reason: Schema.Literals([
      "project-not-found",
      "thread-not-found",
      "invalid-path",
      "invalid-range",
      "object-not-found",
      "project-mismatch",
      "revision-conflict",
      "unauthorized",
      "persistence-failed",
    ]),
    message: TrimmedNonEmptyString,
    expectedRevision: Schema.optional(NonNegativeInt),
    actualRevision: Schema.optional(NonNegativeInt),
  },
) {}
