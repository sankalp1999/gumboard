export interface ChecklistItem {
  id: string
  content: string
  checked: boolean
  order: number
}

export interface ChecklistChanges {
  added: ChecklistItem[]
  completed: ChecklistItem[]
  reopened: ChecklistItem[]
  edited: Array<{ before: ChecklistItem; after: ChecklistItem }>
  deleted: ChecklistItem[]
}

function normalizeContent(text: string): string {
  return (text || '').trim()
}

/**
 * Compute a robust diff between two checklist arrays using stable ids when present.
 * Falls back to suppressing changes for items lacking ids to avoid spammy false positives.
 */
export function diffChecklistItems(
  oldItemsInput: ChecklistItem[] = [],
  newItemsInput: ChecklistItem[] = []
): ChecklistChanges {
  const oldItems = Array.isArray(oldItemsInput) ? oldItemsInput : []
  const newItems = Array.isArray(newItemsInput) ? newItemsInput : []

  const oldById = new Map<string, ChecklistItem>()
  for (const it of oldItems) {
    if (it?.id) oldById.set(it.id, it)
  }

  const newById = new Map<string, ChecklistItem>()
  for (const it of newItems) {
    if (it?.id) newById.set(it.id, it)
  }

  const added: ChecklistItem[] = []
  const completed: ChecklistItem[] = []
  const reopened: ChecklistItem[] = []
  const edited: Array<{ before: ChecklistItem; after: ChecklistItem }> = []
  const deleted: ChecklistItem[] = []

  // Identify added and state changes by id
  for (const [id, after] of newById.entries()) {
    const before = oldById.get(id)
    if (!before) {
      // Only consider as added when id is present and new
      added.push(after)
      continue
    }

    if (!before.checked && after.checked) {
      completed.push(after)
    } else if (before.checked && !after.checked) {
      reopened.push(after)
    }

    if (normalizeContent(before.content) !== normalizeContent(after.content)) {
      edited.push({ before, after })
    }
  }

  // Identify deletions by id
  for (const [id, before] of oldById.entries()) {
    if (!newById.has(id)) {
      deleted.push(before)
    }
  }

  return { added, completed, reopened, edited, deleted }
}


