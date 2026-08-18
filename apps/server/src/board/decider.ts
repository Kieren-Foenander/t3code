import {
  BoardObjectId,
  BoardOperationError,
  BoardRelationshipId,
  BOARD_WHOLE_BOARD_OBJECT_ID,
  type BoardCommand,
  type BoardActivity,
  type BoardGrant,
  type BoardObject,
  type BoardPoint,
  type BoardProjectAuthority,
  type BoardRelationship,
  type ProviderInstanceId,
  type ProjectId,
  type ThreadId,
  type TurnId,
} from "@t3tools/contracts";

export type BoardDomainEvent =
  | {
      readonly type: "board.object-created";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly object: BoardObject;
    }
  | {
      readonly type: "board.object-moved";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly objectId: BoardObjectId;
      readonly position: BoardPoint;
      readonly revision: number;
    }
  | {
      readonly type: "board.object-updated";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly object: BoardObject;
    }
  | {
      readonly type: "board.relationship-created";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly relationship: BoardRelationship;
    }
  | {
      readonly type: "board.grant-updated";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly grant: BoardGrant;
    }
  | {
      readonly type: "board.authority-updated";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly authority: BoardProjectAuthority;
    }
  | {
      readonly type: "board.activity-updated";
      readonly projectId: ProjectId;
      readonly commandId: BoardCommand["commandId"];
      readonly occurredAt: string;
      readonly activity: BoardActivity;
    };

export interface BoardDecisionState {
  readonly objects: ReadonlyArray<BoardObject>;
  readonly relationships?: ReadonlyArray<BoardRelationship>;
  readonly grants?: ReadonlyArray<BoardGrant>;
  readonly threadIds: ReadonlyArray<ThreadId>;
  readonly authority?: BoardProjectAuthority;
}

const THREAD_FRAME_WIDTH = 440;
const THREAD_FRAME_HEIGHT = 560;
const THREAD_FRAME_GAP = 80;
const THREAD_FRAME_COLUMNS = 4;

const provenance = (
  command: Readonly<
    Partial<{
      originatingThreadId: ThreadId | undefined;
      originatingTurnId: TurnId | undefined;
      originatingProviderInstanceId: ProviderInstanceId | undefined;
      originatingProviderKind: string | undefined;
      originatingOperationId: BoardCommand["commandId"] | undefined;
    }>
  >,
) => ({
  ...(command.originatingThreadId === undefined
    ? {}
    : { originatingThreadId: command.originatingThreadId }),
  ...(command.originatingTurnId === undefined
    ? {}
    : { originatingTurnId: command.originatingTurnId }),
  ...(command.originatingProviderInstanceId === undefined
    ? {}
    : { originatingProviderInstanceId: command.originatingProviderInstanceId }),
  ...(command.originatingProviderKind === undefined
    ? {}
    : { originatingProviderKind: command.originatingProviderKind }),
  ...(command.originatingOperationId === undefined
    ? {}
    : { originatingOperationId: command.originatingOperationId }),
});

export function decideBoardCommand(
  command: BoardCommand,
  state: BoardDecisionState,
): ReadonlyArray<BoardDomainEvent> {
  if (command.type === "board.batch") {
    let objects = state.objects;
    let relationships = state.relationships;
    let grants = state.grants;
    const events: BoardDomainEvent[] = [];
    for (const operation of command.operations) {
      const nested: BoardCommand =
        operation.type === "note.create"
          ? {
              ...operation,
              type: "board.note.create",
              commandId: command.commandId,
              projectId: command.projectId,
              originatingThreadId: command.originatingThreadId,
              ...(command.originatingTurnId === undefined
                ? {}
                : { originatingTurnId: command.originatingTurnId }),
              ...(command.originatingProviderInstanceId === undefined
                ? {}
                : { originatingProviderInstanceId: command.originatingProviderInstanceId }),
              originatingOperationId: command.originatingOperationId ?? command.commandId,
              ...(command.originatingProviderKind === undefined
                ? {}
                : { originatingProviderKind: command.originatingProviderKind }),
              createdAt: command.createdAt,
            }
          : operation.type === "shape.create"
            ? {
                ...operation,
                type: "board.diagram-shape.create",
                commandId: command.commandId,
                projectId: command.projectId,
                originatingThreadId: command.originatingThreadId,
                ...(command.originatingTurnId === undefined
                  ? {}
                  : { originatingTurnId: command.originatingTurnId }),
                ...(command.originatingProviderInstanceId === undefined
                  ? {}
                  : { originatingProviderInstanceId: command.originatingProviderInstanceId }),
                originatingOperationId: command.originatingOperationId ?? command.commandId,
                ...(command.originatingProviderKind === undefined
                  ? {}
                  : { originatingProviderKind: command.originatingProviderKind }),
                createdAt: command.createdAt,
              }
            : operation.type === "object.move"
              ? {
                  ...operation,
                  type: "board.object.move",
                  commandId: command.commandId,
                  projectId: command.projectId,
                  createdAt: command.createdAt,
                }
              : operation.type === "note.update"
                ? {
                    ...operation,
                    type: "board.note.update",
                    commandId: command.commandId,
                    projectId: command.projectId,
                    createdAt: command.createdAt,
                  }
                : operation.type === "relationship.create"
                  ? {
                      ...operation,
                      type: "board.relationship.create",
                      commandId: command.commandId,
                      projectId: command.projectId,
                      originatingThreadId: command.originatingThreadId,
                      ...(command.originatingTurnId === undefined
                        ? {}
                        : { originatingTurnId: command.originatingTurnId }),
                      ...(command.originatingProviderInstanceId === undefined
                        ? {}
                        : {
                            originatingProviderInstanceId: command.originatingProviderInstanceId,
                          }),
                      originatingOperationId: command.originatingOperationId ?? command.commandId,
                      ...(command.originatingProviderKind === undefined
                        ? {}
                        : { originatingProviderKind: command.originatingProviderKind }),
                      createdAt: command.createdAt,
                    }
                  : {
                      ...operation,
                      type:
                        operation.type === "object.restore"
                          ? "board.object.restore"
                          : "board.object.tombstone",
                      commandId: command.commandId,
                      projectId: command.projectId,
                      createdAt: command.createdAt,
                    };
      const nestedEvents = decideBoardCommand(nested, {
        objects,
        relationships: relationships ?? [],
        grants: grants ?? [],
        threadIds: state.threadIds,
      });
      events.push(...nestedEvents);
      for (const event of nestedEvents) {
        if (event.type === "board.object-created" || event.type === "board.object-updated") {
          objects = [...objects.filter((object) => object.id !== event.object.id), event.object];
        } else if (event.type === "board.object-moved") {
          objects = objects.map((object) =>
            object.id === event.objectId
              ? {
                  ...object,
                  position: event.position,
                  revision: event.revision,
                  updatedAt: event.occurredAt,
                }
              : object,
          );
        } else if (event.type === "board.relationship-created") {
          relationships = [
            ...(relationships ?? []).filter(
              (relationship) => relationship.id !== event.relationship.id,
            ),
            event.relationship,
          ];
        } else if (event.type === "board.grant-updated") {
          grants = [
            ...(grants ?? []).filter(
              (grant) =>
                grant.threadId !== event.grant.threadId || grant.objectId !== event.grant.objectId,
            ),
            event.grant,
          ];
        }
      }
    }
    return events;
  }

  if (command.type === "board.thread-frames.ensure") {
    const framedThreadIds = new Set(
      state.objects.flatMap((object) =>
        object.kind === "thread-frame" && object.tombstonedAt === null ? [object.threadId] : [],
      ),
    );
    let nextIndex = state.objects.filter(
      (object) => object.kind === "thread-frame" && object.tombstonedAt === null,
    ).length;

    return state.threadIds.flatMap((threadId) => {
      if (framedThreadIds.has(threadId)) return [];
      const index = nextIndex++;
      const object: BoardObject = {
        id: BoardObjectId.make(`thread:${threadId}`),
        kind: "thread-frame",
        projectId: command.projectId,
        threadId,
        position: {
          x: (index % THREAD_FRAME_COLUMNS) * (THREAD_FRAME_WIDTH + THREAD_FRAME_GAP),
          y: Math.floor(index / THREAD_FRAME_COLUMNS) * (THREAD_FRAME_HEIGHT + THREAD_FRAME_GAP),
        },
        size: { width: THREAD_FRAME_WIDTH, height: THREAD_FRAME_HEIGHT },
        frameSize: "standard",
        revision: 1,
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
        tombstonedAt: null,
      };
      return [
        {
          type: "board.object-created" as const,
          projectId: command.projectId,
          commandId: command.commandId,
          occurredAt: command.createdAt,
          object,
        },
      ];
    });
  }

  if (command.type === "board.project-authority.set") {
    return [
      {
        type: "board.authority-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        authority: {
          projectId: command.projectId,
          defaultReadScope: command.defaultReadScope,
          defaultWriteAuthority: command.defaultWriteAuthority,
          updatedAt: command.createdAt,
        },
      },
    ];
  }

  if (command.type === "board.thread-frame.place") {
    if (!state.threadIds.includes(command.threadId)) {
      throw new BoardOperationError({
        reason: "thread-not-found",
        message: `Thread ${command.threadId} was not found in this project.`,
      });
    }
    const events: BoardDomainEvent[] = [];
    const objectId = BoardObjectId.make(`thread:${command.threadId}`);
    const existing = state.objects.find(
      (object) => object.kind === "thread-frame" && object.threadId === command.threadId,
    );
    if (existing) {
      events.push({
        type: "board.object-moved",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        objectId: existing.id,
        position: command.position,
        revision: existing.revision + 1,
      });
    } else {
      events.push({
        type: "board.object-created",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object: {
          id: objectId,
          kind: "thread-frame",
          projectId: command.projectId,
          threadId: command.threadId,
          position: command.position,
          size: { width: THREAD_FRAME_WIDTH, height: THREAD_FRAME_HEIGHT },
          frameSize: "standard",
          revision: 1,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
          tombstonedAt: null,
        },
      });
    }
    if (command.parentThreadId !== undefined) {
      const parent = state.objects.find(
        (object) => object.kind === "thread-frame" && object.threadId === command.parentThreadId,
      );
      const relationshipId = BoardRelationshipId.make(
        `spawned:${command.parentThreadId}:${command.threadId}`,
      );
      if (
        parent &&
        !(state.relationships ?? []).some(
          (relationship) =>
            relationship.id === relationshipId && relationship.tombstonedAt === null,
        )
      ) {
        events.push({
          type: "board.relationship-created",
          projectId: command.projectId,
          commandId: command.commandId,
          occurredAt: command.createdAt,
          relationship: {
            id: relationshipId,
            projectId: command.projectId,
            kind: "spawned-from",
            sourceObjectId: parent.id,
            targetObjectId: objectId,
            revision: 1,
            createdAt: command.createdAt,
            updatedAt: command.createdAt,
            tombstonedAt: null,
          },
        });
      }
    }
    return events;
  }

  if (command.type === "board.note.create") {
    if (state.objects.some((object) => object.id === command.objectId)) {
      throw new BoardOperationError({
        reason: "revision-conflict",
        message: `Board object ${command.objectId} already exists.`,
      });
    }
    const object: BoardObject = {
      id: command.objectId,
      kind: "text-note",
      projectId: command.projectId,
      position: command.position,
      size: { width: 320, height: 240 },
      title: command.title,
      text: command.text,
      ...(command.originatingProviderInstanceId === undefined
        ? {}
        : { promotedAt: command.createdAt }),
      ...provenance(command),
      revision: 1,
      createdAt: command.createdAt,
      updatedAt: command.createdAt,
      tombstonedAt: null,
    };
    return [
      {
        type: "board.object-created" as const,
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object,
      },
      ...(command.originatingThreadId === undefined
        ? []
        : [
            {
              type: "board.grant-updated" as const,
              projectId: command.projectId,
              commandId: command.commandId,
              occurredAt: command.createdAt,
              grant: {
                projectId: command.projectId,
                threadId: command.originatingThreadId,
                objectId: command.objectId,
                access: "edit" as const,
                createdAt: command.createdAt,
                revokedAt: null,
              },
            },
          ]),
    ];
  }

  if (command.type === "board.file-reference.create") {
    if (
      command.path.startsWith("/") ||
      /^[A-Za-z]:/.test(command.path) ||
      command.path.split(/[\\/]/).includes("..")
    ) {
      throw new BoardOperationError({
        reason: "invalid-path",
        message: "File references must stay inside the project workspace.",
      });
    }
    if (state.objects.some((object) => object.id === command.objectId)) {
      throw new BoardOperationError({
        reason: "revision-conflict",
        message: `Board object ${command.objectId} already exists.`,
      });
    }
    if (
      command.startLine === 0 ||
      command.endLine === 0 ||
      (command.startLine !== undefined &&
        command.endLine !== undefined &&
        command.endLine < command.startLine)
    ) {
      throw new BoardOperationError({
        reason: "invalid-range",
        message: "File reference line ranges are one-based and must end after they start.",
      });
    }
    const object: BoardObject = {
      id: command.objectId,
      kind: "file-reference",
      projectId: command.projectId,
      position: command.position,
      size: { width: 440, height: 320 },
      path: command.path,
      ...(command.startLine === undefined ? {} : { startLine: command.startLine }),
      ...(command.endLine === undefined ? {} : { endLine: command.endLine }),
      ...(command.checkpointRef === undefined ? {} : { checkpointRef: command.checkpointRef }),
      ...provenance(command),
      revision: 1,
      createdAt: command.createdAt,
      updatedAt: command.createdAt,
      tombstonedAt: null,
    };
    return [
      {
        type: "board.object-created" as const,
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object,
      },
      ...(command.originatingThreadId === undefined
        ? []
        : [
            {
              type: "board.grant-updated" as const,
              projectId: command.projectId,
              commandId: command.commandId,
              occurredAt: command.createdAt,
              grant: {
                projectId: command.projectId,
                threadId: command.originatingThreadId,
                objectId: command.objectId,
                access: "edit" as const,
                createdAt: command.createdAt,
                revokedAt: null,
              },
            },
          ]),
    ];
  }

  if (command.type === "board.diagram-shape.create" || command.type === "board.group.create") {
    if (state.objects.some((object) => object.id === command.objectId)) {
      throw new BoardOperationError({
        reason: "revision-conflict",
        message: `Board object ${command.objectId} already exists.`,
      });
    }
    const object: BoardObject =
      command.type === "board.diagram-shape.create"
        ? {
            id: command.objectId,
            kind: "diagram-shape",
            projectId: command.projectId,
            position: command.position,
            size: { width: 220, height: 120 },
            shape: command.shape,
            label: command.label,
            ...provenance(command),
            revision: 1,
            createdAt: command.createdAt,
            updatedAt: command.createdAt,
            tombstonedAt: null,
          }
        : {
            id: command.objectId,
            kind: "group",
            projectId: command.projectId,
            position: command.position,
            size: command.size,
            title: command.title,
            ...provenance(command),
            revision: 1,
            createdAt: command.createdAt,
            updatedAt: command.createdAt,
            tombstonedAt: null,
          };
    return [
      {
        type: "board.object-created",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object,
      },
    ];
  }

  if (command.type === "board.relationship.create") {
    const source = state.objects.find(
      (object) => object.id === command.sourceObjectId && object.tombstonedAt === null,
    );
    const target = state.objects.find(
      (object) => object.id === command.targetObjectId && object.tombstonedAt === null,
    );
    if (!source || !target) {
      throw new BoardOperationError({
        reason: "object-not-found",
        message: "Both relationship endpoints must exist on this board.",
      });
    }
    return [
      {
        type: "board.relationship-created",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        relationship: {
          id: command.relationshipId,
          projectId: command.projectId,
          kind: command.kind,
          ...(command.label === undefined ? {} : { label: command.label }),
          sourceObjectId: command.sourceObjectId,
          targetObjectId: command.targetObjectId,
          ...provenance(command),
          revision: 1,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
          tombstonedAt: null,
        },
      },
    ];
  }

  if (command.type === "board.relationship.update") {
    const relationship = (state.relationships ?? []).find(
      (candidate) => candidate.id === command.relationshipId,
    );
    if (!relationship || (relationship.tombstonedAt !== null && command.tombstoned !== false)) {
      throw new BoardOperationError({
        reason: "object-not-found",
        message: `Board relationship ${command.relationshipId} was not found.`,
      });
    }
    if (relationship.revision !== command.expectedRevision) {
      throw new BoardOperationError({
        reason: "revision-conflict",
        message: "The board relationship changed before this operation was committed.",
        expectedRevision: command.expectedRevision,
        actualRevision: relationship.revision,
      });
    }
    return [
      {
        type: "board.relationship-created",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        relationship: {
          ...relationship,
          ...(command.label === undefined
            ? {}
            : command.label === null
              ? { label: undefined }
              : { label: command.label }),
          revision: relationship.revision + 1,
          updatedAt: command.createdAt,
          tombstonedAt:
            command.tombstoned === undefined
              ? relationship.tombstonedAt
              : command.tombstoned
                ? command.createdAt
                : null,
        },
      },
    ];
  }

  if (command.type === "board.authority.set" || command.type === "board.authority.revoke") {
    if (!state.threadIds.includes(command.threadId)) {
      throw new BoardOperationError({
        reason: "thread-not-found",
        message: `Thread ${command.threadId} was not found in this project.`,
      });
    }
    return [
      {
        type: "board.grant-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        grant: {
          projectId: command.projectId,
          threadId: command.threadId,
          objectId: BOARD_WHOLE_BOARD_OBJECT_ID,
          access: command.access ?? "read",
          createdAt:
            (state.grants ?? []).find(
              (grant) =>
                grant.threadId === command.threadId &&
                grant.objectId === BOARD_WHOLE_BOARD_OBJECT_ID,
            )?.createdAt ?? command.createdAt,
          revokedAt: command.type === "board.authority.revoke" ? command.createdAt : null,
        },
      },
    ];
  }

  if (command.type === "board.grant.set" || command.type === "board.grant.revoke") {
    if (!state.threadIds.includes(command.threadId)) {
      throw new BoardOperationError({
        reason: "thread-not-found",
        message: `Thread ${command.threadId} was not found in this project.`,
      });
    }
    const threadFrame = state.objects.find(
      (object) => object.kind === "thread-frame" && object.threadId === command.threadId,
    );
    const events: BoardDomainEvent[] = [];
    for (const objectId of command.objectIds) {
      const object = state.objects.find(
        (candidate) => candidate.id === objectId && candidate.tombstonedAt === null,
      );
      if (!object) {
        throw new BoardOperationError({
          reason: "object-not-found",
          message: `Board object ${objectId} was not found.`,
        });
      }
      events.push({
        type: "board.grant-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        grant: {
          projectId: command.projectId,
          threadId: command.threadId,
          objectId,
          access: command.access ?? "read",
          createdAt:
            (state.grants ?? []).find(
              (grant) => grant.threadId === command.threadId && grant.objectId === objectId,
            )?.createdAt ?? command.createdAt,
          revokedAt: command.type === "board.grant.revoke" ? command.createdAt : null,
        },
      });
      if (threadFrame) {
        const relationshipId = BoardRelationshipId.make(`shared:${objectId}:${command.threadId}`);
        const existingRelationship = (state.relationships ?? []).find(
          (relationship) => relationship.id === relationshipId,
        );
        if (command.type === "board.grant.set" && !existingRelationship) {
          events.push({
            type: "board.relationship-created",
            projectId: command.projectId,
            commandId: command.commandId,
            occurredAt: command.createdAt,
            relationship: {
              id: relationshipId,
              projectId: command.projectId,
              kind: "context-shared-with",
              sourceObjectId: objectId,
              targetObjectId: threadFrame.id,
              revision: 1,
              createdAt: command.createdAt,
              updatedAt: command.createdAt,
              tombstonedAt: null,
            },
          });
        } else if (
          existingRelationship &&
          ((command.type === "board.grant.revoke" && existingRelationship.tombstonedAt === null) ||
            (command.type === "board.grant.set" && existingRelationship.tombstonedAt !== null))
        ) {
          events.push({
            type: "board.relationship-created",
            projectId: command.projectId,
            commandId: command.commandId,
            occurredAt: command.createdAt,
            relationship: {
              ...existingRelationship,
              revision: existingRelationship.revision + 1,
              updatedAt: command.createdAt,
              tombstonedAt: command.type === "board.grant.revoke" ? command.createdAt : null,
            },
          });
        }
      }
    }
    return events;
  }

  if (!("objectId" in command)) return [];
  const expectedRevision = "expectedRevision" in command ? command.expectedRevision : undefined;
  const object = state.objects.find((candidate) => candidate.id === command.objectId);
  if (
    object === undefined ||
    (object.tombstonedAt !== null && command.type !== "board.object.restore")
  ) {
    throw new BoardOperationError({
      reason: "object-not-found",
      message: `Board object ${command.objectId} was not found.`,
    });
  }
  if (object.projectId !== command.projectId) {
    throw new BoardOperationError({
      reason: "project-mismatch",
      message: "The board object does not belong to this project.",
    });
  }
  if (expectedRevision !== undefined && expectedRevision !== object.revision) {
    throw new BoardOperationError({
      reason: "revision-conflict",
      message: "The board object changed before this operation was committed.",
      expectedRevision,
      actualRevision: object.revision,
    });
  }

  if (command.type === "board.note.update") {
    if (object.kind !== "text-note") {
      throw new BoardOperationError({
        reason: "object-not-found",
        message: `Board object ${command.objectId} is not a note.`,
      });
    }
    return [
      {
        type: "board.object-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object: {
          ...object,
          ...(command.title === undefined ? {} : { title: command.title }),
          ...(command.text === undefined ? {} : { text: command.text }),
          revision: object.revision + 1,
          updatedAt: command.createdAt,
        },
      },
    ];
  }

  if (command.type === "board.note.promote") {
    if (object.kind !== "text-note") {
      throw new BoardOperationError({
        reason: "object-not-found",
        message: `Board object ${command.objectId} is not a note.`,
      });
    }
    return [
      {
        type: "board.object-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object: {
          ...object,
          promotedAt: command.createdAt,
          revision: object.revision + 1,
          updatedAt: command.createdAt,
        },
      },
    ];
  }

  if (command.type === "board.object.update") {
    if (command.path !== undefined) {
      if (
        command.path.startsWith("/") ||
        /^[A-Za-z]:/.test(command.path) ||
        command.path.split(/[\\/]/).includes("..")
      ) {
        throw new BoardOperationError({
          reason: "invalid-path",
          message: "File references must stay inside the project workspace.",
        });
      }
    }
    if (
      command.startLine === 0 ||
      command.endLine === 0 ||
      (typeof command.startLine === "number" &&
        typeof command.endLine === "number" &&
        command.endLine < command.startLine)
    ) {
      throw new BoardOperationError({
        reason: "invalid-range",
        message: "File reference line ranges are one-based and must end after they start.",
      });
    }
    if (object.kind === "file-reference") {
      const nextStart =
        command.startLine === undefined
          ? object.startLine
          : command.startLine === null
            ? undefined
            : command.startLine;
      const nextEnd =
        command.endLine === undefined
          ? object.endLine
          : command.endLine === null
            ? undefined
            : command.endLine;
      if (nextStart !== undefined && nextEnd !== undefined && nextEnd < nextStart) {
        throw new BoardOperationError({
          reason: "invalid-range",
          message: "File reference line ranges are one-based and must end after they start.",
        });
      }
    }
    const updated: BoardObject = (() => {
      if (object.kind === "thread-frame") {
        return {
          ...object,
          ...(command.size === undefined ? {} : { size: command.size }),
          ...(command.frameSize === undefined ? {} : { frameSize: command.frameSize }),
        };
      }
      if (object.kind === "text-note") {
        return {
          ...object,
          ...(command.size === undefined ? {} : { size: command.size }),
          ...(command.title === undefined ? {} : { title: command.title }),
        };
      }
      if (object.kind === "diagram-shape") {
        return {
          ...object,
          ...(command.size === undefined ? {} : { size: command.size }),
          ...(command.shape === undefined ? {} : { shape: command.shape }),
          ...(command.label === undefined ? {} : { label: command.label }),
        };
      }
      if (object.kind === "group") {
        return {
          ...object,
          ...(command.size === undefined ? {} : { size: command.size }),
          ...(command.title === undefined ? {} : { title: command.title }),
        };
      }
      return {
        ...object,
        ...(command.size === undefined ? {} : { size: command.size }),
        ...(command.path === undefined ? {} : { path: command.path }),
        ...(command.startLine === undefined
          ? {}
          : command.startLine === null
            ? { startLine: undefined }
            : { startLine: command.startLine }),
        ...(command.endLine === undefined
          ? {}
          : command.endLine === null
            ? { endLine: undefined }
            : { endLine: command.endLine }),
        ...(command.checkpointRef === undefined
          ? {}
          : command.checkpointRef === null
            ? { checkpointRef: undefined }
            : { checkpointRef: command.checkpointRef }),
      };
    })();
    return [
      {
        type: "board.object-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object: { ...updated, revision: object.revision + 1, updatedAt: command.createdAt },
      },
    ];
  }

  if (command.type === "board.object.tombstone" || command.type === "board.object.restore") {
    return [
      {
        type: "board.object-updated",
        projectId: command.projectId,
        commandId: command.commandId,
        occurredAt: command.createdAt,
        object: {
          ...object,
          revision: object.revision + 1,
          updatedAt: command.createdAt,
          tombstonedAt: command.type === "board.object.tombstone" ? command.createdAt : null,
        },
      },
    ];
  }

  if (command.type !== "board.object.move") return [];

  return [
    {
      type: "board.object-moved",
      projectId: command.projectId,
      commandId: command.commandId,
      occurredAt: command.createdAt,
      objectId: command.objectId,
      position: command.position,
      revision: object.revision + 1,
    },
  ];
}

export interface BoardOperationPreimage {
  readonly objects: ReadonlyArray<{
    readonly objectId: BoardObjectId;
    readonly object: BoardObject | null;
  }>;
  readonly relationships: ReadonlyArray<{
    readonly relationshipId: BoardRelationshipId;
    readonly relationship: BoardRelationship | null;
  }>;
}

export function decideBoardUndo(
  command: Extract<BoardCommand, { readonly type: "board.operation.undo" }>,
  state: BoardDecisionState,
  preimage: BoardOperationPreimage,
): ReadonlyArray<BoardDomainEvent> {
  const events: BoardDomainEvent[] = [];
  for (const entry of preimage.objects) {
    const current = state.objects.find((object) => object.id === entry.objectId);
    if (!current) continue;
    events.push({
      type: "board.object-updated",
      projectId: command.projectId,
      commandId: command.commandId,
      occurredAt: command.createdAt,
      object:
        entry.object === null
          ? {
              ...current,
              revision: current.revision + 1,
              updatedAt: command.createdAt,
              tombstonedAt: command.createdAt,
            }
          : {
              ...entry.object,
              revision: current.revision + 1,
              updatedAt: command.createdAt,
            },
    });
  }
  for (const entry of preimage.relationships) {
    const current = (state.relationships ?? []).find(
      (relationship) => relationship.id === entry.relationshipId,
    );
    if (!current) continue;
    events.push({
      type: "board.relationship-created",
      projectId: command.projectId,
      commandId: command.commandId,
      occurredAt: command.createdAt,
      relationship:
        entry.relationship === null
          ? {
              ...current,
              revision: current.revision + 1,
              updatedAt: command.createdAt,
              tombstonedAt: command.createdAt,
            }
          : {
              ...entry.relationship,
              revision: current.revision + 1,
              updatedAt: command.createdAt,
            },
    });
  }
  return events;
}
