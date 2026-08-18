import { BoardObjectId, CommandId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { decideBoardCommand } from "./decider.ts";

const now = "2026-08-17T00:00:00.000Z";
const projectId = ProjectId.make("project-1");

describe("board decider", () => {
  it("creates one stable frame for every unframed thread", () => {
    const events = decideBoardCommand(
      {
        type: "board.thread-frames.ensure",
        commandId: CommandId.make("ensure-1"),
        projectId,
        createdAt: now,
      },
      { objects: [], threadIds: [ThreadId.make("thread-1"), ThreadId.make("thread-2")] },
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      "board.object-created",
      "board.object-created",
    ]);
  });

  it("advances the frame revision when it moves", () => {
    const object = {
      id: BoardObjectId.make("thread:thread-1"),
      projectId,
      kind: "thread-frame" as const,
      threadId: ThreadId.make("thread-1"),
      position: { x: 0, y: 0 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 2,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const [event] = decideBoardCommand(
      {
        type: "board.object.move",
        commandId: CommandId.make("move-1"),
        projectId,
        objectId: object.id,
        position: { x: 50, y: 80 },
        expectedRevision: 2,
        createdAt: now,
      },
      { objects: [object], threadIds: [] },
    );
    expect(event).toMatchObject({ type: "board.object-moved", revision: 3 });
  });

  it("places a thread beside its parent and records provenance", () => {
    const parent = {
      id: BoardObjectId.make("thread:thread-1"),
      projectId,
      kind: "thread-frame" as const,
      threadId: ThreadId.make("thread-1"),
      position: { x: 0, y: 0 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const events = decideBoardCommand(
      {
        type: "board.thread-frame.place",
        commandId: CommandId.make("place-1"),
        projectId,
        threadId: ThreadId.make("thread-2"),
        parentThreadId: parent.threadId,
        position: { x: 520, y: 0 },
        createdAt: now,
      },
      {
        objects: [parent],
        relationships: [],
        threadIds: [parent.threadId, ThreadId.make("thread-2")],
      },
    );
    expect(events.map((event) => event.type)).toEqual([
      "board.object-created",
      "board.relationship-created",
    ]);
  });

  it("rejects a stale expected revision", () => {
    const object = {
      id: BoardObjectId.make("thread:thread-1"),
      projectId,
      kind: "thread-frame" as const,
      threadId: ThreadId.make("thread-1"),
      position: { x: 0, y: 0 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 2,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    expect(() =>
      decideBoardCommand(
        {
          type: "board.object.move",
          commandId: CommandId.make("move-stale"),
          projectId,
          objectId: object.id,
          position: { x: 1, y: 1 },
          expectedRevision: 1,
          createdAt: now,
        },
        { objects: [object], threadIds: [] },
      ),
    ).toThrow(/changed before this operation/);
  });

  it("revises, tombstones, and restores a durable note", () => {
    const [created] = decideBoardCommand(
      {
        type: "board.note.create",
        commandId: CommandId.make("note-create"),
        projectId,
        objectId: BoardObjectId.make("note:1"),
        position: { x: 40, y: 60 },
        title: "Finding",
        text: "Initial",
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: now,
      },
      { objects: [], threadIds: [] },
    );
    if (created?.type !== "board.object-created") throw new Error("Expected note creation");
    const note = created.object;
    const [updated] = decideBoardCommand(
      {
        type: "board.note.update",
        commandId: CommandId.make("note-update"),
        projectId,
        objectId: note.id,
        title: "Finding",
        text: "Revised",
        expectedRevision: 1,
        createdAt: now,
      },
      { objects: [note], threadIds: [] },
    );
    expect(updated).toMatchObject({
      type: "board.object-updated",
      object: { kind: "text-note", text: "Revised", revision: 2 },
    });
    expect(() =>
      decideBoardCommand(
        {
          type: "board.object.tombstone",
          commandId: CommandId.make("note-delete-stale"),
          projectId,
          objectId: note.id,
          expectedRevision: 0,
          createdAt: now,
        },
        { objects: [note], threadIds: [] },
      ),
    ).toThrow(/changed before this operation/);
  });

  it("rejects file references that escape the project", () => {
    expect(() =>
      decideBoardCommand(
        {
          type: "board.file-reference.create",
          commandId: CommandId.make("file-escape"),
          projectId,
          objectId: BoardObjectId.make("file:1"),
          position: { x: 0, y: 0 },
          path: "../../secrets.txt",
          createdAt: now,
        },
        { objects: [], threadIds: [] },
      ),
    ).toThrow(/inside the project workspace/);
  });

  it("shares and revokes artifact authority explicitly", () => {
    const threadId = ThreadId.make("thread-1");
    const frame = {
      id: BoardObjectId.make("thread:thread-1"),
      projectId,
      kind: "thread-frame" as const,
      threadId,
      position: { x: 0, y: 0 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const note = {
      id: BoardObjectId.make("note:shared"),
      projectId,
      kind: "text-note" as const,
      position: { x: 520, y: 0 },
      size: { width: 320, height: 240 },
      title: "Shared",
      text: "Context",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const events = decideBoardCommand(
      {
        type: "board.grant.set",
        commandId: CommandId.make("share-1"),
        projectId,
        threadId,
        objectIds: [note.id],
        access: "edit",
        createdAt: now,
      },
      { objects: [frame, note], relationships: [], grants: [], threadIds: [threadId] },
    );
    expect(events.map((event) => event.type)).toEqual([
      "board.grant-updated",
      "board.relationship-created",
    ]);
    expect(events[0]).toMatchObject({ grant: { access: "edit", revokedAt: null } });
  });

  it("evaluates an atomic batch against the state produced by earlier operations", () => {
    const noteId = BoardObjectId.make("note:batch");
    const events = decideBoardCommand(
      {
        type: "board.batch",
        commandId: CommandId.make("batch-1"),
        projectId,
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: now,
        operations: [
          {
            type: "note.create",
            objectId: noteId,
            position: { x: 10, y: 20 },
            title: "Plan",
            text: "First",
          },
          {
            type: "note.update",
            objectId: noteId,
            title: "Plan",
            text: "Committed together",
            expectedRevision: 1,
          },
          {
            type: "object.move",
            objectId: noteId,
            position: { x: 90, y: 120 },
            expectedRevision: 2,
          },
        ],
      },
      { objects: [], grants: [], relationships: [], threadIds: [] },
    );

    expect(events.map((event) => event.type)).toEqual([
      "board.object-created",
      "board.grant-updated",
      "board.object-updated",
      "board.object-moved",
    ]);
    expect(events.at(-1)).toMatchObject({ revision: 3, position: { x: 90, y: 120 } });
  });
});
