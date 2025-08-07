import { cn, normalizeNoteContent, computeNoteContentHash, deepEqualChecklistItems } from '../utils'

describe('cn utility function', () => {
  it('should combine class names correctly', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('should handle conditional classes', () => {
    const result = cn('base', true && 'conditional', false && 'hidden')
    expect(result).toBe('base conditional')
  })

  it('should merge conflicting Tailwind classes', () => {
    const result = cn('p-4', 'p-2')
    expect(result).toBe('p-2')
  })

  it('should handle empty inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('should handle undefined and null values', () => {
    const result = cn('base', undefined, null, 'end')
    expect(result).toBe('base end')
  })
})

describe('note normalization and hashing', () => {
  it('normalizes content and checklist consistently', () => {
    const a = normalizeNoteContent({
      content: ' Hello\r\nworld  ',
      isChecklist: true,
      checklistItems: [
        { id: '2', content: 'b', checked: true, order: 2 },
        { id: '1', content: 'a', checked: false, order: 1 }
      ]
    })
    const b = normalizeNoteContent({
      content: 'Hello\nworld',
      isChecklist: 1 as any,
      checklistItems: [
        { id: 1 as any, content: 'a ', checked: 0 as any, order: 1 },
        { id: 2 as any, content: ' b', checked: true, order: 2 }
      ]
    })
    expect(a).toEqual(b)
  })

  it('produces stable hash for semantically equal content', () => {
    const h1 = computeNoteContentHash({
      content: 'A\r\nB',
      isChecklist: false,
      checklistItems: []
    })
    const h2 = computeNoteContentHash({
      content: 'A\nB\n',
      isChecklist: false,
      checklistItems: []
    })
    expect(h1).toBe(h2)
  })

  it('deepEqualChecklistItems compares by normalized shape', () => {
    const a = [
      { id: 'x', content: ' Task', checked: false, order: 1 },
      { id: 'y', content: 'Done', checked: true, order: 2 }
    ]
    const b = [
      { id: 'x', content: 'Task ', checked: 0 as any, order: 1 },
      { id: 'y', content: 'Done', checked: true, order: 2 }
    ]
    expect(deepEqualChecklistItems(a, b)).toBe(true)
  })
})
