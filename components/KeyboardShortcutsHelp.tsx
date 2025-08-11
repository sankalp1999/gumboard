"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBoardActions } from "@/context/BoardActionsContext";

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useHotkeys(
    "?",
    () => setOpen(true),
    {
      enableOnFormTags: false,
    }
  );

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("gumboard:open-shortcuts", onOpen as EventListener);
    return () => {
      window.removeEventListener(
        "gumboard:open-shortcuts",
        onOpen as EventListener
      );
    };
  }, []);

  const boardActions = useBoardActions();
  const isOnBoard = Boolean(boardActions?.currentBoard);

  const globalShortcuts = [
    { keys: "⌘ K", description: "Open command palette" },
    { keys: "?", description: "Show this help" },
  ];

  const boardShortcuts = [
    { keys: "⌘ Enter", description: "Create new checklist note" },
    { keys: "⌘ Delete", description: "Delete selected notes" },
    { keys: "/", description: "Focus search" },
    { keys: "Escape", description: "Clear selection / Close" },
    { keys: "⌘ 1-9", description: "Switch to board" },
  ];

  const shortcuts = isOnBoard
    ? [...globalShortcuts, ...boardShortcuts]
    : globalShortcuts;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map(({ keys, description }) => (
            <div key={keys} className="flex justify-between">
              <kbd className="px-2 py-1 bg-muted rounded text-sm">
                {keys}
              </kbd>
              <span className="text-sm">{description}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}


