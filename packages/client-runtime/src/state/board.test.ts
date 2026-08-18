import {
  BoardObjectId,
  BoardRelationshipId,
  CommandId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyBoardStreamItem } from "./board.ts";

const projectId = ProjectId.make("project-1");
const object = {
  id: BoardObjectId.make("thread:thread-1"),
  projectId,
  kind: "thread-frame" as const,
  threadId: ThreadId.make("thread-1"),
  position: { x: 0, y: 0 },
  size: { width: 440, height: 560 },
  frameSize: "standard" as const,
  revision: 1,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  tombstonedAt: null,
};

describe("board stream reducer", () => {
  it("hydrates from a board-only snapshot and applies an ordered delta", () => {
    const hydrated = applyBoardStreamItem(null, {
      kind: "snapshot",
      snapshot: { projectId, sequence: 1, objects: [object], relationships: [], grants: [] },
    });
    const moved = applyBoardStreamItem(hydrated, {
      kind: "object-upserted",
      projectId,
      sequence: 2,
      commandId: CommandId.make("move-1"),
      object: { ...object, position: { x: 80, y: 120 }, revision: 2 },
    });
    expect(moved?.sequence).toBe(2);
    expect(moved?.objects[0]?.position).toEqual({ x: 80, y: 120 });
  });

  it("ignores duplicate or out-of-order deltas", () => {
    const snapshot = { projectId, sequence: 4, objects: [object], relationships: [], grants: [] };
    const result = applyBoardStreamItem(snapshot, {
      kind: "object-upserted",
      projectId,
      sequence: 4,
      commandId: CommandId.make("duplicate"),
      object: { ...object, position: { x: 999, y: 999 }, revision: 2 },
    });
    expect(result).toBe(snapshot);
  });

  it("converges independent clients and rehydrates reconnects without duplicate changes", () => {
    const initialItem = {
      kind: "snapshot" as const,
      snapshot: { projectId, sequence: 1, objects: [object], relationships: [], grants: [] },
    };
    let firstClient = applyBoardStreamItem(null, initialItem);
    let secondClient = applyBoardStreamItem(null, initialItem);
    const committedMove = {
      kind: "object-upserted" as const,
      projectId,
      sequence: 2,
      commandId: CommandId.make("move-from-first-client"),
      object: { ...object, position: { x: 320, y: 180 }, revision: 2 },
    };

    firstClient = applyBoardStreamItem(firstClient, committedMove);
    secondClient = applyBoardStreamItem(secondClient, committedMove);
    expect(secondClient).toEqual(firstClient);

    const reconnected = applyBoardStreamItem(null, {
      kind: "snapshot",
      snapshot: firstClient!,
    });
    expect(applyBoardStreamItem(reconnected, committedMove)).toBe(reconnected);
    expect(reconnected).toEqual(firstClient);
  });

  it("applies relationship deltas without replacing board objects", () => {
    const snapshot = { projectId, sequence: 1, objects: [object], relationships: [], grants: [] };
    const result = applyBoardStreamItem(snapshot, {
      kind: "relationship-upserted",
      projectId,
      sequence: 2,
      commandId: CommandId.make("spawn-1"),
      relationship: {
        id: BoardRelationshipId.make("spawned:thread-1:thread-2"),
        projectId,
        kind: "spawned-from",
        sourceObjectId: object.id,
        targetObjectId: BoardObjectId.make("thread:thread-2"),
        revision: 1,
        createdAt: object.createdAt,
        updatedAt: object.updatedAt,
        tombstonedAt: null,
      },
    });
    expect(result?.objects).toEqual([object]);
    expect(result?.relationships).toHaveLength(1);
  });

  it("applies grant and revocation deltas", () => {
    const snapshot = { projectId, sequence: 1, objects: [object], relationships: [], grants: [] };
    const grant = {
      projectId,
      threadId: object.threadId,
      objectId: object.id,
      access: "read" as const,
      createdAt: object.createdAt,
      revokedAt: null,
    };
    const shared = applyBoardStreamItem(snapshot, {
      kind: "grant-upserted",
      projectId,
      sequence: 2,
      commandId: CommandId.make("grant-1"),
      grant,
    });
    const revoked = applyBoardStreamItem(shared, {
      kind: "grant-upserted",
      projectId,
      sequence: 3,
      commandId: CommandId.make("revoke-1"),
      grant: { ...grant, revokedAt: "2026-08-17T01:00:00.000Z" },
    });
    expect(revoked?.grants).toEqual([{ ...grant, revokedAt: "2026-08-17T01:00:00.000Z" }]);
  });

  it("applies project authority defaults independently of thread grants", () => {
    const snapshot = { projectId, sequence: 1, objects: [object], relationships: [], grants: [] };
    const result = applyBoardStreamItem(snapshot, {
      kind: "authority-upserted",
      projectId,
      sequence: 2,
      commandId: CommandId.make("policy-1"),
      authority: {
        projectId,
        defaultReadScope: "board",
        defaultWriteAuthority: "own",
        updatedAt: object.updatedAt,
      },
    });
    expect(result?.authority?.defaultReadScope).toBe("board");
    expect(result?.grants).toEqual([]);
  });
});
