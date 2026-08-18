import { BoardObjectId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  boardObjectIntersectsViewport,
  fitBoardCamera,
  pinchBoardCamera,
  shouldStartBoardPan,
  zoomBoardCameraAtPoint,
} from "./BoardViewport";

describe("board viewport", () => {
  it("keeps the world point below a pinch focal point stable", () => {
    const camera = { x: 40, y: 60, zoom: 1 };
    const next = zoomBoardCameraAtPoint(camera, { x: 240, y: 260 }, 1.5);
    expect((240 - next.x) / next.zoom).toBe(200);
    expect((260 - next.y) / next.zoom).toBe(200);
  });

  it("combines two-finger pan and focal pinch zoom", () => {
    const next = pinchBoardCamera({
      startCamera: { x: 0, y: 0, zoom: 1 },
      startMidpoint: { x: 100, y: 100 },
      currentMidpoint: { x: 140, y: 120 },
      startDistance: 100,
      currentDistance: 150,
    });
    expect(next).toEqual({ x: -10, y: -30, zoom: 1.5 });
  });

  it("arbitrates frame dragging from space- and middle-button panning", () => {
    expect(shouldStartBoardPan({ button: 0, spacePressed: false, canvasTarget: true })).toBe(false);
    expect(shouldStartBoardPan({ button: 0, spacePressed: true, canvasTarget: true })).toBe(true);
    expect(shouldStartBoardPan({ button: 1, spacePressed: false, canvasTarget: false })).toBe(true);
  });

  it("frames active objects with padding", () => {
    const now = "2026-08-17T00:00:00.000Z";
    const camera = fitBoardCamera(
      [
        {
          id: BoardObjectId.make("thread:thread-1"),
          projectId: ProjectId.make("project-1"),
          kind: "thread-frame",
          threadId: ThreadId.make("thread-1"),
          position: { x: 0, y: 0 },
          size: { width: 440, height: 560 },
          frameSize: "standard",
          revision: 1,
          createdAt: now,
          updatedAt: now,
          tombstonedAt: null,
        },
      ],
      { width: 1000, height: 800 },
    );
    expect(camera.zoom).toBe(1);
    expect(camera.x).toBe(280);
    expect(camera.y).toBe(120);
  });

  it("culls objects well outside the local viewport", () => {
    const now = "2026-08-17T00:00:00.000Z";
    const object = {
      id: BoardObjectId.make("thread:thread-1"),
      projectId: ProjectId.make("project-1"),
      kind: "thread-frame" as const,
      threadId: ThreadId.make("thread-1"),
      position: { x: 5000, y: 5000 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    };
    expect(
      boardObjectIntersectsViewport(object, { x: 0, y: 0, zoom: 1 }, { width: 1000, height: 800 }),
    ).toBe(false);
  });

  it("retains only nearby cards from a hundreds-object board", () => {
    const now = "2026-08-17T00:00:00.000Z";
    const objects = Array.from({ length: 400 }, (_, index) => ({
      id: BoardObjectId.make(`thread:thread-${index}`),
      projectId: ProjectId.make("project-1"),
      kind: "thread-frame" as const,
      threadId: ThreadId.make(`thread-${index}`),
      position: { x: (index % 20) * 600, y: Math.floor(index / 20) * 700 },
      size: { width: 440, height: 560 },
      frameSize: "standard" as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    }));
    const mounted = objects.filter((object) =>
      boardObjectIntersectsViewport(
        object,
        { x: 0, y: 0, zoom: 0.5 },
        { width: 1440, height: 900 },
      ),
    );
    expect(mounted.length).toBeLessThan(30);
  });
});
