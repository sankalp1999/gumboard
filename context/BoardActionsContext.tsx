"use client";

import React, { createContext, useContext } from "react";
import type { Board } from "@/components/note";

export interface BoardActionsContextValue {
  createChecklistNote: () => void;
  createTextNote: () => void;
  deleteSelectedNotes: () => void;
  archiveSelectedNotes: () => void;
  selectedNoteIds: Set<string>;
  focusSearch: () => void;
  clearSelection: () => void;
  closeAllModals: () => void;
  currentBoard: Board | null;
}

const BoardActionsContext = createContext<BoardActionsContextValue | null>(
  null
);

export function useBoardActions(): BoardActionsContextValue | null {
  return useContext(BoardActionsContext);
}

export function BoardActionsProvider({
  value,
  children,
}: {
  value: BoardActionsContextValue;
  children: React.ReactNode;
}) {
  return (
    <BoardActionsContext.Provider value={value}>
      {children}
    </BoardActionsContext.Provider>
  );
}


