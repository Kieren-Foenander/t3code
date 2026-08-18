import type { BoardPoint, BoardTextNote, EnvironmentId } from "@t3tools/contracts";
import { ArchiveRestoreIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

import { environmentBoards } from "../../state/board";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

interface BoardNoteCardProps {
  readonly environmentId: EnvironmentId;
  readonly object: BoardTextNote;
  readonly position: BoardPoint;
  readonly access?: "read" | "edit";
  readonly onSelect: () => void;
  readonly onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}

export function BoardNoteCard({
  environmentId,
  object,
  position,
  access,
  onSelect,
  onDragStart,
}: BoardNoteCardProps) {
  const updateNote = useAtomCommand(environmentBoards.updateNote, { reportFailure: false });
  const setTombstoned = useAtomCommand(environmentBoards.setTombstoned, {
    reportFailure: false,
  });
  const [title, setTitle] = useState(object.title);
  const [text, setText] = useState(object.text);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(object.title);
    setText(object.text);
  }, [object.revision, object.text, object.title]);

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const result = await updateNote({
      environmentId,
      input: {
        projectId: object.projectId,
        objectId: object.id,
        title: trimmedTitle,
        text,
        expectedRevision: object.revision,
      },
    });
    setError(result._tag === "Failure" ? "This note changed elsewhere. Review and retry." : null);
  };

  const toggleTombstone = async () => {
    const result = await setTombstoned({
      environmentId,
      input: {
        projectId: object.projectId,
        object: { id: object.id, revision: object.revision },
        tombstoned: object.tombstonedAt === null,
      },
    });
    setError(result._tag === "Failure" ? "The note changed before this action completed." : null);
  };

  if (object.tombstonedAt !== null) {
    return (
      <article
        className="absolute flex h-16 w-80 items-center justify-between rounded-xl border border-dashed border-border bg-muted/70 px-3"
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        aria-label={`Deleted note: ${object.title}`}
      >
        <span className="truncate text-sm text-muted-foreground">{object.title}</span>
        <Button size="sm" variant="ghost" onClick={() => void toggleTombstone()}>
          <ArchiveRestoreIcon /> Restore
        </Button>
      </article>
    );
  }

  const dirty = title !== object.title || text !== object.text;
  return (
    <article
      className={`absolute flex h-60 w-80 flex-col overflow-hidden rounded-xl border bg-amber-50 text-amber-950 shadow-lg dark:bg-amber-950 dark:text-amber-50 ${
        access === "edit"
          ? "border-emerald-500 ring-2 ring-emerald-500/20"
          : access === "read"
            ? "border-sky-500 ring-2 ring-sky-500/20"
            : "border-amber-400/40"
      }`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-label={`Note: ${object.title}`}
      data-board-access={access ?? "inaccessible"}
      onClick={onSelect}
    >
      <header
        className="flex h-11 cursor-grab items-center gap-2 border-b border-amber-500/20 px-3 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          aria-label="Note title"
        />
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={!dirty || !title.trim()}
          aria-label="Save note"
          onClick={() => void save()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <SaveIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Delete note"
          onClick={() => void toggleTombstone()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Trash2Icon />
        </Button>
      </header>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm leading-relaxed outline-none"
        aria-label="Note text"
      />
      {error ? <p className="px-3 pb-2 text-xs text-destructive">{error}</p> : null}
    </article>
  );
}
