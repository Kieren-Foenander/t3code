import {
  BOARD_WHOLE_BOARD_OBJECT_ID,
  type BoardObject,
  type BoardSnapshot,
  type ThreadId,
} from "@t3tools/contracts";

export const BOARD_DIRECT_TEXT_LIMIT = 2_000;
export const BOARD_CONTEXT_TILE_WIDTH = 1_200;
export const BOARD_CONTEXT_TILE_HEIGHT = 800;

export function providerBoardContextSupportsImages(providerKind: string | undefined): boolean {
  return providerKind === "codex" || providerKind === "claudeAgent" || providerKind === "cursor";
}

const labelFor = (object: BoardObject): string => {
  switch (object.kind) {
    case "thread-frame":
      return `Thread ${object.threadId}`;
    case "text-note":
    case "group":
      return object.title;
    case "file-reference":
      return object.path;
    case "diagram-shape":
      return object.label || object.shape;
  }
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const renderTile = (objects: ReadonlyArray<BoardObject>, tileX: number, tileY: number): string => {
  const originX = tileX * BOARD_CONTEXT_TILE_WIDTH;
  const originY = tileY * BOARD_CONTEXT_TILE_HEIGHT;
  const nodes = objects
    .map((object) => {
      const x = Math.max(8, object.position.x - originX);
      const y = Math.max(8, object.position.y - originY);
      const width = Math.min(Math.max(100, object.size.width), BOARD_CONTEXT_TILE_WIDTH - x - 8);
      const height = Math.min(Math.max(54, object.size.height), BOARD_CONTEXT_TILE_HEIGHT - y - 8);
      return `<g data-board-object-id="${escapeXml(object.id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#fff" stroke="#64748b"/><text x="${x + 10}" y="${y + 24}" font-family="sans-serif" font-size="14" fill="#0f172a">${escapeXml(labelFor(object).slice(0, 80))}</text><text x="${x + 10}" y="${y + 44}" font-family="monospace" font-size="10" fill="#475569">${escapeXml(object.id)}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_CONTEXT_TILE_WIDTH} ${BOARD_CONTEXT_TILE_HEIGHT}" width="${BOARD_CONTEXT_TILE_WIDTH}" height="${BOARD_CONTEXT_TILE_HEIGHT}"><rect width="100%" height="100%" fill="#f8fafc"/>${nodes}</svg>`;
};

export function renderBoardProviderContext(input: {
  readonly snapshot: BoardSnapshot;
  readonly threadId: ThreadId;
  readonly supportsImages: boolean;
}) {
  const explicitlySharedIds = new Set(
    input.snapshot.grants.flatMap((grant) =>
      grant.threadId === input.threadId &&
      grant.revokedAt === null &&
      grant.objectId !== BOARD_WHOLE_BOARD_OBJECT_ID
        ? [grant.objectId]
        : [],
    ),
  );
  const objects = input.snapshot.objects.filter(
    (object) => explicitlySharedIds.has(object.id) && object.tombstonedAt === null,
  );
  const manifest = objects.map((object) => ({
    id: object.id,
    kind: object.kind,
    revision: object.revision,
    label: labelFor(object),
    access:
      input.snapshot.grants.find(
        (grant) =>
          grant.threadId === input.threadId &&
          grant.objectId === object.id &&
          grant.revokedAt === null,
      )?.access ?? ("read" as const),
    position: object.position,
    size: object.size,
  }));
  const directText = objects.flatMap((object) =>
    object.kind === "text-note" && object.text.length <= BOARD_DIRECT_TEXT_LIMIT
      ? [{ id: object.id, revision: object.revision, title: object.title, text: object.text }]
      : [],
  );
  const lazyObjectIds = objects.flatMap((object) =>
    object.kind !== "text-note" || object.text.length > BOARD_DIRECT_TEXT_LIMIT ? [object.id] : [],
  );
  const tileGroups = new Map<string, BoardObject[]>();
  for (const object of objects) {
    const tileX = Math.floor(object.position.x / BOARD_CONTEXT_TILE_WIDTH);
    const tileY = Math.floor(object.position.y / BOARD_CONTEXT_TILE_HEIGHT);
    const key = `${tileX}:${tileY}`;
    const group = tileGroups.get(key) ?? [];
    group.push(object);
    tileGroups.set(key, group);
  }
  const tiles = input.supportsImages
    ? [...tileGroups.entries()].map(([key, tileObjects]) => {
        const [tileX, tileY] = key.split(":").map(Number) as [number, number];
        const svg = renderTile(tileObjects, tileX, tileY);
        return {
          id: `tile:${tileX}:${tileY}`,
          objectIds: tileObjects.map((object) => object.id),
          imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        };
      })
    : [];
  return {
    mode: input.supportsImages ? ("image-plus-structure" as const) : ("structure-only" as const),
    manifest,
    directText,
    lazyObjectIds,
    tiles,
  };
}
