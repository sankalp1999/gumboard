"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCommandPalette } from "@/context/CommandPaletteContext";
import { useBoardActions } from "@/context/BoardActionsContext";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Search as SearchIcon,
  Archive,
  CheckSquare,
  Home,
  Trash2,
  Grid3X3 as Grid3x3,
  Folder,
  Settings as SettingsIcon,
  Keyboard as KeyboardIcon,
  StickyNote,
} from "lucide-react";

type SimpleBoard = { id: string; name: string };

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

export function CommandPalette({ boards }: { boards: SimpleBoard[] }) {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const boardActions = useBoardActions();
  const [context, setContext] = React.useState<AppContext>("other");

  // Update context when dialog opens
  React.useEffect(() => {
    if (open) {
      setContext(detectAppContext());
      // Ensure input receives focus for keyboard navigation
      setTimeout(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement | null;
        input?.focus();
      }, 0);
    }
  }, [open]);

  // Handle cmd+k to close when dialog is open
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Close on cmd+k when dialog is open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(false);
      }
      // ESC is handled by cmdk internally
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);


  return (
    <>
      {open && <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />}
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Global Command Menu"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <Command className="fixed left-1/2 top-20 z-50 w-full max-w-2xl -translate-x-1/2 bg-background rounded-lg shadow-2xl border border-border">
          <div className="flex items-center px-4 py-3 border-b border-border">
            <SearchIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input
              placeholder="Type a command or search..."
              className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/50">
            Use ↑↓ to navigate, ⏎ to select, ⌘K or ESC to close
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {/* Create commands - only available on board pages (not dashboard or note editing) */}
          {(context === "board") && (
            <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              <Command.Item
                value="new-checklist-note"
                onSelect={() => {
                  boardActions?.createChecklistNote();
                  setOpen(false);
                }}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                <span>New Checklist Note</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘⇧↵</kbd>
              </Command.Item>

              <Command.Item
                value="new-text-note"
                onSelect={() => {
                  boardActions?.createTextNote();
                  setOpen(false);
                }}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100"
              >
                <StickyNote className="mr-2 h-4 w-4" />
                <span>New Text Note</span>
              </Command.Item>
            </Command.Group>
          )}

          {/* Note editing commands - only available when editing a note */}
          {context === "note-editing" && (
            <Command.Group heading="Note Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              <Command.Item
                value="add-checklist-item"
                onSelect={() => {
                  const event = new CustomEvent("gumboard:add-checklist-item");
                  window.dispatchEvent(event);
                  setOpen(false);
                }}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                <span>Add Checklist Item</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘↵</kbd>
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
              value="go-to-dashboard"
              onSelect={() => {
                router.push("/dashboard");
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <Home className="mr-2 h-4 w-4" />
              <span>Go to Dashboard</span>
            </Command.Item>

            <Command.Item
              value="go-to-all-notes"
              onSelect={() => {
                router.push("/boards/all-notes");
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <Grid3x3 className="mr-2 h-4 w-4" />
              <span>All Notes</span>
            </Command.Item>

            <Command.Item
              value="go-to-archive"
              onSelect={() => {
                router.push("/boards/archive");
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span>Archive</span>
            </Command.Item>
          </Command.Group>

          {boards?.length > 0 && (
            <Command.Group heading="Boards" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              {boards.map((board, index) => (
                <Command.Item
                  key={board.id}
                  value={`board-${board.id}`}
                  onSelect={() => {
                    router.push(`/boards/${board.id}`);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100"
                >
                  <Folder className="mr-2 h-4 w-4" />
                  <span>{board.name}</span>
                  {index < 9 && (
                    <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘{index + 1}</kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Board-specific actions - only available on board pages */}
          {boardActions?.currentBoard && context === "board" && (
            <Command.Group heading="Current Board" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              <Command.Item
                value="search-notes"
                onSelect={() => {
                  boardActions?.focusSearch();
                  setOpen(false);
                }}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100"
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Search Notes</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">/</kbd>
              </Command.Item>

              <Command.Item
                value="delete-selected-notes"
                onSelect={() => {
                  if (boardActions.selectedNoteIds.size > 0) {
                    boardActions.deleteSelectedNotes();
                  }
                  setOpen(false);
                }}
                disabled={(boardActions.selectedNoteIds?.size || 0) === 0}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Selected</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘⌫</kbd>
              </Command.Item>

              <Command.Item
                value="archive-selected-notes"
                onSelect={() => {
                  boardActions.archiveSelectedNotes();
                  setOpen(false);
                }}
                disabled={(boardActions.selectedNoteIds?.size || 0) === 0}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-100 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
              >
                <Archive className="mr-2 h-4 w-4" />
                <span>Archive Selected</span>
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Settings" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
              value="go-to-settings"
              onSelect={() => {
                router.push("/settings");
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <SettingsIcon className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Command.Item>
            <Command.Item
              value="show-keyboard-shortcuts"
              onSelect={() => {
                const event = new CustomEvent("gumboard:open-shortcuts");
                window.dispatchEvent(event);
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <KeyboardIcon className="mr-2 h-4 w-4" />
              <span>Keyboard Shortcuts</span>
              <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">?</kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Command.Dialog>
    </>
  );
}


