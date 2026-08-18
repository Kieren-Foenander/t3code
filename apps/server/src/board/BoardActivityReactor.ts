import { CommandId, EventId, type BoardActivity } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import { BoardService } from "./BoardService.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";

export const appendBoardActivityToThread = Effect.fn("BoardActivityReactor.append")(function* (
  engine: OrchestrationEngineService["Service"],
  activity: BoardActivity,
) {
  if (activity.undoneAt !== null) return;
  yield* engine.dispatch({
    type: "thread.activity.append",
    commandId: CommandId.make(`board-activity:${activity.operationId}`),
    threadId: activity.originatingThreadId,
    activity: {
      id: EventId.make(`board-activity:${activity.operationId}`),
      tone: "tool",
      kind: "board.operation",
      summary: activity.summary,
      payload: {
        operationId: activity.operationId,
        projectId: activity.projectId,
        objectIds: activity.objectIds,
        providerInstanceId: activity.originatingProviderInstanceId,
        ...(activity.originatingProviderKind === undefined
          ? {}
          : { providerKind: activity.originatingProviderKind }),
      },
      turnId: activity.originatingTurnId ?? null,
      createdAt: activity.createdAt,
    },
    createdAt: activity.createdAt,
  });
});

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const board = yield* BoardService;
    const engine = yield* OrchestrationEngineService;
    const pending = yield* Queue.unbounded<BoardActivity>();

    yield* board.changes.pipe(
      Stream.filterMap((delta) =>
        delta.kind === "activity-upserted" && delta.activity.undoneAt === null
          ? Result.succeed(delta.activity)
          : Result.failVoid,
      ),
      Stream.runForEach((activity) => Queue.offer(pending, activity)),
      Effect.forkScoped,
    );

    yield* Queue.offerAll(
      pending,
      (yield* board.listActivities).filter((activity) => activity.undoneAt === null),
    );

    yield* Stream.fromQueue(pending).pipe(
      Stream.runForEach((activity) =>
        appendBoardActivityToThread(engine, activity).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("failed to append board activity to thread timeline", {
              operationId: activity.operationId,
              threadId: activity.originatingThreadId,
              cause,
            }),
          ),
        ),
      ),
      Effect.forkScoped,
    );
  }),
);
