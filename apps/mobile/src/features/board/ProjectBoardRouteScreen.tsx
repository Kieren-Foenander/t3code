import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { LoadingScreen } from "../../components/LoadingScreen";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useEnvironmentBoard } from "../../state/board";
import { useProject, useThreadShells } from "../../state/entities";
import { mobileBoardContentSize, mobileThreadBoardStatus } from "./boardLayout";
import { useArchivedThreadSnapshots } from "../archive/useArchivedThreadSnapshots";

type Props = StaticScreenProps<{ environmentId: string; projectId: string }>;

const cameraByBoard = new Map<string, { x: number; y: number }>();
const selectedObjectByBoard = new Map<string, string>();

export function ProjectBoardRouteScreen({ route }: Props) {
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const projectId = ProjectId.make(route.params.projectId);
  const board = useEnvironmentBoard(environmentId, projectId);
  const project = useProject(scopeProjectRef(environmentId, projectId));
  const threads = useThreadShells();
  const { snapshots: archivedSnapshots } = useArchivedThreadSnapshots([environmentId]);
  const key = `${environmentId}:${projectId}`;
  const viewport = useWindowDimensions();
  const [selectedObjectId, setSelectedObjectId] = useState(
    () => selectedObjectByBoard.get(key) ?? null,
  );
  const objects = board.snapshot?.objects.filter((object) => object.tombstonedAt === null) ?? [];
  const threadsById = useMemo(
    () =>
      new Map([
        ...archivedSnapshots.flatMap((entry) =>
          entry.environmentId === environmentId
            ? entry.snapshot.threads
                .filter((thread) => thread.projectId === projectId)
                .map((thread) => [thread.id, { ...thread, environmentId }] as const)
            : [],
        ),
        ...threads
          .filter(
            (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
          )
          .map((thread) => [thread.id, thread] as const),
      ]),
    [archivedSnapshots, environmentId, projectId, threads],
  );
  const { width, height } = mobileBoardContentSize(objects, viewport);
  const initialCamera = cameraByBoard.get(key) ?? { x: 0, y: 0 };

  if (!project || !board.snapshot) {
    return <LoadingScreen message="Opening project board…" messagePlacement="above-spinner" />;
  }

  return (
    <View className="flex-1 bg-screen">
      <NativeStackScreenOptions options={{ title: project.title }} />
      <ScrollView
        horizontal
        contentOffset={{ x: initialCamera.x, y: 0 }}
        onMomentumScrollEnd={(event) => {
          const previous = cameraByBoard.get(key) ?? { x: 0, y: 0 };
          cameraByBoard.set(key, { ...previous, x: event.nativeEvent.contentOffset.x });
        }}
      >
        <ScrollView
          contentOffset={{ x: 0, y: initialCamera.y }}
          onMomentumScrollEnd={(event) => {
            const previous = cameraByBoard.get(key) ?? { x: 0, y: 0 };
            cameraByBoard.set(key, { ...previous, y: event.nativeEvent.contentOffset.y });
          }}
        >
          <View style={{ width, height }} className="bg-screen">
            {objects.map((object) => {
              const selected = selectedObjectId === object.id;
              if (object.kind === "thread-frame") {
                const thread = threadsById.get(object.threadId);
                return (
                  <Pressable
                    key={object.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Thread ${thread?.title ?? object.threadId}`}
                    accessibilityHint="Opens the full thread timeline and composer"
                    accessibilityState={{ selected }}
                    className={`absolute h-40 w-72 rounded-2xl border bg-surface p-4 ${
                      selected ? "border-accent" : "border-border"
                    }`}
                    style={{ left: object.position.x, top: object.position.y }}
                    onPress={() => {
                      selectedObjectByBoard.set(key, object.id);
                      setSelectedObjectId(object.id);
                      navigation.navigate("Thread", {
                        environmentId,
                        threadId: object.threadId,
                      });
                    }}
                  >
                    <Text className="text-base font-t3-bold" numberOfLines={2}>
                      {thread?.title ?? "Untitled thread"}
                    </Text>
                    <Text className="mt-2 text-sm text-foreground-muted">
                      {mobileThreadBoardStatus({
                        running: thread?.session?.status === "running",
                        settled: Boolean(thread?.settledAt),
                        blocked: Boolean(
                          thread?.hasPendingApprovals || thread?.hasPendingUserInput,
                        ),
                        ...(thread?.planProgress?.step
                          ? { planStep: thread.planProgress.step }
                          : {}),
                      })}
                    </Text>
                    <Text className="mt-auto text-xs text-foreground-tertiary">
                      Tap for timeline and composer
                    </Text>
                  </Pressable>
                );
              }
              const summary =
                object.kind === "text-note"
                  ? object.text || "Empty note"
                  : object.kind === "file-reference"
                    ? object.path
                    : object.kind === "diagram-shape"
                      ? object.label
                      : object.title;
              const title =
                object.kind === "text-note"
                  ? object.title
                  : object.kind === "file-reference"
                    ? "File reference"
                    : object.kind === "diagram-shape"
                      ? "Diagram shape"
                      : "Group";
              return (
                <Pressable
                  key={object.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}: ${summary}`}
                  accessibilityState={{ selected }}
                  className={`absolute h-32 w-64 rounded-xl border bg-surface p-4 ${
                    selected ? "border-accent" : "border-border"
                  }`}
                  style={{ left: object.position.x, top: object.position.y }}
                  onPress={() => {
                    selectedObjectByBoard.set(key, object.id);
                    setSelectedObjectId(object.id);
                  }}
                >
                  <Text className="text-sm font-t3-bold">{title}</Text>
                  <Text className="mt-2 text-sm text-foreground-muted" numberOfLines={3}>
                    {summary}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
