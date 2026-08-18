import {
  BoardObjectId,
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type BoardActivity,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { appendBoardActivityToThread } from "./BoardActivityReactor.ts";
import type { OrchestrationEngineShape } from "../orchestration/Services/OrchestrationEngine.ts";

const activity: BoardActivity = {
  operationId: CommandId.make("board-tool:create-note:1"),
  commandId: CommandId.make("board-tool:create-note:1"),
  projectId: ProjectId.make("project-1"),
  summary: "Created note Architecture",
  objectIds: [BoardObjectId.make("note:1")],
  originatingThreadId: ThreadId.make("thread-1"),
  originatingTurnId: TurnId.make("turn-1"),
  originatingProviderInstanceId: ProviderInstanceId.make("codex"),
  originatingProviderKind: "codex",
  createdAt: "2026-08-18T00:00:00.000Z",
  undoneAt: null,
};

it.effect("appends attributed board operations to the originating thread timeline", () =>
  Effect.gen(function* () {
    const commands: OrchestrationCommand[] = [];
    const engine: OrchestrationEngineShape = {
      dispatch: (command) =>
        Effect.sync(() => {
          commands.push(command);
          return { sequence: commands.length };
        }),
      readEvents: () => Stream.empty,
      streamDomainEvents: Stream.empty,
      latestSequence: Effect.succeed(0),
    };

    yield* appendBoardActivityToThread(engine, activity);
    expect(commands).toEqual([
      expect.objectContaining({
        type: "thread.activity.append",
        commandId: CommandId.make("board-activity:board-tool:create-note:1"),
        threadId: activity.originatingThreadId,
        activity: expect.objectContaining({
          kind: "board.operation",
          summary: activity.summary,
          turnId: activity.originatingTurnId,
          payload: expect.objectContaining({
            operationId: activity.operationId,
            providerKind: "codex",
          }),
        }),
      }),
    ]);

    yield* appendBoardActivityToThread(engine, {
      ...activity,
      undoneAt: "2026-08-18T01:00:00.000Z",
    });
    expect(commands).toHaveLength(1);
  }),
);
