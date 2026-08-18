import { BoardObjectId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  BOARD_CONTEXT_TILE_WIDTH,
  BOARD_DIRECT_TEXT_LIMIT,
  renderBoardProviderContext,
  providerBoardContextSupportsImages,
} from "./context.ts";

const now = "2026-08-17T00:00:00.000Z";
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");

describe("board provider context", () => {
  it("uses structured fallback for providers without board image input", () => {
    expect(providerBoardContextSupportsImages("codex")).toBe(true);
    expect(providerBoardContextSupportsImages("claudeAgent")).toBe(true);
    expect(providerBoardContextSupportsImages("cursor")).toBe(true);
    expect(providerBoardContextSupportsImages("grok")).toBe(false);
    expect(providerBoardContextSupportsImages("opencode")).toBe(false);
  });
  it("includes only explicit grants and keeps large text lazy", () => {
    const sharedId = BoardObjectId.make("note:shared");
    const privateId = BoardObjectId.make("note:private");
    const result = renderBoardProviderContext({
      threadId,
      supportsImages: false,
      snapshot: {
        projectId,
        sequence: 1,
        objects: [
          {
            id: sharedId,
            projectId,
            kind: "text-note",
            position: { x: 0, y: 0 },
            size: { width: 320, height: 240 },
            title: "Shared",
            text: "x".repeat(BOARD_DIRECT_TEXT_LIMIT + 1),
            revision: 1,
            createdAt: now,
            updatedAt: now,
            tombstonedAt: null,
          },
          {
            id: privateId,
            projectId,
            kind: "text-note",
            position: { x: 200, y: 0 },
            size: { width: 320, height: 240 },
            title: "Private",
            text: "secret",
            revision: 1,
            createdAt: now,
            updatedAt: now,
            tombstonedAt: null,
          },
        ],
        relationships: [],
        grants: [
          {
            projectId,
            threadId,
            objectId: sharedId,
            access: "read",
            createdAt: now,
            revokedAt: null,
          },
        ],
      },
    });
    expect(result.manifest.map((item) => item.id)).toEqual([sharedId]);
    expect(result.directText).toEqual([]);
    expect(result.lazyObjectIds).toEqual([sharedId]);
  });

  it("splits distant selections into readable image tiles with stable ids", () => {
    const makeNote = (id: string, x: number) => ({
      id: BoardObjectId.make(id),
      projectId,
      kind: "text-note" as const,
      position: { x, y: 0 },
      size: { width: 320, height: 240 },
      title: id,
      text: "small",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    });
    const objects = [
      makeNote("note:left", 0),
      makeNote("note:right", BOARD_CONTEXT_TILE_WIDTH + 1),
    ];
    const result = renderBoardProviderContext({
      threadId,
      supportsImages: true,
      snapshot: {
        projectId,
        sequence: 1,
        objects,
        relationships: [],
        grants: objects.map((object) => ({
          projectId,
          threadId,
          objectId: object.id,
          access: "read" as const,
          createdAt: now,
          revokedAt: null,
        })),
      },
    });
    expect(result.mode).toBe("image-plus-structure");
    expect(result.tiles.map((tile) => tile.id)).toEqual(["tile:0:0", "tile:1:0"]);
    expect(result.tiles[0]?.imageDataUrl).toContain("data:image/svg+xml");
  });
});
