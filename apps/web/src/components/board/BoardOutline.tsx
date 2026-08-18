import type { BoardObject, BoardObjectId, ThreadId } from "@t3tools/contracts";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

interface BoardOutlineProps {
  readonly objects: ReadonlyArray<BoardObject>;
  readonly threadsById: ReadonlyMap<ThreadId, EnvironmentThreadShell>;
  readonly selectedObjectId: BoardObjectId | null;
  readonly showDeleted: boolean;
  readonly onSelect: (object: BoardObject) => void;
}

function objectLabel(
  object: BoardObject,
  threadsById: ReadonlyMap<ThreadId, EnvironmentThreadShell>,
): string {
  switch (object.kind) {
    case "thread-frame":
      return threadsById.get(object.threadId)?.title ?? "Archived thread";
    case "text-note":
      return object.title;
    case "file-reference":
      return object.path;
    case "diagram-shape":
      return object.label || "Diagram shape";
    case "group":
      return object.title;
  }
}

export function BoardOutline({
  objects,
  threadsById,
  selectedObjectId,
  showDeleted,
  onSelect,
}: BoardOutlineProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return objects
      .filter((object) => showDeleted || object.tombstonedAt === null)
      .filter(
        (object) =>
          !needle ||
          objectLabel(object, threadsById).toLowerCase().includes(needle) ||
          object.kind.includes(needle),
      )
      .toSorted((left, right) => {
        const kindOrder = ["group", "thread-frame", "text-note", "file-reference", "diagram-shape"];
        return (
          kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind) ||
          objectLabel(left, threadsById).localeCompare(objectLabel(right, threadsById))
        );
      });
  }, [objects, query, showDeleted, threadsById]);

  return (
    <aside
      className="absolute bottom-4 left-4 top-[4.5rem] z-20 flex w-60 flex-col overflow-hidden rounded-xl border border-border bg-background/92 shadow-lg backdrop-blur-md"
      aria-label="Board outline"
    >
      <label className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <SearchIcon className="size-4 text-muted-foreground" />
        <span className="sr-only">Search board</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search board"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tree" aria-label="Board objects">
        {visible.map((object) => {
          const label = objectLabel(object, threadsById);
          const accessDescription =
            object.kind === "thread-frame" ? "Thread" : object.kind.replaceAll("-", " ");
          return (
            <button
              key={object.id}
              type="button"
              role="treeitem"
              aria-selected={selectedObjectId === object.id}
              aria-label={`${accessDescription}: ${label}`}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary ${
                selectedObjectId === object.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => onSelect(object)}
            >
              <span className="w-16 shrink-0 truncate text-[10px] uppercase tracking-wide opacity-70">
                {object.kind === "thread-frame" ? "thread" : object.kind}
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {object.tombstonedAt !== null ? (
                <span className="text-[10px] uppercase text-muted-foreground">Deleted</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
