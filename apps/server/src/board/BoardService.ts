import {
  BoardCommand,
  BoardGrant,
  BoardObject,
  BoardOperationError,
  BoardRelationship,
  BoardSnapshot,
  BOARD_WHOLE_BOARD_OBJECT_ID,
  CommandId,
  ProjectId,
  ThreadId,
  type BoardDelta,
  type BoardDispatchResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { decideBoardCommand } from "./decider.ts";
import { projectBoardEvent } from "./projector.ts";

type BoardObjectRow = { readonly payloadJson: string };
type BoardRelationshipRow = { readonly payloadJson: string };
type BoardGrantRow = { readonly payloadJson: string };
type BoardEventRow = {
  readonly sequence: number;
  readonly projectId: string;
  readonly commandId: string;
  readonly eventType: string;
  readonly payloadJson: string;
};

export interface BoardServiceShape {
  readonly dispatch: (
    command: BoardCommand,
  ) => Effect.Effect<BoardDispatchResult, BoardOperationError>;
  readonly ensureThreadFrames: (projectId: ProjectId) => Effect.Effect<void, BoardOperationError>;
  readonly getSnapshot: (projectId: ProjectId) => Effect.Effect<BoardSnapshot, BoardOperationError>;
  readonly getAccessibleSnapshot: (
    threadId: ThreadId,
  ) => Effect.Effect<BoardSnapshot, BoardOperationError>;
  readonly dispatchAsThread: (
    threadId: ThreadId,
    command: BoardCommand,
  ) => Effect.Effect<BoardDispatchResult, BoardOperationError>;
  readonly replay: (
    projectId: ProjectId,
    afterSequence: number,
  ) => Effect.Effect<ReadonlyArray<BoardDelta>, BoardOperationError>;
  readonly changes: Stream.Stream<BoardDelta>;
}

export class BoardService extends Context.Service<BoardService, BoardServiceShape>()(
  "t3/board/BoardService",
) {}

const BoardObjectJson = Schema.fromJsonString(BoardObject);
const BoardRelationshipJson = Schema.fromJsonString(BoardRelationship);
const BoardGrantJson = Schema.fromJsonString(BoardGrant);
const decodeBoardObject = Schema.decodeUnknownSync(BoardObjectJson);
const encodeBoardObject = Schema.encodeSync(BoardObjectJson);
const decodeBoardRelationship = Schema.decodeUnknownSync(BoardRelationshipJson);
const encodeBoardRelationship = Schema.encodeSync(BoardRelationshipJson);
const decodeBoardGrant = Schema.decodeUnknownSync(BoardGrantJson);
const encodeBoardGrant = Schema.encodeSync(BoardGrantJson);
const isBoardOperationError = Schema.is(BoardOperationError);

const persistenceError = (cause: unknown) =>
  new BoardOperationError({
    reason: "persistence-failed",
    message: cause instanceof Error ? cause.message : "The board could not be persisted.",
  });

export const layer = Layer.effect(
  BoardService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;
    const changes = yield* PubSub.unbounded<BoardDelta>();
    const mutex = yield* Semaphore.make(1);

    const loadObjects = Effect.fn("BoardService.loadObjects")(function* (projectId: ProjectId) {
      const rows = yield* sql<BoardObjectRow>`
        SELECT payload_json AS "payloadJson"
        FROM projection_board_objects
        WHERE project_id = ${projectId}
        ORDER BY updated_sequence ASC, object_id ASC
      `;
      return rows.map((row) => decodeBoardObject(row.payloadJson));
    });

    const loadRelationships = Effect.fn("BoardService.loadRelationships")(function* (
      projectId: ProjectId,
    ) {
      const rows = yield* sql<BoardRelationshipRow>`
        SELECT payload_json AS "payloadJson"
        FROM projection_board_relationships
        WHERE project_id = ${projectId}
        ORDER BY updated_sequence ASC, relationship_id ASC
      `;
      return rows.map((row) => decodeBoardRelationship(row.payloadJson));
    });

    const loadGrants = Effect.fn("BoardService.loadGrants")(function* (projectId: ProjectId) {
      const rows = yield* sql<BoardGrantRow>`
        SELECT payload_json AS "payloadJson"
        FROM projection_board_grants
        WHERE project_id = ${projectId}
        ORDER BY thread_id ASC, object_id ASC
      `;
      return rows.map((row) => decodeBoardGrant(row.payloadJson));
    });

    const requireProject = Effect.fn("BoardService.requireProject")(function* (
      projectId: ProjectId,
    ) {
      const rows = yield* sql<{ readonly projectId: string }>`
        SELECT project_id AS "projectId"
        FROM projection_projects
        WHERE project_id = ${projectId} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (rows.length === 0) {
        return yield* new BoardOperationError({
          reason: "project-not-found",
          message: `Project ${projectId} was not found.`,
        });
      }
    });

    const dispatchUnlocked = Effect.fn("BoardService.dispatch")(function* (command: BoardCommand) {
      const published = yield* sql.withTransaction(
        Effect.gen(function* () {
          const duplicateRows = yield* sql<{ readonly lastSequence: number }>`
            SELECT last_sequence AS "lastSequence"
            FROM board_command_receipts
            WHERE command_id = ${command.commandId}
            LIMIT 1
          `;
          if (duplicateRows[0] !== undefined) {
            return {
              result: { sequence: duplicateRows[0].lastSequence, duplicate: true },
              deltas: [] as ReadonlyArray<BoardDelta>,
            };
          }

          yield* requireProject(command.projectId);
          let objects: ReadonlyArray<BoardObject> = yield* loadObjects(command.projectId);
          const relationships = yield* loadRelationships(command.projectId);
          const grants = yield* loadGrants(command.projectId);
          const threadRows =
            command.type === "board.thread-frames.ensure" ||
            command.type === "board.thread-frame.place" ||
            command.type === "board.grant.set" ||
            command.type === "board.grant.revoke" ||
            command.type === "board.authority.set" ||
            command.type === "board.authority.revoke" ||
            command.type === "board.batch"
              ? yield* sql<{ readonly threadId: string }>`
                  SELECT thread_id AS "threadId"
                  FROM projection_threads
                  WHERE project_id = ${command.projectId}
                    AND deleted_at IS NULL
                    AND archived_at IS NULL
                  ORDER BY created_at ASC, thread_id ASC
                `
              : [];
          const events = yield* Effect.try({
            try: () =>
              decideBoardCommand(command, {
                objects,
                relationships,
                grants,
                threadIds: threadRows.map((row) => ThreadId.make(row.threadId)),
              }),
            catch: (cause) => (isBoardOperationError(cause) ? cause : persistenceError(cause)),
          });
          const deltas: BoardDelta[] = [];
          let lastSequence =
            (yield* sql<{ readonly sequence: number }>`
                SELECT COALESCE(MAX(sequence), 0) AS sequence FROM board_events
              `)[0]?.sequence ?? 0;

          for (const event of events) {
            if (event.type === "board.grant-updated") {
              const payloadJson = encodeBoardGrant(event.grant);
              const inserted = yield* sql<{ readonly sequence: number }>`
                INSERT INTO board_events (
                  project_id, command_id, event_type, payload_json, occurred_at
                ) VALUES (
                  ${command.projectId}, ${command.commandId}, ${event.type},
                  ${payloadJson}, ${event.occurredAt}
                )
                RETURNING sequence
              `;
              lastSequence = inserted[0]?.sequence ?? lastSequence;
              yield* sql`
                INSERT INTO projection_board_grants (
                  project_id, thread_id, object_id, payload_json
                ) VALUES (
                  ${event.grant.projectId}, ${event.grant.threadId}, ${event.grant.objectId},
                  ${payloadJson}
                )
                ON CONFLICT(project_id, thread_id, object_id) DO UPDATE SET
                  payload_json = excluded.payload_json
              `;
              deltas.push({
                kind: "grant-upserted",
                projectId: command.projectId,
                sequence: lastSequence,
                commandId: command.commandId,
                grant: event.grant,
              });
              continue;
            }
            if (event.type === "board.relationship-created") {
              const payloadJson = encodeBoardRelationship(event.relationship);
              const inserted = yield* sql<{ readonly sequence: number }>`
                INSERT INTO board_events (
                  project_id, command_id, event_type, payload_json, occurred_at
                ) VALUES (
                  ${command.projectId}, ${command.commandId}, ${event.type},
                  ${payloadJson}, ${event.occurredAt}
                )
                RETURNING sequence
              `;
              lastSequence = inserted[0]?.sequence ?? lastSequence;
              yield* sql`
                INSERT INTO projection_board_relationships (
                  relationship_id, project_id, payload_json, revision, updated_sequence
                ) VALUES (
                  ${event.relationship.id}, ${event.relationship.projectId}, ${payloadJson},
                  ${event.relationship.revision}, ${lastSequence}
                )
                ON CONFLICT(relationship_id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  revision = excluded.revision,
                  updated_sequence = excluded.updated_sequence
              `;
              deltas.push({
                kind: "relationship-upserted",
                projectId: command.projectId,
                sequence: lastSequence,
                commandId: command.commandId,
                relationship: event.relationship,
              });
              continue;
            }
            objects = projectBoardEvent(objects, event);
            const object =
              event.type === "board.object-created" || event.type === "board.object-updated"
                ? event.object
                : objects.find((candidate) => candidate.id === event.objectId);
            if (object === undefined) continue;
            const payloadJson = encodeBoardObject(object);
            const inserted = yield* sql<{ readonly sequence: number }>`
              INSERT INTO board_events (
                project_id, command_id, event_type, payload_json, occurred_at
              ) VALUES (
                ${command.projectId}, ${command.commandId}, ${event.type},
                ${payloadJson}, ${event.occurredAt}
              )
              RETURNING sequence
            `;
            lastSequence = inserted[0]?.sequence ?? lastSequence;
            yield* sql`
              INSERT INTO projection_board_objects (
                object_id, project_id, object_kind, thread_id, payload_json,
                revision, updated_sequence
              ) VALUES (
                ${object.id}, ${object.projectId}, ${object.kind},
                ${object.kind === "thread-frame" ? object.threadId : null},
                ${payloadJson}, ${object.revision}, ${lastSequence}
              )
              ON CONFLICT(object_id) DO UPDATE SET
                payload_json = excluded.payload_json,
                revision = excluded.revision,
                updated_sequence = excluded.updated_sequence
            `;
            deltas.push({
              kind: "object-upserted",
              projectId: command.projectId,
              sequence: lastSequence,
              commandId: command.commandId,
              object,
            });
          }

          yield* sql`
            INSERT INTO board_command_receipts (
              command_id, project_id, last_sequence, created_at
            ) VALUES (
              ${command.commandId}, ${command.projectId}, ${lastSequence}, ${command.createdAt}
            )
          `;
          return {
            result: { sequence: lastSequence, duplicate: false },
            deltas,
          };
        }),
      );
      yield* Effect.forEach(published.deltas, (delta) => PubSub.publish(changes, delta), {
        discard: true,
      });
      return published.result;
    });

    const dispatch: BoardServiceShape["dispatch"] = (command) =>
      mutex
        .withPermits(1)(dispatchUnlocked(command))
        .pipe(
          Effect.catch((cause) =>
            isBoardOperationError(cause)
              ? Effect.fail(cause)
              : Effect.fail(persistenceError(cause)),
          ),
        );

    const ensureThreadFrames: BoardServiceShape["ensureThreadFrames"] = (projectId) =>
      Effect.gen(function* () {
        const uuid = yield* crypto.randomUUIDv4;
        const createdAt = DateTime.formatIso(yield* DateTime.now);
        yield* dispatch({
          type: "board.thread-frames.ensure",
          commandId: CommandId.make(`board-ensure:${projectId}:${uuid}`),
          projectId,
          createdAt,
        });
      }).pipe(
        Effect.mapError((cause) =>
          isBoardOperationError(cause) ? cause : persistenceError(cause),
        ),
      );

    const getSnapshot: BoardServiceShape["getSnapshot"] = (projectId) =>
      Effect.gen(function* () {
        yield* requireProject(projectId);
        const objects = yield* loadObjects(projectId);
        const relationships = yield* loadRelationships(projectId);
        const grants = yield* loadGrants(projectId);
        const sequence =
          (yield* sql<{ readonly sequence: number }>`
              SELECT COALESCE(MAX(sequence), 0) AS sequence
              FROM board_events
              WHERE project_id = ${projectId}
            `)[0]?.sequence ?? 0;
        return {
          projectId,
          sequence,
          objects,
          relationships,
          grants,
        };
      }).pipe(
        Effect.mapError((cause) =>
          isBoardOperationError(cause) ? cause : persistenceError(cause),
        ),
      );

    const getThreadProjectId = Effect.fn("BoardService.getThreadProjectId")(function* (
      threadId: ThreadId,
    ) {
      const rows = yield* sql<{ readonly projectId: string }>`
        SELECT project_id AS "projectId"
        FROM projection_threads
        WHERE thread_id = ${threadId} AND deleted_at IS NULL
        LIMIT 1
      `;
      const project = rows[0];
      if (!project) {
        return yield* new BoardOperationError({
          reason: "thread-not-found",
          message: `Thread ${threadId} was not found.`,
        });
      }
      return ProjectId.make(project.projectId);
    });

    const filterSnapshotForThread = (snapshot: BoardSnapshot, threadId: ThreadId) => {
      const grants = snapshot.grants.filter(
        (grant) => grant.threadId === threadId && grant.revokedAt === null,
      );
      const wholeBoardGrant = grants.find(
        (grant) => grant.objectId === BOARD_WHOLE_BOARD_OBJECT_ID,
      );
      const grantedIds = new Set(grants.map((grant) => grant.objectId));
      const objects = wholeBoardGrant
        ? snapshot.objects
        : snapshot.objects.filter(
            (object) =>
              (object.kind === "thread-frame" && object.threadId === threadId) ||
              ("originatingThreadId" in object && object.originatingThreadId === threadId) ||
              grantedIds.has(object.id),
          );
      const visibleIds = new Set(objects.map((object) => object.id));
      return {
        ...snapshot,
        objects,
        relationships: snapshot.relationships.filter(
          (relationship) =>
            visibleIds.has(relationship.sourceObjectId) &&
            visibleIds.has(relationship.targetObjectId),
        ),
        grants,
      };
    };

    const getAccessibleSnapshot: BoardServiceShape["getAccessibleSnapshot"] = (threadId) =>
      Effect.gen(function* () {
        const projectId = yield* getThreadProjectId(threadId);
        return filterSnapshotForThread(yield* getSnapshot(projectId), threadId);
      }).pipe(
        Effect.mapError((cause) =>
          isBoardOperationError(cause) ? cause : persistenceError(cause),
        ),
      );

    const dispatchAsThread: BoardServiceShape["dispatchAsThread"] = (threadId, command) =>
      mutex
        .withPermits(1)(
          Effect.gen(function* () {
            const projectId = yield* getThreadProjectId(threadId);
            if (projectId !== command.projectId) {
              return yield* new BoardOperationError({
                reason: "project-mismatch",
                message: "The board command targets a different project.",
              });
            }
            const accessible = filterSnapshotForThread(yield* getSnapshot(projectId), threadId);
            const readableIds = new Set(accessible.objects.map((object) => object.id));
            const editableIds = new Set([
              ...(accessible.grants.some(
                (grant) =>
                  grant.objectId === BOARD_WHOLE_BOARD_OBJECT_ID && grant.access === "edit",
              )
                ? accessible.objects.map((object) => object.id)
                : []),
              ...accessible.grants
                .filter((grant) => grant.access === "edit")
                .map((grant) => grant.objectId),
              ...accessible.objects.flatMap((object) =>
                "originatingThreadId" in object && object.originatingThreadId === threadId
                  ? [object.id]
                  : [],
              ),
            ]);
            const authorized = (() => {
              if (command.type === "board.batch") {
                for (const operation of command.operations) {
                  if (operation.type === "note.create" || operation.type === "shape.create") {
                    readableIds.add(operation.objectId);
                    editableIds.add(operation.objectId);
                    continue;
                  }
                  if (
                    operation.type === "object.move" ||
                    operation.type === "note.update" ||
                    operation.type === "object.tombstone" ||
                    operation.type === "object.restore"
                  ) {
                    if (!editableIds.has(operation.objectId)) return false;
                    continue;
                  }
                  if (operation.type === "relationship.create") {
                    if (
                      !editableIds.has(operation.sourceObjectId) ||
                      !readableIds.has(operation.targetObjectId)
                    ) {
                      return false;
                    }
                    continue;
                  }
                  return false;
                }
                return command.originatingThreadId === threadId;
              }
              if (
                command.type === "board.note.create" ||
                command.type === "board.file-reference.create" ||
                command.type === "board.diagram-shape.create" ||
                command.type === "board.group.create"
              ) {
                return command.originatingThreadId === threadId;
              }
              if (
                command.type === "board.object.move" ||
                command.type === "board.note.update" ||
                command.type === "board.object.tombstone" ||
                command.type === "board.object.restore"
              ) {
                return editableIds.has(command.objectId);
              }
              if (command.type === "board.relationship.create") {
                return (
                  editableIds.has(command.sourceObjectId) && readableIds.has(command.targetObjectId)
                );
              }
              if (command.type === "board.thread-frame.place") {
                return command.threadId === threadId || command.parentThreadId === threadId;
              }
              return false;
            })();
            if (!authorized) {
              return yield* new BoardOperationError({
                reason: "unauthorized",
                message: "This thread does not have authority for that board operation.",
              });
            }
            return yield* dispatchUnlocked(command);
          }),
        )
        .pipe(
          Effect.catch((cause) =>
            isBoardOperationError(cause)
              ? Effect.fail(cause)
              : Effect.fail(persistenceError(cause)),
          ),
        );

    const replay: BoardServiceShape["replay"] = (projectId, afterSequence) =>
      Effect.gen(function* () {
        yield* requireProject(projectId);
        const rows = yield* sql<BoardEventRow>`
          SELECT sequence, project_id AS "projectId", command_id AS "commandId",
            event_type AS "eventType",
            payload_json AS "payloadJson"
          FROM board_events
          WHERE project_id = ${projectId} AND sequence > ${afterSequence}
          ORDER BY sequence ASC
        `;
        return rows.map((row) =>
          row.eventType === "board.relationship-created"
            ? {
                kind: "relationship-upserted" as const,
                projectId: ProjectId.make(row.projectId),
                sequence: row.sequence,
                commandId: CommandId.make(row.commandId),
                relationship: decodeBoardRelationship(row.payloadJson),
              }
            : row.eventType === "board.grant-updated"
              ? {
                  kind: "grant-upserted" as const,
                  projectId: ProjectId.make(row.projectId),
                  sequence: row.sequence,
                  commandId: CommandId.make(row.commandId),
                  grant: decodeBoardGrant(row.payloadJson),
                }
              : {
                  kind: "object-upserted" as const,
                  projectId: ProjectId.make(row.projectId),
                  sequence: row.sequence,
                  commandId: CommandId.make(row.commandId),
                  object: decodeBoardObject(row.payloadJson),
                },
        );
      }).pipe(
        Effect.mapError((cause) =>
          isBoardOperationError(cause) ? cause : persistenceError(cause),
        ),
      );

    return BoardService.of({
      dispatch,
      ensureThreadFrames,
      getSnapshot,
      getAccessibleSnapshot,
      dispatchAsThread,
      replay,
      changes: Stream.fromPubSub(changes),
    });
  }),
);
