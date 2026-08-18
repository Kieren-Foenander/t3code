import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { BoardPoint, BoardThreadFrame, EnvironmentId } from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { FocusIcon, LoaderCircleIcon, SendIcon } from "lucide-react";
import { useEffect, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";

import { newMessageId } from "../../lib/utils";
import { useThreadDetail } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { resolveBoardSemanticLevel, type BoardSemanticLevel } from "./BoardSemanticZoom";

interface BoardThreadFrameCardProps {
  readonly environmentId: EnvironmentId;
  readonly object: BoardThreadFrame;
  readonly position: BoardPoint;
  readonly zoom: number;
  readonly thread: EnvironmentThreadShell | undefined;
  readonly active: boolean;
  readonly dimmed?: boolean;
  readonly artifactCount: number;
  readonly onActivate: () => void;
  readonly onDwell: () => void;
  readonly onDwellEnd: () => void;
  readonly onDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}

function protectedEditorOwnsFocus(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.matches("input, textarea, [contenteditable='true']") ||
      active.closest("[data-terminal], [data-approval-control]") !== null)
  );
}

export function BoardThreadFrameCard({
  environmentId,
  object,
  position,
  zoom,
  thread,
  active,
  dimmed = false,
  artifactCount,
  onActivate,
  onDwell,
  onDwellEnd,
  onDragStart,
}: BoardThreadFrameCardProps) {
  const navigate = useNavigate();
  const [level, setLevel] = useState<BoardSemanticLevel>(() =>
    resolveBoardSemanticLevel({
      frameSize: object.frameSize,
      renderedWidth: object.size.width * zoom,
    }),
  );
  const archived = Boolean(thread?.archivedAt);
  const viewedStorageKey = `t3code:board-thread-viewed:v1:${environmentId}:${object.threadId}`;
  const [viewedAt, setViewedAt] = useState(() => {
    try {
      return window.localStorage.getItem(viewedStorageKey) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!active || !thread?.updatedAt) return;
    setViewedAt(thread.updatedAt);
    try {
      window.localStorage.setItem(viewedStorageKey, thread.updatedAt);
    } catch {
      // Presentation state persistence is best effort.
    }
  }, [active, thread?.updatedAt, viewedStorageKey]);
  const unread = Boolean(!active && thread?.updatedAt && thread.updatedAt > viewedAt);

  useEffect(() => {
    setLevel((previous) =>
      resolveBoardSemanticLevel({
        frameSize: object.frameSize,
        renderedWidth: object.size.width * zoom,
        previous,
      }),
    );
  }, [object.frameSize, object.size.width, zoom]);

  const focusThread = () => {
    onActivate();
    return navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId: object.threadId },
    });
  };

  return (
    <article
      className={`absolute flex overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/8 ${
        active ? "border-primary ring-2 ring-primary/20" : "border-border/80"
      }`}
      style={{
        width: object.size.width,
        height: archived ? 84 : object.size.height,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        opacity: dimmed ? 0.2 : 1,
      }}
      data-board-thread-id={object.threadId}
      aria-label={`Thread: ${thread?.title ?? object.threadId}`}
      aria-current={active ? "true" : undefined}
      tabIndex={0}
      onPointerEnter={() => {
        if (!protectedEditorOwnsFocus()) onDwell();
      }}
      onPointerLeave={onDwellEnd}
      onClick={(event) => {
        onActivate();
        event.currentTarget.focus();
      }}
      onDoubleClick={() => void focusThread()}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex h-12 cursor-grab items-center justify-between border-b border-border/70 px-3 active:cursor-grabbing"
          onPointerDown={onDragStart}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{thread?.title ?? "Untitled thread"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {archived
                ? "Archived"
                : thread?.session?.status === "running"
                  ? "Running"
                  : thread?.settledAt
                    ? "Complete"
                    : "Waiting"}
            </p>
            {unread ? <span className="text-[10px] font-medium text-primary">Updated</span> : null}
          </div>
          <Button
            render={
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: object.threadId }}
                onClick={onActivate}
              />
            }
            size={level === "status" ? "icon-xs" : "sm"}
            variant="ghost"
            aria-label={`Focus ${thread?.title ?? "thread"}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <FocusIcon />
            {level === "status" ? null : <span>Attach thread</span>}
          </Button>
        </div>

        {archived ? (
          <div className="flex flex-1 items-center px-3 text-xs text-muted-foreground">
            Compact on the board; restore from the sidebar to resume.
          </div>
        ) : level === "status" ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {thread?.session?.status === "running" ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircleIcon className="size-4" /> Running
              </span>
            ) : thread?.latestTurn?.state === "error" ? (
              "Latest turn failed"
            ) : thread?.settledAt ? (
              "Latest turn completed"
            ) : (
              "Waiting"
            )}
          </div>
        ) : level === "summary" ? (
          <div className="flex flex-1 flex-col justify-center gap-3 px-6 text-sm text-muted-foreground">
            <p className="text-foreground">
              {thread?.planProgress
                ? `${thread.planProgress.step} (${thread.planProgress.completedSteps}/${thread.planProgress.totalSteps})`
                : thread?.session?.status === "running"
                  ? "Agent is working"
                  : thread?.settledAt
                    ? "Latest work is complete"
                    : "Ready for the next prompt"}
            </p>
            {thread?.hasPendingApprovals || thread?.hasPendingUserInput ? (
              <p className="text-xs font-medium text-amber-600">Blocked on user input</p>
            ) : null}
            {thread?.branch ? <p className="truncate font-mono text-xs">{thread.branch}</p> : null}
            {(thread?.latestChangedFiles?.length ?? 0) > 0 ? (
              <p className="truncate text-xs">
                {thread?.latestChangedFiles?.length === 1
                  ? thread.latestChangedFiles[0]
                  : `${thread?.latestChangedFiles?.[0]} +${(thread?.latestChangedFiles?.length ?? 1) - 1} more`}
              </p>
            ) : null}
            <p className="text-xs">
              {artifactCount} board artifact{artifactCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs">Zoom closer to open the live timeline.</p>
          </div>
        ) : (
          <InteractiveThreadFrame environmentId={environmentId} object={object} thread={thread} />
        )}
      </div>
    </article>
  );
}

function InteractiveThreadFrame({
  environmentId,
  object,
  thread,
}: Pick<BoardThreadFrameCardProps, "environmentId" | "object" | "thread">) {
  const detail = useThreadDetail(scopeThreadRef(environmentId, object.threadId));
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [prompt, setPrompt] = useState("");
  const messages = detail?.messages.slice(-6) ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || !thread || thread.session?.status === "running") return;
    setPrompt("");
    const result = await startTurn({
      environmentId,
      input: {
        threadId: object.threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
      },
    });
    if (result._tag === "Failure") setPrompt(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              <p className="line-clamp-5 whitespace-pre-wrap">{message.text}</p>
            </div>
          ))
        )}
      </div>
      <form className="flex gap-2 border-t border-border/70 p-3" onSubmit={submit}>
        <textarea
          className="min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message this thread"
          aria-label="Message this thread"
        />
        <Button size="icon" type="submit" aria-label="Send message" disabled={!prompt.trim()}>
          <SendIcon />
        </Button>
      </form>
    </div>
  );
}
