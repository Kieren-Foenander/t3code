import { useAtomCommand } from "../../state/use-atom-command";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import {
  ThreadId,
  CheckpointRef,
  BoardObjectId,
  BoardRelationshipId,
  BOARD_WHOLE_BOARD_OBJECT_ID,
  type BoardPoint,
  type EnvironmentId,
  type ProjectId,
} from "@t3tools/contracts";
import {
  EyeIcon,
  FilePlus2Icon,
  LocateFixedIcon,
  GroupIcon,
  Maximize2Icon,
  MessageSquarePlusIcon,
  MinusIcon,
  PlusIcon,
  ShapesIcon,
  Share2Icon,
  StickyNoteIcon,
  UnlinkIcon,
  Undo2Icon,
  WorkflowIcon,
  PencilIcon,
  ScalingIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";

import { useEnvironmentBoard } from "../../state/board";
import { environmentBoards } from "../../state/board";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjects, useServerConfigs, useThreadShells } from "../../state/entities";
import { Button } from "../ui/button";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "../../hooks/useLocalStorage";
import {
  BoardCamera,
  boardObjectIntersectsViewport,
  clampBoardZoom,
  fitBoardCamera,
  pinchBoardCamera,
  shouldStartBoardPan,
  zoomBoardCameraAtPoint,
  type BoardCamera as BoardCameraState,
} from "./BoardViewport";
import { BoardThreadFrameCard } from "./BoardThreadFrameCard";
import { BoardDraftFrameCard } from "./BoardDraftFrameCard";
import { BoardNoteCard } from "./BoardNoteCard";
import { BoardFileReferenceCard } from "./BoardFileReferenceCard";
import { BoardOutline } from "./BoardOutline";
import { randomUUID } from "../../lib/utils";

interface BoardWorkspaceProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

interface DragState {
  readonly objectId: BoardObjectId;
  readonly pointerId: number;
  readonly startClient: BoardPoint;
  readonly startPosition: BoardPoint;
  readonly revision: number;
}

export function BoardWorkspace({ environmentId, projectId }: BoardWorkspaceProps) {
  const navigate = useNavigate();
  const board = useEnvironmentBoard(environmentId, projectId);
  const projects = useProjects();
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const handleNewThread = useNewThreadHandler();
  const moveObject = useAtomCommand(environmentBoards.move, { reportFailure: false });
  const placeThreadFrame = useAtomCommand(environmentBoards.placeThreadFrame, {
    reportFailure: false,
  });
  const ensureThreadFrames = useAtomCommand(environmentBoards.ensureThreadFrames, {
    reportFailure: false,
  });
  const createNote = useAtomCommand(environmentBoards.createNote, { reportFailure: false });
  const createFileReference = useAtomCommand(environmentBoards.createFileReference, {
    reportFailure: false,
  });
  const createDiagramShape = useAtomCommand(environmentBoards.createDiagramShape, {
    reportFailure: false,
  });
  const createGroup = useAtomCommand(environmentBoards.createGroup, { reportFailure: false });
  const createRelationship = useAtomCommand(environmentBoards.createRelationship, {
    reportFailure: false,
  });
  const updateRelationship = useAtomCommand(environmentBoards.updateRelationship, {
    reportFailure: false,
  });
  const updateObject = useAtomCommand(environmentBoards.updateObject, { reportFailure: false });
  const setGrant = useAtomCommand(environmentBoards.setGrant, { reportFailure: false });
  const setAuthority = useAtomCommand(environmentBoards.setAuthority, { reportFailure: false });
  const setTombstoned = useAtomCommand(environmentBoards.setTombstoned, {
    reportFailure: false,
  });
  const cameraStorageKey = `t3code:board-camera:v1:${environmentId}:${projectId}`;
  const activeThreadStorageKey = `t3code:board-active-thread:v1:${environmentId}:${projectId}`;
  const selectionStorageKey = `t3code:board-selection:v1:${environmentId}:${projectId}`;
  const [camera, setCamera] = useState<BoardCameraState>(() => {
    try {
      return getLocalStorageItem(cameraStorageKey, BoardCamera) ?? { x: 72, y: 72, zoom: 0.85 };
    } catch {
      return { x: 72, y: 72, zoom: 0.85 };
    }
  });
  const [localPositions, setLocalPositions] = useState<ReadonlyMap<BoardObjectId, BoardPoint>>(
    new Map(),
  );
  const [draftPositions, setDraftPositions] = useState<ReadonlyMap<ThreadId, BoardPoint>>(
    new Map(),
  );
  const draftThreadsById = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startClient: BoardPoint;
    startCamera: BoardCameraState;
  } | null>(null);
  const touchPointsRef = useRef(new Map<number, BoardPoint>());
  const pinchRef = useRef<{
    readonly startDistance: number;
    readonly startMidpoint: BoardPoint;
    readonly startCamera: BoardCameraState;
  } | null>(null);
  const spacePressedRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dwellTimeoutRef = useRef<number | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<ThreadId | null>(() => {
    try {
      return getLocalStorageItem(activeThreadStorageKey, ThreadId);
    } catch {
      return null;
    }
  });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<BoardObjectId | null>(() => {
    try {
      return getLocalStorageItem(selectionStorageKey, BoardObjectId);
    } catch {
      return null;
    }
  });
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<BoardRelationshipId | null>(
    null,
  );
  const [searchResultIds, setSearchResultIds] = useState<ReadonlySet<BoardObjectId> | null>(null);
  const [connectorSourceId, setConnectorSourceId] = useState<BoardObjectId | null>(null);
  const [followThreadId, setFollowThreadId] = useState<ThreadId | null>(null);
  const cameraBeforeFollowRef = useRef<BoardCameraState | null>(null);

  useEffect(
    () => () => {
      if (dwellTimeoutRef.current !== null) window.clearTimeout(dwellTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setLocalStorageItem(cameraStorageKey, camera, BoardCamera);
      } catch {
        // Presentation state persistence is best effort.
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [camera, cameraStorageKey]);

  useEffect(() => {
    try {
      if (selectedObjectId)
        setLocalStorageItem(selectionStorageKey, selectedObjectId, BoardObjectId);
      else removeLocalStorageItem(selectionStorageKey);
    } catch {
      // Presentation state persistence is best effort.
    }
  }, [selectedObjectId, selectionStorageKey]);

  useEffect(() => {
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches("input, textarea, [contenteditable='true']") ||
        target.closest("[data-terminal], [data-approval-control]") !== null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !editable(event.target)) spacePressedRef.current = true;
      if (event.key === "Home" && !editable(event.target)) {
        const bounds = canvasRef.current?.getBoundingClientRect();
        if (bounds) setCamera(fitBoardCamera(board.snapshot?.objects ?? [], bounds));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activeThreadStorageKey, board.snapshot?.objects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      const bounds = canvas.getBoundingClientRect();
      setViewportSize({ width: bounds.width, height: bounds.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const project = projects.find(
    (candidate) => candidate.environmentId === environmentId && candidate.id === projectId,
  );
  const threadsById = useMemo(
    () =>
      new Map(
        threads
          .filter(
            (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
          )
          .map((thread) => [thread.id, thread] as const),
      ),
    [environmentId, projectId, threads],
  );
  const draftFrames = useMemo(
    () =>
      Object.entries(draftThreadsById)
        .map(([draftId, draft]) => ({ draftId: DraftId.make(draftId), draft }))
        .filter(
          ({ draft }) =>
            draft.environmentId === environmentId &&
            draft.projectId === projectId &&
            !threadsById.has(draft.threadId),
        ),
    [draftThreadsById, environmentId, projectId, threadsById],
  );

  const projectThreadKey = useMemo(() => [...threadsById.keys()].sort().join("\n"), [threadsById]);
  useEffect(() => {
    if (board.status !== "live") return;
    const framed = new Set(
      (board.snapshot?.objects ?? []).flatMap((object) =>
        object.kind === "thread-frame" && object.tombstonedAt === null ? [object.threadId] : [],
      ),
    );
    if ([...threadsById.keys()].some((threadId) => !framed.has(threadId))) {
      void ensureThreadFrames({ environmentId, input: { projectId } });
    }
  }, [
    board.snapshot?.objects,
    board.status,
    ensureThreadFrames,
    environmentId,
    projectId,
    projectThreadKey,
    threadsById,
  ]);

  const setZoom = useCallback((nextZoom: number) => {
    setCamera((current) => ({
      ...current,
      zoom: clampBoardZoom(nextZoom),
    }));
  }, []);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const focalPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      setCamera((current) =>
        zoomBoardCameraAtPoint(current, focalPoint, current.zoom * Math.exp(-event.deltaY * 0.002)),
      );
      return;
    }
    setCamera((current) => ({
      ...current,
      x: current.x - (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX),
      y: current.y - (event.shiftKey ? 0 : event.deltaY),
    }));
  }, []);

  const onCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== "touch" &&
        !shouldStartBoardPan({
          button: event.button,
          spacePressed: spacePressedRef.current,
          canvasTarget: event.target === event.currentTarget,
        })
      )
        return;
      if (event.pointerType === "touch" && event.target !== event.currentTarget) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...touchPointsRef.current.values()];
        if (points.length === 2) {
          const [first, second] = points as [BoardPoint, BoardPoint];
          pinchRef.current = {
            startDistance: Math.hypot(second.x - first.x, second.y - first.y),
            startMidpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
            startCamera: camera,
          };
          panRef.current = null;
          return;
        }
      }
      panRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startCamera: camera,
      };
    },
    [camera],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" && touchPointsRef.current.has(event.pointerId)) {
        touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...touchPointsRef.current.values()];
        if (points.length === 2 && pinchRef.current) {
          const [first, second] = points as [BoardPoint, BoardPoint];
          const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
          const distance = Math.hypot(second.x - first.x, second.y - first.y);
          const pinch = pinchRef.current;
          setCamera(
            pinchBoardCamera({
              startCamera: pinch.startCamera,
              startMidpoint: pinch.startMidpoint,
              currentMidpoint: midpoint,
              startDistance: pinch.startDistance,
              currentDistance: distance,
            }),
          );
          return;
        }
      }
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        setLocalPositions((current) => {
          const next = new Map(current);
          next.set(drag.objectId, {
            x: drag.startPosition.x + (event.clientX - drag.startClient.x) / camera.zoom,
            y: drag.startPosition.y + (event.clientY - drag.startClient.y) / camera.zoom,
          });
          return next;
        });
        return;
      }
      const pan = panRef.current;
      if (pan?.pointerId === event.pointerId) {
        setCamera({
          ...pan.startCamera,
          x: pan.startCamera.x + event.clientX - pan.startClient.x,
          y: pan.startCamera.y + event.clientY - pan.startClient.y,
        });
      }
    },
    [camera.zoom],
  );

  const finishPointer = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        dragRef.current = null;
        const position = localPositions.get(drag.objectId) ?? drag.startPosition;
        const result = await moveObject({
          environmentId,
          input: {
            projectId,
            objectId: drag.objectId,
            position,
            expectedRevision: drag.revision,
          },
        });
        if (result._tag === "Failure") {
          setLocalPositions((current) => {
            const next = new Map(current);
            next.delete(drag.objectId);
            return next;
          });
        } else {
          const target = document
            .elementsFromPoint(event.clientX, event.clientY)
            .find((element) => element instanceof HTMLElement && element.dataset.boardThreadId);
          const threadId =
            target instanceof HTMLElement && target.dataset.boardThreadId
              ? ThreadId.make(target.dataset.boardThreadId)
              : null;
          if (threadId && drag.objectId !== BoardObjectId.make(`thread:${threadId}`)) {
            await setGrant({
              environmentId,
              input: {
                projectId,
                threadId,
                objectIds: [drag.objectId],
                access: "read",
              },
            });
          }
        }
      }
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
      touchPointsRef.current.delete(event.pointerId);
      if (touchPointsRef.current.size < 2) pinchRef.current = null;
    },
    [environmentId, localPositions, moveObject, projectId, setGrant],
  );

  const activateThread = useCallback(
    (threadId: ThreadId) => {
      setActiveThreadId(threadId);
      try {
        setLocalStorageItem(activeThreadStorageKey, threadId, ThreadId);
      } catch {
        // Presentation state persistence is best effort.
      }
    },
    [activeThreadStorageKey],
  );
  const objects = board.snapshot?.objects ?? [];
  const objectsById = useMemo(
    () => new Map(objects.map((object) => [object.id, object] as const)),
    [objects],
  );
  const visibleObjectIds = useMemo(
    () =>
      new Set(
        objects
          .filter((object) => boardObjectIntersectsViewport(object, camera, viewportSize))
          .map((object) => object.id),
      ),
    [camera, objects, viewportSize],
  );
  const focusObject = useCallback(
    (object: (typeof objects)[number]) => {
      setSelectedObjectId(object.id);
      if (object.kind === "thread-frame") activateThread(object.threadId);
      setCamera((current) => ({
        ...current,
        x: viewportSize.width / 2 - (object.position.x + object.size.width / 2) * current.zoom,
        y: viewportSize.height / 2 - (object.position.y + object.size.height / 2) * current.zoom,
      }));
    },
    [activateThread, viewportSize.height, viewportSize.width],
  );

  const followedObject = objects.find(
    (object) => object.kind === "thread-frame" && object.threadId === followThreadId,
  );
  const followedThread = followThreadId ? threadsById.get(followThreadId) : undefined;
  useEffect(() => {
    if (!followedObject || followThreadId === null) return;
    focusObject(followedObject);
  }, [
    focusObject,
    followedObject,
    followedThread?.session?.activeTurnId,
    followedThread?.session?.status,
    followedThread?.updatedAt,
    followThreadId,
  ]);

  const toggleFollowActive = useCallback(() => {
    if (followThreadId !== null) {
      setFollowThreadId(null);
      const previous = cameraBeforeFollowRef.current;
      cameraBeforeFollowRef.current = null;
      if (previous) setCamera(previous);
      return;
    }
    if (activeThreadId === null) return;
    cameraBeforeFollowRef.current = camera;
    setFollowThreadId(activeThreadId);
  }, [activeThreadId, camera, followThreadId]);

  const offscreenRunningThreads = objects.flatMap((object) => {
    if (
      object.kind !== "thread-frame" ||
      object.tombstonedAt !== null ||
      boardObjectIntersectsViewport(object, camera, viewportSize) ||
      threadsById.get(object.threadId)?.session?.status !== "running"
    ) {
      return [];
    }
    const center = {
      x: camera.x + (object.position.x + object.size.width / 2) * camera.zoom,
      y: camera.y + 56 + (object.position.y + object.size.height / 2) * camera.zoom,
    };
    const inset = 18;
    const headerInset = 70;
    return [
      {
        object,
        left: Math.max(inset, Math.min(viewportSize.width - 150, center.x)),
        top: Math.max(headerInset, Math.min(viewportSize.height - 42, center.y)),
      },
    ];
  });

  useEffect(() => {
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches("input, textarea, [contenteditable='true']") ||
        target.closest("[data-terminal], [data-approval-control]") !== null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (editable(event.target)) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom(camera.zoom * 1.15);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom(camera.zoom / 1.15);
        return;
      }
      const ordered = objects
        .filter((object) => object.tombstonedAt === null)
        .toSorted(
          (left, right) => left.position.y - right.position.y || left.position.x - right.position.x,
        );
      const selectedIndex = ordered.findIndex((object) => object.id === selectedObjectId);
      if (event.altKey && event.key.startsWith("Arrow") && selectedObjectId) {
        const object = objects.find((candidate) => candidate.id === selectedObjectId);
        if (!object) return;
        event.preventDefault();
        const step = event.shiftKey ? 64 : 16;
        const position = {
          x:
            object.position.x +
            (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y:
            object.position.y +
            (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
        };
        void moveObject({
          environmentId,
          input: {
            projectId,
            objectId: object.id,
            position,
            expectedRevision: object.revision,
          },
        });
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowRight") && ordered.length > 0) {
        event.preventDefault();
        focusObject(ordered[(selectedIndex + 1 + ordered.length) % ordered.length]!);
      } else if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && ordered.length > 0) {
        event.preventDefault();
        focusObject(ordered[(selectedIndex - 1 + ordered.length) % ordered.length]!);
      } else if (event.key === "Enter" && selectedObjectId) {
        const selected = objects.find((object) => object.id === selectedObjectId);
        if (selected?.kind === "thread-frame") {
          event.preventDefault();
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: selected.threadId },
          });
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    camera.zoom,
    environmentId,
    focusObject,
    moveObject,
    navigate,
    objects,
    projectId,
    selectedObjectId,
    setZoom,
  ]);
  const frameAll = useCallback(() => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (bounds) setCamera(fitBoardCamera(objects, bounds));
  }, [objects]);

  const viewportCenter = useCallback((): BoardPoint => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (bounds.width / 2 - camera.x) / camera.zoom - 220,
      y: (bounds.height / 2 - 56 - camera.y) / camera.zoom - 280,
    };
  }, [camera]);

  const defaultDraftPosition = useCallback((): BoardPoint => {
    const active = objects.find(
      (object) => object.kind === "thread-frame" && object.threadId === activeThreadId,
    );
    return active
      ? { x: active.position.x + active.size.width + 80, y: active.position.y }
      : viewportCenter();
  }, [activeThreadId, objects, viewportCenter]);

  const createDraftAt = useCallback(
    async (position: BoardPoint) => {
      const created = await handleNewThread(scopeProjectRef(environmentId, projectId), {
        navigate: false,
      });
      if (!created) return;
      setDraftPositions((current) => new Map(current).set(created.threadId, position));
      activateThread(created.threadId);
    },
    [activateThread, environmentId, handleNewThread, projectId],
  );

  const createNoteAt = useCallback(
    async (position: BoardPoint) => {
      await createNote({
        environmentId,
        input: {
          projectId,
          objectId: BoardObjectId.make(`note:${randomUUID()}`),
          position,
          title: "New note",
          text: "",
          ...(activeThreadId === null ? {} : { originatingThreadId: activeThreadId }),
        },
      });
    },
    [activeThreadId, createNote, environmentId, projectId],
  );

  const createFileReferenceAt = useCallback(
    async (position: BoardPoint) => {
      const path = window.prompt("Project-relative file path");
      if (!path?.trim()) return;
      const checkpointRef = window.prompt(
        "Checkpoint ref (optional — leave blank for a live file)",
        "",
      );
      if (checkpointRef === null) return;
      const lineRange = window.prompt("Line range (optional, for example 12-48)", "");
      if (lineRange === null) return;
      const match = lineRange.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (lineRange.trim() && !match) return;
      const startLine = match ? Number(match[1]) : undefined;
      const endLine = match ? Number(match[2] ?? match[1]) : undefined;
      await createFileReference({
        environmentId,
        input: {
          projectId,
          objectId: BoardObjectId.make(`file:${randomUUID()}`),
          position,
          path: path.trim(),
          ...(startLine === undefined ? {} : { startLine }),
          ...(endLine === undefined ? {} : { endLine }),
          ...(checkpointRef.trim()
            ? { checkpointRef: CheckpointRef.make(checkpointRef.trim()) }
            : {}),
          ...(activeThreadId === null ? {} : { originatingThreadId: activeThreadId }),
        },
      });
    },
    [activeThreadId, createFileReference, environmentId, projectId],
  );

  const createShapeAt = useCallback(
    async (position: BoardPoint) => {
      const label = window.prompt("Shape label", "Idea");
      if (label === null) return;
      await createDiagramShape({
        environmentId,
        input: {
          projectId,
          objectId: BoardObjectId.make(`shape:${randomUUID()}`),
          position,
          shape: "rectangle",
          label,
        },
      });
    },
    [createDiagramShape, environmentId, projectId],
  );

  const createGroupAt = useCallback(
    async (position: BoardPoint) => {
      const title = window.prompt("Group title", "Group");
      if (!title?.trim()) return;
      await createGroup({
        environmentId,
        input: {
          projectId,
          objectId: BoardObjectId.make(`group:${randomUUID()}`),
          position,
          size: { width: 760, height: 620 },
          title: title.trim(),
        },
      });
    },
    [createGroup, environmentId, projectId],
  );

  const connectSelected = useCallback(async () => {
    if (!selectedObjectId) return;
    if (!connectorSourceId) {
      setConnectorSourceId(selectedObjectId);
      return;
    }
    if (connectorSourceId === selectedObjectId) return;
    const relationshipKind = window.prompt(
      "Relationship type: connector or blocked-by",
      "connector",
    );
    if (relationshipKind !== "connector" && relationshipKind !== "blocked-by") return;
    const label = window.prompt("Connector label (optional)", "");
    if (label === null) return;
    await createRelationship({
      environmentId,
      input: {
        projectId,
        relationshipId: BoardRelationshipId.make(`connector:${randomUUID()}`),
        kind: relationshipKind,
        ...(label.trim() ? { label: label.trim() } : {}),
        sourceObjectId: connectorSourceId,
        targetObjectId: selectedObjectId,
      },
    });
    setConnectorSourceId(null);
  }, [connectorSourceId, createRelationship, environmentId, projectId, selectedObjectId]);

  const updateSelectedGrant = useCallback(
    async (access: "read" | "edit", revoked = false) => {
      if (!selectedObjectId || !activeThreadId) return;
      await setGrant({
        environmentId,
        input: {
          projectId,
          threadId: activeThreadId,
          objectIds: [selectedObjectId],
          access,
          revoked,
        },
      });
    },
    [activeThreadId, environmentId, projectId, selectedObjectId, setGrant],
  );

  const selectedGrant =
    activeThreadId && selectedObjectId
      ? board.snapshot?.grants.find(
          (grant) =>
            grant.threadId === activeThreadId &&
            grant.objectId === selectedObjectId &&
            grant.revokedAt === null,
        )
      : undefined;
  const selectedObject = selectedObjectId ? objectsById.get(selectedObjectId) : undefined;
  const selectedRelationship = selectedRelationshipId
    ? board.snapshot?.relationships.find(
        (relationship) => relationship.id === selectedRelationshipId,
      )
    : undefined;
  const wholeBoardGrant = activeThreadId
    ? board.snapshot?.grants.find(
        (grant) =>
          grant.threadId === activeThreadId &&
          grant.objectId === BOARD_WHOLE_BOARD_OBJECT_ID &&
          grant.revokedAt === null,
      )
    : undefined;
  const updateWholeBoardAuthority = (access: "read" | "edit") => {
    if (!activeThreadId) return;
    void setAuthority({
      environmentId,
      input: {
        projectId,
        threadId: activeThreadId,
        access,
        revoked: wholeBoardGrant?.access === access,
      },
    });
  };

  const editSelectedObject = async () => {
    if (!selectedObject) return;
    if (selectedObject.kind === "thread-frame") {
      const sizes = ["compact", "standard", "wide"] as const;
      const next = sizes[(sizes.indexOf(selectedObject.frameSize) + 1) % sizes.length]!;
      await updateObject({
        environmentId,
        input: {
          projectId,
          objectId: selectedObject.id,
          expectedRevision: selectedObject.revision,
          frameSize: next,
        },
      });
      return;
    }
    if (selectedObject.kind === "diagram-shape") {
      const label = window.prompt("Shape label", selectedObject.label);
      if (label === null) return;
      const shape = window.prompt(
        "Shape type: rectangle, ellipse, or diamond",
        selectedObject.shape,
      );
      if (shape !== "rectangle" && shape !== "ellipse" && shape !== "diamond") return;
      await updateObject({
        environmentId,
        input: {
          projectId,
          objectId: selectedObject.id,
          expectedRevision: selectedObject.revision,
          label,
          shape,
        },
      });
      return;
    }
    if (selectedObject.kind === "group") {
      const title = window.prompt("Group title", selectedObject.title);
      if (!title?.trim()) return;
      await updateObject({
        environmentId,
        input: {
          projectId,
          objectId: selectedObject.id,
          expectedRevision: selectedObject.revision,
          title: title.trim(),
        },
      });
      return;
    }
    if (selectedObject.kind === "file-reference") {
      const path = window.prompt("Project-relative path", selectedObject.path);
      if (!path?.trim()) return;
      const range = window.prompt(
        "Line range (blank for all lines)",
        selectedObject.startLine
          ? `${selectedObject.startLine}-${selectedObject.endLine ?? selectedObject.startLine}`
          : "",
      );
      if (range === null) return;
      const match = range.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (range.trim() && !match) return;
      await updateObject({
        environmentId,
        input: {
          projectId,
          objectId: selectedObject.id,
          expectedRevision: selectedObject.revision,
          path: path.trim(),
          startLine: match ? Number(match[1]) : null,
          endLine: match ? Number(match[2] ?? match[1]) : null,
        },
      });
    }
  };

  const resizeSelectedObject = async () => {
    if (!selectedObject) return;
    const width = Number(window.prompt("Width", String(Math.round(selectedObject.size.width))));
    if (!Number.isFinite(width) || width <= 0) return;
    const height = Number(window.prompt("Height", String(Math.round(selectedObject.size.height))));
    if (!Number.isFinite(height) || height <= 0) return;
    await updateObject({
      environmentId,
      input: {
        projectId,
        objectId: selectedObject.id,
        expectedRevision: selectedObject.revision,
        size: { width, height },
      },
    });
  };

  const editSelectedRelationship = async () => {
    if (!selectedRelationship) return;
    const label = window.prompt("Connector label", selectedRelationship.label ?? "");
    if (label === null) return;
    await updateRelationship({
      environmentId,
      input: {
        projectId,
        relationshipId: selectedRelationship.id,
        expectedRevision: selectedRelationship.revision,
        label: label.trim() ? label : null,
      },
    });
  };

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--border)_48%,transparent)_1px,transparent_1px)] bg-[size:24px_24px]">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/85 px-4 backdrop-blur-md">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {project?.title ?? "Project board"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {board.status === "live" ? `${objects.length} objects` : "Synchronizing board…"}
          </p>
        </div>
        <div className="pointer-events-auto flex max-w-[calc(100%-16rem)] items-center gap-1 overflow-x-auto rounded-lg border border-border bg-background/90 p-1 shadow-sm">
          <Button
            size="sm"
            variant="ghost"
            aria-label="New thread on board"
            onClick={() => void createDraftAt(defaultDraftPosition())}
          >
            <MessageSquarePlusIcon />
            New thread
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="New note on board"
            onClick={() => void createNoteAt(viewportCenter())}
          >
            <StickyNoteIcon />
            Note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Add file reference to board"
            onClick={() => void createFileReferenceAt(viewportCenter())}
          >
            <FilePlus2Icon />
            File
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Add diagram shape"
            onClick={() => void createShapeAt(viewportCenter())}
          >
            <ShapesIcon /> Shape
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Add soft group"
            onClick={() => void createGroupAt(viewportCenter())}
          >
            <GroupIcon /> Group
          </Button>
          <Button
            size="sm"
            variant={connectorSourceId ? "secondary" : "ghost"}
            disabled={!selectedObjectId}
            aria-label="Connect selected board objects"
            onClick={() => void connectSelected()}
          >
            <WorkflowIcon /> {connectorSourceId ? "To…" : "Connect"}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!selectedObject && !selectedRelationship}
            aria-label="Edit selected board item"
            onClick={() =>
              void (selectedRelationship ? editSelectedRelationship() : editSelectedObject())
            }
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!selectedObject}
            aria-label="Resize selected board object"
            onClick={() => void resizeSelectedObject()}
          >
            <ScalingIcon />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selectedObjectId || !activeThreadId}
            aria-label="Share selected object read-only with active thread"
            onClick={() => void updateSelectedGrant("read")}
          >
            <Share2Icon /> Read
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selectedObjectId || !activeThreadId}
            aria-label="Share selected object for editing with active thread"
            onClick={() => void updateSelectedGrant("edit")}
          >
            <Share2Icon /> Edit
          </Button>
          <Button
            size="sm"
            variant={wholeBoardGrant?.access === "read" ? "secondary" : "ghost"}
            disabled={!activeThreadId}
            aria-label="Toggle active thread full-board read authority"
            aria-pressed={wholeBoardGrant?.access === "read"}
            onClick={() => updateWholeBoardAuthority("read")}
          >
            <Share2Icon /> Full read
          </Button>
          <Button
            size="sm"
            variant={wholeBoardGrant?.access === "edit" ? "secondary" : "ghost"}
            disabled={!activeThreadId}
            aria-label="Toggle active thread full-board edit authority"
            aria-pressed={wholeBoardGrant?.access === "edit"}
            onClick={() => updateWholeBoardAuthority("edit")}
          >
            <Share2Icon /> Full edit
          </Button>
          <Button
            size="icon-xs"
            variant={followThreadId !== null ? "secondary" : "ghost"}
            disabled={activeThreadId === null}
            aria-label={
              followThreadId !== null ? "Stop following active thread" : "Follow active thread"
            }
            aria-pressed={followThreadId !== null}
            onClick={toggleFollowActive}
          >
            <LocateFixedIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!selectedGrant}
            aria-label="Detach selected object from active thread"
            title="Revokes future access; prior conversation history is unchanged."
            onClick={() => void updateSelectedGrant(selectedGrant?.access ?? "read", true)}
          >
            <UnlinkIcon />
          </Button>
          <Button
            size="icon-xs"
            variant={showDeleted ? "secondary" : "ghost"}
            aria-label="Show deleted board objects"
            aria-pressed={showDeleted}
            onClick={() => setShowDeleted((value) => !value)}
          >
            <EyeIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={!selectedObject || selectedObject.tombstonedAt === null}
            aria-label="Restore selected deleted object"
            title="Restore the selected object"
            onClick={() => {
              if (!selectedObject || selectedObject.tombstonedAt === null) return;
              void setTombstoned({
                environmentId,
                input: {
                  projectId,
                  object: { id: selectedObject.id, revision: selectedObject.revision },
                  tombstoned: false,
                },
              });
            }}
          >
            <Undo2Icon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => setZoom(camera.zoom / 1.15)}
          >
            <MinusIcon />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(camera.zoom * 100)}%
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => setZoom(camera.zoom * 1.15)}
          >
            <PlusIcon />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Frame all" onClick={frameAll}>
            <Maximize2Icon />
          </Button>
        </div>
      </header>

      <BoardOutline
        objects={objects}
        threadsById={threadsById}
        selectedObjectId={selectedObjectId}
        showDeleted={showDeleted}
        onSelect={focusObject}
        onSearchResults={setSearchResultIds}
      />

      <div className="pointer-events-none absolute inset-0 z-10" aria-label="Off-screen activity">
        {offscreenRunningThreads.map(({ object, left, top }) => {
          const thread = threadsById.get(object.threadId);
          return (
            <button
              key={object.id}
              type="button"
              className="pointer-events-auto absolute max-w-36 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-primary/50 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left, top }}
              aria-label={`Focus running thread ${thread?.title ?? object.threadId}`}
              onClick={() => focusObject(object)}
            >
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary" />
              {thread?.title ?? "Running thread"}
            </button>
          );
        })}
      </div>

      <div
        ref={canvasRef}
        className="absolute inset-0 touch-none overflow-hidden pt-14"
        onWheel={onWheel}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          void createDraftAt({
            x: (event.clientX - bounds.left - camera.x) / camera.zoom - 220,
            y: (event.clientY - bounds.top - 56 - camera.y) / camera.zoom - 280,
          });
        }}
        aria-label="Project agent board"
      >
        <div
          className="absolute left-0 top-14 origin-top-left will-change-transform"
          style={{
            transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
          }}
        >
          {objects.map((object) => {
            if (
              object.kind !== "group" ||
              object.tombstonedAt !== null ||
              !visibleObjectIds.has(object.id)
            )
              return null;
            const position = localPositions.get(object.id) ?? object.position;
            return (
              <section
                key={object.id}
                className="absolute rounded-2xl border-2 border-dashed border-border/70 bg-muted/15 p-3"
                style={{
                  width: object.size.width,
                  height: object.size.height,
                  transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                  opacity: searchResultIds && !searchResultIds.has(object.id) ? 0.2 : 1,
                }}
                aria-label={`Group: ${object.title}`}
                onClick={() => setSelectedObjectId(object.id)}
                onPointerDown={(event) => {
                  if (event.button !== 0 || event.target !== event.currentTarget) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    objectId: object.id,
                    pointerId: event.pointerId,
                    startClient: { x: event.clientX, y: event.clientY },
                    startPosition: position,
                    revision: object.revision,
                  };
                }}
              >
                <span className="rounded bg-background/80 px-2 py-1 text-xs font-medium">
                  {object.title}
                </span>
              </section>
            );
          })}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" aria-hidden>
            {(board.snapshot?.relationships ?? []).map((relationship) => {
              if (relationship.tombstonedAt !== null) return null;
              const source = objectsById.get(relationship.sourceObjectId);
              const target = objectsById.get(relationship.targetObjectId);
              if (!source || !target) return null;
              if (!visibleObjectIds.has(source.id) && !visibleObjectIds.has(target.id)) return null;
              const sourcePosition = localPositions.get(source.id) ?? source.position;
              const targetPosition = localPositions.get(target.id) ?? target.position;
              const emphasized =
                selectedRelationshipId === relationship.id ||
                selectedObjectId === source.id ||
                selectedObjectId === target.id ||
                (source.kind === "thread-frame" && source.threadId === activeThreadId) ||
                (target.kind === "thread-frame" && target.threadId === activeThreadId);
              return (
                <g key={relationship.id} opacity={emphasized ? 0.9 : 0.16}>
                  <line
                    className="pointer-events-auto cursor-pointer"
                    x1={sourcePosition.x + source.size.width / 2}
                    y1={sourcePosition.y + source.size.height / 2}
                    x2={targetPosition.x + target.size.width / 2}
                    y2={targetPosition.y + target.size.height / 2}
                    stroke="currentColor"
                    strokeWidth={relationship.kind === "connector" ? 2 : 3}
                    strokeDasharray={relationship.kind === "blocked-by" ? "8 6" : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedObjectId(null);
                      setSelectedRelationshipId(relationship.id);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setSelectedRelationshipId(relationship.id);
                      const label = window.prompt("Connector label", relationship.label ?? "");
                      if (label === null) return;
                      void updateRelationship({
                        environmentId,
                        input: {
                          projectId,
                          relationshipId: relationship.id,
                          expectedRevision: relationship.revision,
                          label: label.trim() ? label : null,
                        },
                      });
                    }}
                  />
                  {relationship.label ? (
                    <text
                      x={
                        (sourcePosition.x +
                          source.size.width / 2 +
                          targetPosition.x +
                          target.size.width / 2) /
                        2
                      }
                      y={
                        (sourcePosition.y +
                          source.size.height / 2 +
                          targetPosition.y +
                          target.size.height / 2) /
                          2 -
                        8
                      }
                      textAnchor="middle"
                      className="fill-current text-xs"
                    >
                      {relationship.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {objects.map((object) => {
            if (
              object.kind !== "diagram-shape" ||
              object.tombstonedAt !== null ||
              !visibleObjectIds.has(object.id)
            )
              return null;
            const position = localPositions.get(object.id) ?? object.position;
            return (
              <button
                key={object.id}
                type="button"
                className={`absolute flex items-center justify-center border-2 bg-card px-4 text-sm shadow-md ${
                  selectedObjectId === object.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border"
                } ${
                  object.shape === "ellipse"
                    ? "rounded-full"
                    : object.shape === "diamond"
                      ? "rotate-45 rounded-lg"
                      : "rounded-xl"
                }`}
                style={{
                  width: object.size.width,
                  height: object.size.height,
                  transform: `translate3d(${position.x}px, ${position.y}px, 0)${
                    object.shape === "diamond" ? " rotate(45deg)" : ""
                  }`,
                  opacity: searchResultIds && !searchResultIds.has(object.id) ? 0.2 : 1,
                }}
                onClick={() => {
                  setSelectedRelationshipId(null);
                  setSelectedObjectId(object.id);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    objectId: object.id,
                    pointerId: event.pointerId,
                    startClient: { x: event.clientX, y: event.clientY },
                    startPosition: position,
                    revision: object.revision,
                  };
                }}
              >
                <span className={object.shape === "diamond" ? "-rotate-45" : undefined}>
                  {object.label}
                </span>
              </button>
            );
          })}
          {objects.map((object) => {
            if (object.kind !== "thread-frame" || object.tombstonedAt !== null) return null;
            if (!boardObjectIntersectsViewport(object, camera, viewportSize)) return null;
            const thread = threadsById.get(object.threadId);
            const position = localPositions.get(object.id) ?? object.position;
            return (
              <BoardThreadFrameCard
                key={object.id}
                environmentId={environmentId}
                object={object}
                position={position}
                zoom={camera.zoom}
                thread={thread}
                active={activeThreadId === object.threadId}
                dimmed={Boolean(searchResultIds && !searchResultIds.has(object.id))}
                artifactCount={
                  objects.filter(
                    (candidate) =>
                      candidate.kind !== "thread-frame" &&
                      candidate.originatingThreadId === object.threadId &&
                      candidate.tombstonedAt === null,
                  ).length
                }
                onActivate={() => {
                  activateThread(object.threadId);
                  setSelectedObjectId(object.id);
                }}
                onDwell={() => {
                  if (dwellTimeoutRef.current !== null)
                    window.clearTimeout(dwellTimeoutRef.current);
                  dwellTimeoutRef.current = window.setTimeout(
                    () => activateThread(object.threadId),
                    200,
                  );
                }}
                onDwellEnd={() => {
                  if (dwellTimeoutRef.current !== null)
                    window.clearTimeout(dwellTimeoutRef.current);
                  dwellTimeoutRef.current = null;
                }}
                onDragStart={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  activateThread(object.threadId);
                  dragRef.current = {
                    objectId: object.id,
                    pointerId: event.pointerId,
                    startClient: { x: event.clientX, y: event.clientY },
                    startPosition: position,
                    revision: object.revision,
                  };
                }}
              />
            );
          })}
          {objects.map((object) => {
            if (object.kind !== "text-note") return null;
            if (object.tombstonedAt !== null && !showDeleted) return null;
            if (!boardObjectIntersectsViewport(object, camera, viewportSize)) return null;
            const position = localPositions.get(object.id) ?? object.position;
            const access = activeThreadId
              ? board.snapshot?.grants.find(
                  (grant) =>
                    grant.threadId === activeThreadId &&
                    grant.objectId === object.id &&
                    grant.revokedAt === null,
                )?.access
              : undefined;
            return (
              <BoardNoteCard
                key={object.id}
                environmentId={environmentId}
                object={object}
                position={position}
                {...(access === undefined ? {} : { access })}
                dimmed={Boolean(searchResultIds && !searchResultIds.has(object.id))}
                onSelect={() => setSelectedObjectId(object.id)}
                onDragStart={(event) => {
                  if (event.button !== 0 || object.tombstonedAt !== null) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    objectId: object.id,
                    pointerId: event.pointerId,
                    startClient: { x: event.clientX, y: event.clientY },
                    startPosition: position,
                    revision: object.revision,
                  };
                }}
              />
            );
          })}
          {project
            ? objects.map((object) => {
                if (object.kind !== "file-reference" || object.tombstonedAt !== null) return null;
                if (!boardObjectIntersectsViewport(object, camera, viewportSize)) return null;
                const position = localPositions.get(object.id) ?? object.position;
                const access = activeThreadId
                  ? board.snapshot?.grants.find(
                      (grant) =>
                        grant.threadId === activeThreadId &&
                        grant.objectId === object.id &&
                        grant.revokedAt === null,
                    )?.access
                  : undefined;
                return (
                  <BoardFileReferenceCard
                    key={object.id}
                    environmentId={environmentId}
                    workspaceRoot={project.workspaceRoot}
                    object={object}
                    position={position}
                    {...(access === undefined ? {} : { access })}
                    dimmed={Boolean(searchResultIds && !searchResultIds.has(object.id))}
                    onSelect={() => setSelectedObjectId(object.id)}
                    onDragStart={(event) => {
                      if (event.button !== 0) return;
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        objectId: object.id,
                        pointerId: event.pointerId,
                        startClient: { x: event.clientX, y: event.clientY },
                        startPosition: position,
                        revision: object.revision,
                      };
                    }}
                  />
                );
              })
            : null}
          {project
            ? draftFrames.map(({ draftId, draft }) => {
                const position = draftPositions.get(draft.threadId) ?? defaultDraftPosition();
                return (
                  <BoardDraftFrameCard
                    key={draftId}
                    draftId={draftId}
                    draft={draft}
                    project={project}
                    serverConfig={serverConfigs.get(environmentId)}
                    position={position}
                    onCreated={async () => {
                      await placeThreadFrame({
                        environmentId,
                        input: { projectId, threadId: draft.threadId, position },
                      });
                    }}
                  />
                );
              })
            : null}
        </div>
      </div>
    </main>
  );
}
