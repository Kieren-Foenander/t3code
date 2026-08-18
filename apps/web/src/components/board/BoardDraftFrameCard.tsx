import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { BoardPoint, ServerConfig } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { SendIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  type DraftId,
  type DraftSessionState,
  useComposerDraftStore,
} from "../../composerDraftStore";
import { newMessageId } from "../../lib/utils";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";

interface BoardDraftFrameCardProps {
  readonly draftId: DraftId;
  readonly draft: DraftSessionState;
  readonly project: EnvironmentProject;
  readonly serverConfig: ServerConfig | undefined;
  readonly position: BoardPoint;
  readonly onCreated: () => Promise<void>;
}

export function BoardDraftFrameCard({
  draftId,
  draft,
  project,
  serverConfig,
  position,
  onCreated,
}: BoardDraftFrameCardProps) {
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const composerDraft = useComposerDraftStore((store) => store.getComposerDraft(draftId));
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || submitting) return;
    const provider = serverConfig?.providers.find(
      (candidate) => candidate.enabled && candidate.installed && candidate.models.length > 0,
    );
    const modelSelection =
      (composerDraft?.activeProvider
        ? composerDraft.modelSelectionByProvider[composerDraft.activeProvider]
        : undefined) ??
      project.defaultModelSelection ??
      (provider
        ? createModelSelection(
            provider.instanceId,
            (provider.models.find((model) => model.isDefault) ?? provider.models[0])!.slug,
          )
        : null);
    if (!modelSelection) {
      setError("Configure an agent provider before starting this thread.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const createdAt = new Date().toISOString();
    const result = await startTurn({
      environmentId: draft.environmentId,
      input: {
        threadId: draft.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text,
          attachments: [],
        },
        modelSelection,
        titleSeed: text,
        runtimeMode: draft.runtimeMode,
        interactionMode: draft.interactionMode,
        bootstrap: {
          createThread: {
            projectId: draft.projectId,
            title: text.slice(0, 80),
            modelSelection,
            runtimeMode: draft.runtimeMode,
            interactionMode: draft.interactionMode,
            branch: draft.branch,
            worktreePath: draft.worktreePath,
            createdAt: draft.createdAt,
          },
        },
        createdAt,
      },
    });
    if (result._tag === "Failure") {
      setSubmitting(false);
      setError("Could not start the thread. Your prompt is still here.");
      return;
    }
    useComposerDraftStore
      .getState()
      .markDraftThreadPromoting(draftId, scopeThreadRef(draft.environmentId, draft.threadId));
    await onCreated();
  };

  return (
    <article
      className="absolute flex h-[560px] w-[440px] flex-col overflow-hidden rounded-2xl border border-primary bg-card shadow-xl ring-2 ring-primary/20"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-label="New thread draft"
    >
      <header className="flex h-12 items-center border-b border-border/70 px-4">
        <p className="text-sm font-medium">New thread</p>
      </header>
      <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
        Start a durable agent thread at this board position.
      </div>
      <form className="border-t border-border/70 p-3" onSubmit={submit}>
        <textarea
          autoFocus
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask the agent…"
          className="min-h-20 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!prompt.trim() || submitting}>
            <SendIcon /> {submitting ? "Starting…" : "Start"}
          </Button>
        </div>
      </form>
    </article>
  );
}
