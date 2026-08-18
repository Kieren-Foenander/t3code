import type { BoardObject, BoardPoint } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const MIN_BOARD_ZOOM = 0.35;
export const MAX_BOARD_ZOOM = 1.8;

export const BoardCamera = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  zoom: Schema.Finite,
});
export type BoardCamera = typeof BoardCamera.Type;

export function clampBoardZoom(zoom: number): number {
  return Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, zoom));
}

export function zoomBoardCameraAtPoint(
  camera: BoardCamera,
  focalPoint: BoardPoint,
  requestedZoom: number,
): BoardCamera {
  const zoom = clampBoardZoom(requestedZoom);
  const worldX = (focalPoint.x - camera.x) / camera.zoom;
  const worldY = (focalPoint.y - camera.y) / camera.zoom;
  return {
    x: focalPoint.x - worldX * zoom,
    y: focalPoint.y - worldY * zoom,
    zoom,
  };
}

export function pinchBoardCamera(input: {
  readonly startCamera: BoardCamera;
  readonly startMidpoint: BoardPoint;
  readonly currentMidpoint: BoardPoint;
  readonly startDistance: number;
  readonly currentDistance: number;
}): BoardCamera {
  const zoomed = zoomBoardCameraAtPoint(
    input.startCamera,
    input.startMidpoint,
    input.startCamera.zoom * (input.currentDistance / Math.max(1, input.startDistance)),
  );
  return {
    ...zoomed,
    x: zoomed.x + input.currentMidpoint.x - input.startMidpoint.x,
    y: zoomed.y + input.currentMidpoint.y - input.startMidpoint.y,
  };
}

export function fitBoardCamera(
  objects: ReadonlyArray<BoardObject>,
  viewport: { readonly width: number; readonly height: number },
  padding = 72,
): BoardCamera {
  const visible = objects.filter((object) => object.tombstonedAt === null);
  if (visible.length === 0) return { x: padding, y: padding, zoom: 1 };
  const minX = Math.min(...visible.map((object) => object.position.x));
  const minY = Math.min(...visible.map((object) => object.position.y));
  const maxX = Math.max(...visible.map((object) => object.position.x + object.size.width));
  const maxY = Math.max(...visible.map((object) => object.position.y + object.size.height));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const zoom = clampBoardZoom(
    Math.min(
      (viewport.width - padding * 2) / contentWidth,
      (viewport.height - padding * 2) / contentHeight,
      1,
    ),
  );
  return {
    x: (viewport.width - contentWidth * zoom) / 2 - minX * zoom,
    y: (viewport.height - contentHeight * zoom) / 2 - minY * zoom,
    zoom,
  };
}

export function shouldStartBoardPan(input: {
  readonly button: number;
  readonly spacePressed: boolean;
  readonly canvasTarget: boolean;
}): boolean {
  return input.button === 1 || (input.button === 0 && input.spacePressed && input.canvasTarget);
}

export function boardObjectIntersectsViewport(
  object: BoardObject,
  camera: BoardCamera,
  viewport: { readonly width: number; readonly height: number },
  margin = 200,
): boolean {
  const left = object.position.x * camera.zoom + camera.x;
  const top = object.position.y * camera.zoom + camera.y;
  const right = left + object.size.width * camera.zoom;
  const bottom = top + object.size.height * camera.zoom;
  return (
    right >= -margin &&
    bottom >= -margin &&
    left <= viewport.width + margin &&
    top <= viewport.height + margin
  );
}
