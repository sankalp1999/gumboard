import { diffChecklistItems, type ChecklistItem } from '../checklist'

describe('diffChecklistItems', () => {
  const base = (overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
    id: 'id-1',
    content: 'Task',
    checked: false,
    order: 0,
    ...overrides,
  })

  it('detects added items', () => {
    const oldItems: ChecklistItem[] = []
    const newItems: ChecklistItem[] = [base({ id: 'a', content: 'New' })]
    const diff = diffChecklistItems(oldItems, newItems)
    expect(diff.added.map(i => i.id)).toEqual(['a'])
  })

  it('detects completed and reopened', () => {
    const oldItems: ChecklistItem[] = [
      base({ id: 'a', content: 'One', checked: false }),
      base({ id: 'b', content: 'Two', checked: true }),
    ]
    const newItems: ChecklistItem[] = [
      base({ id: 'a', content: 'One', checked: true }),
      base({ id: 'b', content: 'Two', checked: false }),
    ]
    const diff = diffChecklistItems(oldItems, newItems)
    expect(diff.completed.map(i => i.id)).toEqual(['a'])
    expect(diff.reopened.map(i => i.id)).toEqual(['b'])
  })

  it('detects edited content (trim-insensitive)', () => {
    const oldItems: ChecklistItem[] = [base({ id: 'a', content: 'Hello' })]
    const newItems: ChecklistItem[] = [base({ id: 'a', content: 'Hello world' })]
    const diff = diffChecklistItems(oldItems, newItems)
    expect(diff.edited).toHaveLength(1)
    expect(diff.edited[0].before.content).toBe('Hello')
    expect(diff.edited[0].after.content).toBe('Hello world')
  })

  it('detects deleted items', () => {
    const oldItems: ChecklistItem[] = [base({ id: 'a' })]
    const newItems: ChecklistItem[] = []
    const diff = diffChecklistItems(oldItems, newItems)
    expect(diff.deleted.map(i => i.id)).toEqual(['a'])
  })
})


