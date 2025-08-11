"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openPalette: () => void;
  closePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null
);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) return { open: false, setOpen: () => {}, openPalette: () => {}, closePalette: () => {} } as CommandPaletteContextValue;
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen, openPalette, closePalette }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}


