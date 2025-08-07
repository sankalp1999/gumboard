import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import crypto from "crypto"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ChecklistItemShape {
  id: string
  content: string
  checked: boolean
  order: number
}

export interface NoteContentShape {
  content?: string
  isChecklist?: boolean
  checklistItems?: ChecklistItemShape[]
}

export function normalizeNoteContent(input: NoteContentShape) {
  const normalized: Required<Pick<NoteContentShape, "content" | "isChecklist" | "checklistItems">> = {
    content: (input.content ?? "").replace(/\r\n?/g, "\n").trim(),
    isChecklist: Boolean(input.isChecklist),
    checklistItems: Array.isArray(input.checklistItems) ? input.checklistItems.map(item => ({
      id: String(item.id),
      content: (item.content ?? "").replace(/\r\n?/g, "\n").trim(),
      checked: Boolean(item.checked),
      order: Number.isFinite(item.order) ? item.order : 0
    })) : []
  }

  // Sort checklist items by order then content for stability
  normalized.checklistItems.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.content.localeCompare(b.content)
  })

  return normalized
}

export function computeNoteContentHash(input: NoteContentShape) {
  const normalized = normalizeNoteContent(input)
  const payload = {
    content: normalized.content,
    isChecklist: normalized.isChecklist,
    checklistItems: normalized.checklistItems.map(i => ({ content: i.content, checked: i.checked, order: i.order }))
  }
  const json = JSON.stringify(payload)
  return crypto.createHash("sha256").update(json).digest("hex")
}

export function deepEqualChecklistItems(a?: ChecklistItemShape[], b?: ChecklistItemShape[]) {
  const normA = normalizeNoteContent({ checklistItems: a, isChecklist: true, content: "" }).checklistItems
  const normB = normalizeNoteContent({ checklistItems: b, isChecklist: true, content: "" }).checklistItems
  if (normA.length !== normB.length) return false
  for (let i = 0; i < normA.length; i++) {
    const ia = normA[i]
    const ib = normB[i]
    if (ia.content !== ib.content || ia.checked !== ib.checked || ia.order !== ib.order) return false
  }
  return true
}
