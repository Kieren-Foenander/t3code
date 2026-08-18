import type { BoardFileReference, BoardPoint, EnvironmentId } from "@t3tools/contracts";
import { FileCode2Icon, RefreshCwIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Button } from "../ui/button";

interface BoardFileReferenceCardProps {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly object: BoardFileReference;
  readonly position: BoardPoint;
  readonly access?: "read" | "edit";
  readonly onSelect: () => void;
  readonly onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function BoardFileReferenceCard({
  environmentId,
  workspaceRoot,
  object,
  position,
  access,
  onSelect,
  onDragStart,
}: BoardFileReferenceCardProps) {
  const file = useProjectFileQuery(
    environmentId,
    workspaceRoot,
    object.path,
    true,
    object.checkpointRef,
  );
  const lines = file.data?.contents.split("\n") ?? [];
  const start = Math.max(0, (object.startLine ?? 1) - 1);
  const end = object.endLine ?? lines.length;
  const visible = lines.slice(start, end).join("\n");

  return (
    <article
      className={`absolute flex h-80 w-[440px] flex-col overflow-hidden rounded-xl border bg-card shadow-lg ${
        access === "edit"
          ? "border-emerald-500 ring-2 ring-emerald-500/20"
          : access === "read"
            ? "border-sky-500 ring-2 ring-sky-500/20"
            : "border-border"
      }`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-label={`File reference: ${object.path}`}
      data-board-access={access ?? "inaccessible"}
      onClick={onSelect}
    >
      <header
        className="flex h-11 cursor-grab items-center gap-2 border-b border-border/70 px-3 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <FileCode2Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{object.path}</span>
        {object.checkpointRef ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Pinned
          </span>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Refresh file reference"
          onClick={file.refresh}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <RefreshCwIcon />
        </Button>
      </header>
      {file.error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
          Source unavailable: {file.error}
        </div>
      ) : file.isPending && !file.data ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading source…
        </div>
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto p-3 text-xs leading-relaxed">
          <code>{visible}</code>
        </pre>
      )}
      <footer className="border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
        {object.checkpointRef ? "Checkpoint snapshot" : "Live file"}
        {object.startLine === undefined
          ? null
          : ` · Lines ${object.startLine}–${object.endLine ?? "end"}`}
      </footer>
    </article>
  );
}
