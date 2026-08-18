import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentBoardAtoms,
  EMPTY_BOARD_STATE,
  type BoardState,
} from "@t3tools/client-runtime/state/board";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

export const environmentBoards = createEnvironmentBoardAtoms(connectionAtomRuntime);

const EMPTY_BOARD_ATOM = Atom.make(EMPTY_BOARD_STATE).pipe(
  Atom.withLabel("mobile-environment-board:empty"),
);

export function useEnvironmentBoard(
  environmentId: EnvironmentId | null,
  projectId: ProjectId | null,
): BoardState {
  return useAtomValue(
    environmentId === null || projectId === null
      ? EMPTY_BOARD_ATOM
      : environmentBoards.stateValueAtom({ environmentId, projectId }),
  );
}
