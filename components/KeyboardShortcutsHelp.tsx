"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AppContext = "dashboard" | "board" | "note-editing" | "other";

function detectAppContext(): AppContext {
  if (typeof window === "undefined") return "other";
  
  const pathname = window.location.pathname;
  
  if (pathname === "/dashboard") return "dashboard";
  
  if (pathname.startsWith("/boards/")) {
    const activeElement = document.activeElement as HTMLElement;
    const isInNoteEditor = activeElement && (
      activeElement.tagName.toLowerCase() === "textarea" ||
      activeElement.tagName.toLowerCase() === "input" ||
      activeElement.isContentEditable ||
      activeElement.closest("[data-note-editor]") !== null ||
      activeElement.closest("[role='textbox']") !== null
    );
    
    return isInNoteEditor ? "note-editing" : "board";
  }
  
  return "other";
}

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AppContext>("other");

  useEffect(() => {
    const onOpen = () => {
      setContext(detectAppContext());
      setOpen(true);
    };
    window.addEventListener("gumboard:open-shortcuts", onOpen as EventListener);
    return () => {
      window.removeEventListener(
        "gumboard:open-shortcuts",
        onOpen as EventListener
      );
    };
  }, []);

  const globalShortcuts = [
    { keys: "⌘ K", description: "Open command palette" },
    { keys: "⌘ 1-9", description: "Switch to board by index" },
    { keys: "?", description: "Show this help" },
    { keys: "Escape", description: "Clear selection / Close modals" },
  ];

  const dashboardShortcuts = [
    { keys: "⌘ K", description: "Open command palette" },
    { keys: "⌘ 1-9", description: "Switch to board by index" },
    { keys: "?", description: "Show this help" },
    { keys: "Escape", description: "Close modals" },
  ];

  const boardShortcuts = [
    { keys: "⌘ K", description: "Open command palette" },
    { keys: "⌘ Enter", description: "Create new checklist note" },
    { keys: "⌘ Delete", description: "Delete selected notes" },
    { keys: "/", description: "Focus search" },
    { keys: "⌘ 1-9", description: "Switch to board by index" },
    { keys: "Escape", description: "Clear selection / Close modals" },
    { keys: "?", description: "Show this help" },
  ];

  const noteEditingShortcuts = [
    { keys: "⌘ K", description: "Open command palette" },
    { keys: "⌘ ⇧ Enter", description: "Add checklist item to current note" },
    { keys: "⌘ 1-9", description: "Switch to board by index" },
    { keys: "Escape", description: "Clear selection / Close modals" },
    { keys: "?", description: "Show this help" },
  ];

  const getShortcutsForContext = () => {
    switch (context) {
      case "dashboard":
        return dashboardShortcuts;
      case "board":
        return boardShortcuts;
      case "note-editing":
        return noteEditingShortcuts;
      default:
        return globalShortcuts;
    }
  };

  const getContextTitle = () => {
    switch (context) {
      case "dashboard":
        return "Keyboard Shortcuts - Dashboard";
      case "board":
        return "Keyboard Shortcuts - Board Page";
      case "note-editing":
        return "Keyboard Shortcuts - Note Editing";
      default:
        return "Keyboard Shortcuts";
    }
  };

  const shortcuts = getShortcutsForContext();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getContextTitle()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {context === "dashboard" && "Available shortcuts on the dashboard page:"}
            {context === "board" && "Available shortcuts when viewing a board:"}
            {context === "note-editing" && "Available shortcuts when editing a note:"}
            {context === "other" && "Global keyboard shortcuts:"}
          </div>
          <div className="space-y-2">
            {shortcuts.map(({ keys, description }) => (
              <div key={keys} className="flex justify-between items-center">
                <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">
                  {keys}
                </kbd>
                <span className="text-sm flex-1 text-right">{description}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


