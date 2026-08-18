import { BoardObjectId, CommandId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { BoardService, layer as BoardServiceLive } from "./BoardService.ts";

const TestLayer = BoardServiceLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

it.layer(TestLayer)("BoardService", (it) => {
  it.effect("persists thread frames, publishes moves, and deduplicates commands", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const board = yield* BoardService;
      const projectId = ProjectId.make("project-1");
      const now = "2026-08-17T00:00:00.000Z";

      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json, scripts_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          ${projectId}, ${"Board project"}, ${"/workspace/board"}, ${null}, ${"[]"},
          ${now}, ${now}, ${null}
        )
      `;
      for (const threadId of [ThreadId.make("thread-1"), ThreadId.make("thread-2")]) {
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, model_selection_json, branch, worktree_path,
            latest_turn_id, created_at, updated_at, deleted_at
          ) VALUES (
            ${threadId}, ${projectId}, ${threadId}, ${'{"instanceId":"codex","model":"gpt-5.6"}'}, ${null}, ${null},
            ${null}, ${now}, ${now}, ${null}
          )
        `;
      }

      yield* board.dispatch({
        type: "board.thread-frames.ensure",
        commandId: CommandId.make("ensure-frames"),
        projectId,
        createdAt: now,
      });
      const initial = yield* board.getSnapshot(projectId);
      assert.strictEqual(initial.objects.length, 2);

      const frame = initial.objects.find(
        (object) => object.kind === "thread-frame" && object.threadId === "thread-1",
      );
      assert.ok(frame !== undefined);
      const received = yield* Queue.unbounded<unknown>();
      yield* board.changes.pipe(
        Stream.filter((delta) => delta.projectId === projectId),
        Stream.runForEach((delta) => Queue.offer(received, delta)),
        Effect.forkScoped({ startImmediately: true }),
      );

      const command = {
        type: "board.object.move" as const,
        commandId: CommandId.make("move-frame"),
        projectId,
        objectId: frame.id,
        position: { x: 125, y: 240 },
        expectedRevision: frame.revision,
        createdAt: "2026-08-17T00:01:00.000Z",
      };
      const committed = yield* board.dispatch(command);
      const liveDelta = yield* Queue.take(received);
      assert.deepStrictEqual(liveDelta, {
        kind: "object-upserted",
        projectId,
        sequence: committed.sequence,
        commandId: command.commandId,
        object: {
          ...frame,
          position: command.position,
          revision: frame.revision + 1,
          updatedAt: command.createdAt,
        },
      });

      const duplicate = yield* board.dispatch(command);
      assert.strictEqual(duplicate.duplicate, true);
      assert.strictEqual(duplicate.sequence, committed.sequence);

      const reloaded = yield* board.getSnapshot(projectId);
      assert.deepStrictEqual(
        reloaded.objects.find((object) => object.id === frame.id)?.position,
        command.position,
      );
      assert.strictEqual(
        reloaded.objects.find((object) => object.id === frame.id)?.revision,
        frame.revision + 1,
      );
      const replayed = yield* board.replay(projectId, initial.sequence);
      assert.strictEqual(replayed.length, 1);
      const replayedDelta = replayed[0];
      assert.strictEqual(replayedDelta?.kind, "object-upserted");
      if (replayedDelta?.kind !== "object-upserted") return;
      assert.strictEqual(replayedDelta.object.id, BoardObjectId.make("thread:thread-1"));

      yield* board.dispatch({
        type: "board.thread-frame.place",
        commandId: CommandId.make("place-spawned-thread"),
        projectId,
        threadId: ThreadId.make("thread-2"),
        parentThreadId: ThreadId.make("thread-1"),
        position: { x: 640, y: 240 },
        createdAt: "2026-08-17T00:02:00.000Z",
      });
      const spatial = yield* board.getSnapshot(projectId);
      assert.deepStrictEqual(
        spatial.objects.find(
          (object) => object.kind === "thread-frame" && object.threadId === "thread-2",
        )?.position,
        { x: 640, y: 240 },
      );
      assert.strictEqual(spatial.relationships[0]?.kind, "spawned-from");

      const noteId = BoardObjectId.make("note:authority-test");
      yield* board.dispatch({
        type: "board.note.create",
        commandId: CommandId.make("create-authority-note"),
        projectId,
        objectId: noteId,
        position: { x: 0, y: 700 },
        title: "Private",
        text: "thread one only",
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: "2026-08-17T00:03:00.000Z",
      });
      const ownerView = yield* board.getAccessibleSnapshot(ThreadId.make("thread-1"));
      const siblingView = yield* board.getAccessibleSnapshot(ThreadId.make("thread-2"));
      assert.ok(ownerView.objects.some((object) => object.id === noteId));
      assert.ok(!siblingView.objects.some((object) => object.id === noteId));

      const denied = yield* Effect.result(
        board.dispatchAsThread(ThreadId.make("thread-2"), {
          type: "board.note.update",
          commandId: CommandId.make("unauthorized-note-update"),
          projectId,
          objectId: noteId,
          title: "Leaked",
          text: "nope",
          expectedRevision: 1,
          createdAt: "2026-08-17T00:04:00.000Z",
        }),
      );
      assert.strictEqual(denied._tag, "Failure");
      if (denied._tag === "Failure") assert.strictEqual(denied.failure.reason, "unauthorized");

      yield* board.dispatch({
        type: "board.grant.set",
        commandId: CommandId.make("share-authority-note"),
        projectId,
        threadId: ThreadId.make("thread-2"),
        objectIds: [noteId],
        access: "edit",
        createdAt: "2026-08-17T00:05:00.000Z",
      });
      const sharedView = yield* board.getAccessibleSnapshot(ThreadId.make("thread-2"));
      assert.ok(sharedView.objects.some((object) => object.id === noteId));
      yield* board.dispatchAsThread(ThreadId.make("thread-2"), {
        type: "board.note.update",
        commandId: CommandId.make("authorized-note-update"),
        projectId,
        objectId: noteId,
        title: "Shared",
        text: "updated safely",
        expectedRevision: 1,
        createdAt: "2026-08-17T00:06:00.000Z",
      });

      yield* board.dispatch({
        type: "board.authority.set",
        commandId: CommandId.make("grant-whole-board"),
        projectId,
        threadId: ThreadId.make("thread-2"),
        access: "edit",
        createdAt: "2026-08-17T00:07:00.000Z",
      });
      const wholeBoardView = yield* board.getAccessibleSnapshot(ThreadId.make("thread-2"));
      assert.strictEqual(
        wholeBoardView.objects.length,
        (yield* board.getSnapshot(projectId)).objects.length,
      );

      const batchNoteId = BoardObjectId.make("note:batch-service");
      yield* board.dispatchAsThread(ThreadId.make("thread-2"), {
        type: "board.batch",
        commandId: CommandId.make("atomic-board-edit"),
        projectId,
        originatingThreadId: ThreadId.make("thread-2"),
        createdAt: "2026-08-17T00:08:00.000Z",
        operations: [
          {
            type: "note.create",
            objectId: batchNoteId,
            position: { x: 800, y: 700 },
            title: "Atomic",
            text: "created",
          },
          {
            type: "note.update",
            objectId: batchNoteId,
            title: "Atomic",
            text: "created and revised",
            expectedRevision: 1,
          },
        ],
      });
      const afterBatch = yield* board.getSnapshot(projectId);
      assert.deepInclude(
        afterBatch.objects.find((object) => object.id === batchNoteId),
        { kind: "text-note", text: "created and revised", revision: 2 },
      );
      const privateShapeId = BoardObjectId.make("shape:future-private");
      yield* board.dispatch({
        type: "board.diagram-shape.create",
        commandId: CommandId.make("create-future-private-shape"),
        projectId,
        objectId: privateShapeId,
        position: { x: 1100, y: 700 },
        shape: "rectangle",
        label: "Future object",
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: "2026-08-17T00:08:30.000Z",
      });
      assert.ok(
        (yield* board.getAccessibleSnapshot(ThreadId.make("thread-2"))).objects.some(
          (object) => object.id === privateShapeId,
        ),
      );

      yield* board.dispatch({
        type: "board.authority.revoke",
        commandId: CommandId.make("revoke-whole-board"),
        projectId,
        threadId: ThreadId.make("thread-2"),
        access: "edit",
        createdAt: "2026-08-17T00:09:00.000Z",
      });
      const revokedView = yield* board.getAccessibleSnapshot(ThreadId.make("thread-2"));
      assert.ok(!revokedView.objects.some((object) => object.id === privateShapeId));
    }),
  );

  it.effect("does not expose another project's objects", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const board = yield* BoardService;
      const now = "2026-08-17T00:00:00.000Z";
      const projectId = ProjectId.make("isolated-project");
      yield* sql`
        INSERT INTO projection_projects (
          project_id, title, workspace_root, default_model_selection_json, scripts_json,
          created_at, updated_at, deleted_at
        ) VALUES (
          ${projectId}, ${"Isolated"}, ${"/workspace/isolated"}, ${null}, ${"[]"},
          ${now}, ${now}, ${null}
        )
      `;
      const result = yield* Effect.result(
        board.dispatch({
          type: "board.object.move",
          commandId: CommandId.make("cross-project-move"),
          projectId,
          objectId: BoardObjectId.make("thread:thread-1"),
          position: { x: 1, y: 1 },
          createdAt: now,
        }),
      );
      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") assert.strictEqual(result.failure.reason, "object-not-found");
    }),
  );
});
