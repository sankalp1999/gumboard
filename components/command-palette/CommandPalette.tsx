"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { useCommandPalette } from "@/context/CommandPaletteContext";
import { useBoardActions } from "@/context/BoardActionsContext";
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

export function CommandPalette({ boards }: { boards: SimpleBoard[] }) {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const boardActions = useBoardActions();

  useHotkeys(["cmd+k", "ctrl+k"], (e) => {
    e.preventDefault();
    setOpen(true);
  });

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global Command Menu"
      className="fixed inset-0 z-50 bg-black/50"
    >
      <div className="mx-auto max-w-2xl mt-20 bg-background rounded-lg shadow-2xl border border-border">
        <div className="sr-only" id="command-palette-title">
          Command Palette
        </div>
        <div className="flex items-center px-4 py-3 border-b border-border">
          <SearchIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <Command.Input
            placeholder="Type a command or search..."
            className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
              onSelect={() => {
                boardActions?.createChecklistNote();
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              <span>New Checklist Note</span>
              <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘↵</kbd>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                boardActions?.createTextNote();
                setOpen(false);
              }}
              className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <StickyNote className="mr-2 h-4 w-4" />
              <span>New Text Note</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
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
                  onSelect={() => {
                    router.push(`/boards/${board.id}`);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
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

          {boardActions?.currentBoard && (
            <Command.Group heading="Current Board" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
              <Command.Item
                onSelect={() => {
                  boardActions?.focusSearch();
                  setOpen(false);
                }}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                <span>Search Notes</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">/</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  if (boardActions.selectedNoteIds.size > 0) {
                    boardActions.deleteSelectedNotes();
                  }
                  setOpen(false);
                }}
                disabled={(boardActions.selectedNoteIds?.size || 0) === 0}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Selected</span>
                <kbd className="ml-auto px-1.5 py-0.5 bg-muted rounded text-xs font-mono">⌘⌫</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  boardActions.archiveSelectedNotes();
                  setOpen(false);
                }}
                disabled={(boardActions.selectedNoteIds?.size || 0) === 0}
                className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
              >
                <Archive className="mr-2 h-4 w-4" />
                <span>Archive Selected</span>
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Settings" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
            <Command.Item
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
      </div>
    </Command.Dialog>
  );
}


