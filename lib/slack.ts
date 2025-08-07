interface SlackMessage {
  text: string
  username?: string
  icon_emoji?: string
}

export function hasValidContent(content: string | null | undefined): boolean {
  if (!content) {
    console.log(`[Slack] hasValidContent check: "${content}" -> false (null/undefined)`)
    return false
  }
  
  const trimmed = content.trim()
  
  if (trimmed.length === 0) {
    console.log(`[Slack] hasValidContent check: "${content}" -> false (empty after trim)`)
    return false
  }
  
  const hasSubstantiveContent = /[a-zA-Z0-9\u00C0-\u017F\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(trimmed)
  
  if (!hasSubstantiveContent) {
    console.log(`[Slack] hasValidContent check: "${content}" -> false (no substantive content)`)
    return false
  }
  
  console.log(`[Slack] hasValidContent check: "${content}" -> true`)
  return true
}

const notificationDebounce = new Map<string, number>()
const DEBOUNCE_DURATION = 1000

export function shouldSendNotification(userId: string, boardId: string, boardName: string, sendSlackUpdates: boolean = true): boolean {
  if (boardName.startsWith("Test")) {
    console.log(`[Slack] Skipping notification for test board: ${boardName}`)
    return false
  }
  
  if (!sendSlackUpdates) {
    console.log(`[Slack] Skipping notification for board with disabled Slack updates: ${boardName}`)
    return false
  }
  
  const key = `${userId}-${boardId}`
  const now = Date.now()
  const lastNotification = notificationDebounce.get(key)
  
  if (lastNotification && now - lastNotification < DEBOUNCE_DURATION) {
    console.log(`[Slack] Debounced notification for ${key} (${now - lastNotification}ms ago)`)
    return false
  }
  
  notificationDebounce.set(key, now)
  console.log(`[Slack] Allowing notification for ${key}`)
  return true
}

export async function sendSlackMessage(webhookUrl: string, message: SlackMessage): Promise<string | null> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      console.error('Failed to send Slack message:', response.statusText)
      return null
    }

    return Date.now().toString()
  } catch (error) {
    console.error('Error sending Slack message:', error)
    return null
  }
}

export async function updateSlackMessage(webhookUrl: string, originalText: string, completed: boolean, boardName: string, userName: string): Promise<void> {
  try {
    // Incoming webhooks cannot update existing messages; we post a new summary-style message instead.
    const updatedText = completed 
      ? `:white_check_mark: ${originalText} by ${userName} in ${boardName}`
      : `:heavy_plus_sign: ${originalText} by ${userName} in ${boardName}`
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: updatedText,
        username: 'Gumboard',
        icon_emoji: ':clipboard:'
      }),
    })
  } catch (error) {
    console.error('Error updating Slack message:', error)
  }
}

export function formatNoteForSlack(note: { content: string }, boardName: string, userName: string): string {
  return `:heavy_plus_sign: ${note.content} by ${userName} in ${boardName}`
}

export function formatTodoForSlack(todoContent: string, boardName: string, userName: string, action: 'added' | 'completed'): string {
  if (action === 'completed') {
    return `:white_check_mark: ${todoContent} by ${userName} in ${boardName}`
  }
  return `:heavy_plus_sign: ${todoContent} by ${userName} in ${boardName}`
}

export async function sendTodoNotification(webhookUrl: string, todoContent: string, boardName: string, userName: string, action: 'added' | 'completed'): Promise<string | null> {
  const message = formatTodoForSlack(todoContent, boardName, userName, action)
  return await sendSlackMessage(webhookUrl, {
    text: message,
    username: 'Gumboard',
    icon_emoji: ':clipboard:'
  })
}

export function formatChecklistSummary(
  boardName: string,
  userName: string,
  summary: {
    added: string[]
    completed: string[]
    reopened: string[]
    edited: Array<{ before: string; after: string }>
    deleted: string[]
  }
): string {
  const lines: string[] = []
  const bullets: string[] = []

  if (summary.added.length) {
    for (const t of summary.added) bullets.push(`:heavy_plus_sign: ${t}`)
  }
  if (summary.completed.length) {
    for (const t of summary.completed) bullets.push(`:white_check_mark: ${t}`)
  }
  if (summary.reopened.length) {
    for (const t of summary.reopened) bullets.push(`:arrow_backward: ${t}`)
  }
  if (summary.edited.length) {
    for (const e of summary.edited) bullets.push(`:pencil2: ${e.before} → ${e.after}`)
  }
  if (summary.deleted.length) {
    for (const t of summary.deleted) bullets.push(`:wastebasket: ${t}`)
  }

  if (bullets.length === 0) {
    return ''
  }

  const maxItems = 6
  const displayed = bullets.slice(0, maxItems)
  const remaining = bullets.length - displayed.length

  lines.push(`Checklist updates by ${userName} in ${boardName}`)
  lines.push(...displayed.map(b => `• ${b}`))
  if (remaining > 0) {
    lines.push(`…and ${remaining} more`)
  }

  return lines.join('\n')
}

export async function sendChecklistSummaryMessage(
  webhookUrl: string,
  boardName: string,
  userName: string,
  summary: {
    added: string[]
    completed: string[]
    reopened: string[]
    edited: Array<{ before: string; after: string }>
    deleted: string[]
  }
): Promise<string | null> {
  const text = formatChecklistSummary(boardName, userName, summary)
  if (!text) return null
  return await sendSlackMessage(webhookUrl, {
    text,
    username: 'Gumboard',
    icon_emoji: ':clipboard:'
  })
}
