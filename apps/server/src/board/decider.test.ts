import {
  BoardObjectId,
  BoardRelationshipId,
  CommandId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
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

  it("validates line ranges and revision-safely resizes artifacts", () => {
    expect(() =>
      decideBoardCommand(
        {
          type: "board.file-reference.create",
          commandId: CommandId.make("file-range"),
          projectId,
          objectId: BoardObjectId.make("file:range"),
          position: { x: 0, y: 0 },
          path: "src/index.ts",
          startLine: 20,
          endLine: 10,
          createdAt: now,
        },
        { objects: [], threadIds: [] },
      ),
    ).toThrow(/must end after/);

    const group = {
      id: BoardObjectId.make("group:resize"),
      projectId,
      kind: "group" as const,
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      title: "Group",
      revision: 2,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const [event] = decideBoardCommand(
      {
        type: "board.object.update",
        commandId: CommandId.make("resize-group"),
        projectId,
        objectId: group.id,
        size: { width: 800, height: 640 },
        title: "System",
        expectedRevision: 2,
        createdAt: now,
      },
      { objects: [group], threadIds: [] },
    );
    expect(event).toMatchObject({
      type: "board.object-updated",
      object: { title: "System", size: { width: 800, height: 640 }, revision: 3 },
    });
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

  it("resolves obvious collisions for created and relative agent artifacts", () => {
    const existing = {
      id: BoardObjectId.make("note:existing"),
      projectId,
      kind: "text-note" as const,
      position: { x: 520, y: 0 },
      size: { width: 320, height: 240 },
      title: "Existing",
      text: "Existing",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const created = decideBoardCommand(
      {
        type: "board.diagram-shape.create",
        commandId: CommandId.make("create-collision-shape"),
        projectId,
        objectId: BoardObjectId.make("shape:collision"),
        position: { x: 520, y: 0 },
        shape: "rectangle",
        label: "Resolved",
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: now,
      },
      { objects: [existing], threadIds: [ThreadId.make("thread-1")] },
    );
    expect(created).toMatchObject([
      { type: "board.object-created", object: { position: { x: 520, y: 280 } } },
      { type: "board.grant-updated", grant: { access: "edit" } },
    ]);

    const moved = decideBoardCommand(
      {
        type: "board.object.move",
        commandId: CommandId.make("move-relative-collision"),
        projectId,
        objectId: BoardObjectId.make("shape:moving"),
        position: { x: 520, y: 0 },
        resolveCollisions: true,
        expectedRevision: 1,
        createdAt: now,
      },
      {
        objects: [
          existing,
          {
            id: BoardObjectId.make("shape:moving"),
            projectId,
            kind: "diagram-shape",
            position: { x: 0, y: 0 },
            size: { width: 220, height: 120 },
            shape: "rectangle",
            label: "Moving",
            revision: 1,
            createdAt: now,
            updatedAt: now,
            tombstonedAt: null,
          },
        ],
        threadIds: [],
      },
    );
    expect(moved[0]).toMatchObject({
      type: "board.object-moved",
      position: { x: 520, y: 280 },
    });
  });

  it("updates arbitrary objects and relationships inside one atomic batch", () => {
    const shapeId = BoardObjectId.make("shape:batch");
    const noteId = BoardObjectId.make("note:batch-target");
    const relationshipId = BoardRelationshipId.make("relationship:batch");
    const shape = {
      id: shapeId,
      projectId,
      kind: "diagram-shape" as const,
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 },
      shape: "rectangle" as const,
      label: "Before",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const note = {
      id: noteId,
      projectId,
      kind: "text-note" as const,
      position: { x: 300, y: 0 },
      size: { width: 320, height: 240 },
      title: "Target",
      text: "Target",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    const relationship = {
      id: relationshipId,
      projectId,
      kind: "connector" as const,
      label: "Before",
      sourceObjectId: shapeId,
      targetObjectId: noteId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };

    const events = decideBoardCommand(
      {
        type: "board.batch",
        commandId: CommandId.make("batch-semantic-update"),
        projectId,
        originatingThreadId: ThreadId.make("thread-1"),
        createdAt: now,
        operations: [
          {
            type: "object.update",
            objectId: shapeId,
            shape: "diamond",
            label: "After",
            expectedRevision: 1,
          },
          {
            type: "relationship.update",
            relationshipId,
            label: "After",
            tombstoned: true,
            expectedRevision: 1,
          },
        ],
      },
      { objects: [shape, note], grants: [], relationships: [relationship], threadIds: [] },
    );

    expect(events).toMatchObject([
      { type: "board.object-updated", object: { shape: "diamond", label: "After", revision: 2 } },
      {
        type: "board.relationship-created",
        relationship: { label: "After", revision: 2, tombstonedAt: now },
      },
    ]);
  });
});
