"use client";

import * as React from "react";
import { useEffect } from "react";
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global Command Menu"
      className="fixed inset-0 z-50 bg-black/50"
    >
      <div className="mx-auto max-w-2xl mt-20 bg-white dark:bg-zinc-900 rounded-lg shadow-2xl border border-border dark:border-zinc-800">
        <div className="flex items-center px-4 py-3 border-b border-border dark:border-zinc-800">
          <SearchIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <Command.Input
            placeholder="Type a command or search..."
            className="w-full bg-transparent outline-none text-sm"
          />
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty>No results found.</Command.Empty>

          <Command.Group heading="Create">
            <Command.Item
              onSelect={() => {
                boardActions?.createChecklistNote();
                setOpen(false);
              }}
            >
              <CheckSquare className="mr-2 h-4 w-4" />
              New Checklist Note
              <kbd className="ml-auto text-xs">⌘↵</kbd>
            </Command.Item>

            <Command.Item
              onSelect={() => {
                boardActions?.createTextNote();
                setOpen(false);
              }}
            >
              <StickyNote className="mr-2 h-4 w-4" />
              New Text Note
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Navigate">
            <Command.Item
              onSelect={() => {
                router.push("/dashboard");
                setOpen(false);
              }}
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Command.Item>

            <Command.Item
              onSelect={() => {
                router.push("/boards/all-notes");
                setOpen(false);
              }}
            >
              <Grid3x3 className="mr-2 h-4 w-4" />
              All Notes
            </Command.Item>

            <Command.Item
              onSelect={() => {
                router.push("/boards/archive");
                setOpen(false);
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Command.Item>
          </Command.Group>

          {boards?.length > 0 && (
            <Command.Group heading="Boards">
              {boards.map((board, index) => (
                <Command.Item
                  key={board.id}
                  onSelect={() => {
                    router.push(`/boards/${board.id}`);
                    setOpen(false);
                  }}
                >
                  <Folder className="mr-2 h-4 w-4" />
                  {board.name}
                  {index < 9 && (
                    <kbd className="ml-auto text-xs">⌘{index + 1}</kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {boardActions?.currentBoard && (
            <Command.Group heading="Current Board">
              <Command.Item
                onSelect={() => {
                  boardActions?.focusSearch();
                  setOpen(false);
                }}
              >
                <SearchIcon className="mr-2 h-4 w-4" />
                Search Notes
                <kbd className="ml-auto text-xs">/</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  if (boardActions.selectedNoteIds.size > 0) {
                    boardActions.deleteSelectedNotes();
                  }
                  setOpen(false);
                }}
                disabled={(boardActions.selectedNoteIds?.size || 0) === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
                <kbd className="ml-auto text-xs">⌘⌫</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  boardActions.archiveSelectedNotes();
                  setOpen(false);
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                Archive Selected
              </Command.Item>
            </Command.Group>
          )}

          <Command.Group heading="Settings">
            <Command.Item
              onSelect={() => {
                router.push("/settings");
                setOpen(false);
              }}
            >
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </Command.Item>
            <Command.Item
              onSelect={() => {
                const event = new CustomEvent("gumboard:open-shortcuts");
                window.dispatchEvent(event);
                setOpen(false);
              }}
            >
              <KeyboardIcon className="mr-2 h-4 w-4" />
              Keyboard Shortcuts
              <kbd className="ml-auto text-xs">?</kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}


