import { BoardObjectId, ProjectId, ThreadId, type BoardSnapshot } from "./index.ts";
import { describe, expect, it } from "vite-plus/test";

describe("board wire budgets", () => {
  it("keeps a representative 500-object snapshot and one-object delta bounded", () => {
    const now = "2026-08-17T00:00:00.000Z";
    const projectId = ProjectId.make("project-1");
    const objects = Array.from({ length: 500 }, (_, index) => ({
      id: BoardObjectId.make(`note:${index}`),
      projectId,
      kind: "text-note" as const,
      position: { x: (index % 25) * 380, y: Math.floor(index / 25) * 300 },
      size: { width: 320, height: 240 },
      title: `Artifact ${index}`,
      text: "Representative board context",
      originatingThreadId: ThreadId.make(`thread-${index % 8}`),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    }));
    const snapshot: BoardSnapshot = {
      projectId,
      sequence: 500,
      objects,
      relationships: [],
      grants: [],
    };
    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    const deltaBytes = new TextEncoder().encode(
      JSON.stringify({
        kind: "object-upserted",
        projectId,
        sequence: 501,
        commandId: "move-501",
        object: { ...objects[0], position: { x: 10, y: 10 }, revision: 2 },
      }),
    ).byteLength;
    expect(snapshotBytes).toBeLessThan(512_000);
    expect(deltaBytes).toBeLessThan(2_000);
  });
});
