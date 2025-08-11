"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { useCallback } from "react";
import { useBoardActions } from "@/context/BoardActionsContext";
import { useCommandPalette } from "@/context/CommandPaletteContext";

function isTypingInInput(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  const editable = (active as HTMLElement).isContentEditable;
  return (
    editable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    active.getAttribute("role") === "textbox"
  );
}

export function useKeyboardShortcuts() {
  const router = useRouter();
  const boardActions = useBoardActions();
  const { setOpen } = useCommandPalette();

  // Create new checklist note
  useHotkeys(
    ["ctrl+enter", "cmd+enter"],
    (e) => {
      e.preventDefault();
      boardActions?.createChecklistNote();
    },
    { enableOnFormTags: true },
    [boardActions]
  );

  // Delete selected notes
  useHotkeys(
    ["ctrl+delete", "cmd+delete"],
    (e) => {
      e.preventDefault();
      if (boardActions && boardActions.selectedNoteIds.size > 0) {
        boardActions.deleteSelectedNotes();
      }
    },
    { enableOnFormTags: true },
    [boardActions]
  );

  // Open command palette
  useHotkeys(
    ["cmd+k", "ctrl+k"],
    (e) => {
      e.preventDefault();
      setOpen(true);
    },
    { enableOnFormTags: true },
    [setOpen]
  );

  // Focus search when not typing
  useHotkeys(
    "/",
    (e) => {
      if (!isTypingInInput()) {
        e.preventDefault();
        try {
          const el = document.getElementById("search-input") as
            | HTMLInputElement
            | null;
          if (el) el.focus();
          else boardActions?.focusSearch();
        } catch {}
      }
    },
    { enableOnFormTags: false },
    [boardActions]
  );

  // Clear selection / close modals
  useHotkeys(
    "escape",
    (e) => {
      e.preventDefault();
      boardActions?.clearSelection();
      boardActions?.closeAllModals();
    },
    { enableOnFormTags: true },
    [boardActions]
  );

  // Quick board switching: Cmd/Ctrl + 1-9 handled where boards list is available
}

export function useBoardSwitching(boards: { id: string }[]) {
  const router = useRouter();
  // Cmd/Ctrl + 1-9 for quick board switching
  boards.slice(0, 9).forEach((board, index) => {
    useHotkeys(
      [
        `cmd+${index + 1}`,
        `ctrl+${index + 1}`,
      ],
      (e) => {
        e.preventDefault();
        router.push(`/boards/${board.id}`);
      },
      { enableOnFormTags: true },
      [board.id]
    );
  });
}


