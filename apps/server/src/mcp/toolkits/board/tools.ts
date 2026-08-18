import {
  BoardObject,
  BoardObjectId,
  BoardOperationError,
  BoardPoint,
  BoardBatchOperation,
  BoardDispatchResult,
  CommandId,
  NonNegativeInt,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Crypto from "effect/Crypto";
import { Tool, Toolkit } from "effect/unstable/ai";

import { BoardService } from "../../../board/BoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext.McpInvocationContext, BoardService, Crypto.Crypto];
const objectIds = Schema.Array(BoardObjectId).check(Schema.isMinLength(1));

const readonlyBoardTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

const mutatingBoardTool = <T extends Tool.Any>(tool: T): T =>
  tool.annotate(Tool.OpenWorld, false).annotate(Tool.Destructive, true) as T;

export const BoardSearchTool = readonlyBoardTool(
  Tool.make("board_search", {
    description:
      "Search only board objects this thread may access. Inaccessible objects are omitted completely.",
    parameters: Schema.Struct({ query: Schema.String }),
    success: Schema.Array(BoardObject),
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Search accessible board objects"),
);

export const BoardReadTool = readonlyBoardTool(
  Tool.make("board_read", {
    description:
      "Read current revisions of accessible board objects by stable id. Unknown and inaccessible ids are omitted.",
    parameters: Schema.Struct({ objectIds }),
    success: Schema.Array(BoardObject),
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read board objects"),
);

export const BoardManifestTool = readonlyBoardTool(
  Tool.make("board_manifest", {
    description:
      "Return a compact manifest of board objects this thread may access. Use board_read for full content of selected ids.",
    parameters: Schema.Struct({}),
    success: Schema.Struct({
      projectId: Schema.String,
      sequence: NonNegativeInt,
      objects: Schema.Array(
        Schema.Struct({
          id: BoardObjectId,
          kind: Schema.String,
          revision: NonNegativeInt,
          label: Schema.String,
        }),
      ),
    }),
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read board context manifest"),
);

export const BoardContextTool = readonlyBoardTool(
  Tool.make("board_context", {
    description:
      "Render only explicitly shared board artifacts as compact direct text, lazy object references, and readable spatial tiles when this provider supports images.",
    parameters: Schema.Struct({}),
    success: Schema.Struct({
      mode: Schema.Literals(["image-plus-structure", "structure-only"]),
      manifest: Schema.Array(
        Schema.Struct({
          id: BoardObjectId,
          kind: Schema.String,
          revision: NonNegativeInt,
          label: Schema.String,
          access: Schema.Literals(["read", "edit"]),
          position: BoardPoint,
          size: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
        }),
      ),
      directText: Schema.Array(
        Schema.Struct({
          id: BoardObjectId,
          revision: NonNegativeInt,
          title: Schema.String,
          text: Schema.String,
        }),
      ),
      lazyObjectIds: Schema.Array(BoardObjectId),
      tiles: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          objectIds: Schema.Array(BoardObjectId),
          imageDataUrl: Schema.String,
        }),
      ),
    }),
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Render shared board context"),
);

export const BoardCreateNoteTool = mutatingBoardTool(
  Tool.make("board_create_note", {
    description:
      "Create a durable note owned by this thread. Omit position to place it beside this thread without discovering nearby private objects.",
    parameters: Schema.Struct({
      title: Schema.String,
      text: Schema.String,
      position: Schema.optional(BoardPoint),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Create board note"),
);

export const BoardCreateShapeTool = mutatingBoardTool(
  Tool.make("board_create_shape", {
    description: "Create a durable diagram shape owned by this thread.",
    parameters: Schema.Struct({
      shape: Schema.Literals(["rectangle", "ellipse", "diamond"]),
      label: Schema.String,
      position: Schema.optional(BoardPoint),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Create board shape"),
);

export const BoardUpdateNoteTool = mutatingBoardTool(
  Tool.make("board_update_note", {
    description:
      "Update an editable note using its expected revision. Conflicts never overwrite newer work.",
    parameters: Schema.Struct({
      objectId: BoardObjectId,
      title: Schema.String,
      text: Schema.String,
      expectedRevision: NonNegativeInt,
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Update board note"),
);

export const BoardPlaceTool = mutatingBoardTool(
  Tool.make("board_place", {
    description:
      "Move an editable board object to an explicit position using its expected revision.",
    parameters: Schema.Struct({
      objectId: BoardObjectId,
      position: BoardPoint,
      expectedRevision: NonNegativeInt,
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Place board object"),
);

export const BoardConnectTool = mutatingBoardTool(
  Tool.make("board_connect", {
    description:
      "Create a typed relationship between accessible objects. A visual connector never grants context or authority.",
    parameters: Schema.Struct({
      sourceObjectId: BoardObjectId,
      targetObjectId: BoardObjectId,
      kind: Schema.Literals(["connector", "blocked-by"]),
      label: Schema.optional(Schema.String),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Connect board objects"),
);

export const BoardCreateGroupTool = mutatingBoardTool(
  Tool.make("board_create_group", {
    description:
      "Create a soft visual group. Grouping does not grant authority or lock contained objects.",
    parameters: Schema.Struct({
      title: Schema.String,
      position: Schema.optional(BoardPoint),
      width: Schema.optional(Schema.Number),
      height: Schema.optional(Schema.Number),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Create board group"),
);

export const BoardTombstoneTool = mutatingBoardTool(
  Tool.make("board_tombstone", {
    description:
      "Reversibly tombstone or restore an editable board object using its expected revision.",
    parameters: Schema.Struct({
      objectId: BoardObjectId,
      expectedRevision: NonNegativeInt,
      restore: Schema.optional(Schema.Boolean),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Tombstone or restore board object"),
);

export const BoardBatchTool = mutatingBoardTool(
  Tool.make("board_batch", {
    description:
      "Commit several board edits atomically. Every operation succeeds together or none are applied. Objects created earlier in the batch may be referenced by later operations.",
    parameters: Schema.Struct({
      operations: Schema.Array(BoardBatchOperation).check(Schema.isMinLength(1)),
    }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Apply an atomic board operation"),
);

export const BoardUndoTool = mutatingBoardTool(
  Tool.make("board_undo", {
    description:
      "Undo one attributed atomic board operation. Requires explicit full-board edit authority and changes only board history.",
    parameters: Schema.Struct({ operationId: CommandId }),
    success: BoardDispatchResult,
    failure: BoardOperationError,
    dependencies,
  }).annotate(Tool.Title, "Undo board operation"),
);

export const BoardToolkit = Toolkit.make(
  BoardSearchTool,
  BoardManifestTool,
  BoardContextTool,
  BoardReadTool,
  BoardCreateNoteTool,
  BoardCreateShapeTool,
  BoardUpdateNoteTool,
  BoardPlaceTool,
  BoardConnectTool,
  BoardCreateGroupTool,
  BoardTombstoneTool,
  BoardBatchTool,
  BoardUndoTool,
);
