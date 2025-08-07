import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { updateSlackMessage, formatNoteForSlack, sendSlackMessage, hasValidContent, shouldSendNotification, sendChecklistSummaryMessage } from "@/lib/slack"
import { diffChecklistItems } from "@/lib/checklist"

interface ChecklistItem {
  id: string
  content: string
  checked: boolean
  order: number
}

// Helper function to detect checklist item changes
function detectChecklistChanges(oldItems: ChecklistItem[] = [], newItems: ChecklistItem[] = []) {
  const addedItems: ChecklistItem[] = []
  const completedItems: ChecklistItem[] = []
  
  // Create map for efficient lookup
  const oldItemsMap = new Map(oldItems.map(item => [item.id, item]))
  
  // Find newly added items
  for (const newItem of newItems) {
    if (!oldItemsMap.has(newItem.id)) {
      addedItems.push(newItem)
    }
  }
  
  // Find newly completed items
  for (const newItem of newItems) {
    const oldItem = oldItemsMap.get(newItem.id)
    if (oldItem && !oldItem.checked && newItem.checked) {
      completedItems.push(newItem)
    }
  }
  
  return { addedItems, completedItems }
}

// Update a note
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { content, color, done, checklistItems } = await request.json()
    const { id: boardId, noteId } = await params

    // Verify user has access to this board (same organization)
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { 
        organization: {
          select: {
            id: true,
            name: true,
            slackWebhookUrl: true
          }
        }
      }
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 })
    }

    // Verify the note belongs to a board in the user's organization
    const note = await db.note.findUnique({
      where: { id: noteId },
      include: { 
        board: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    // Check if note is soft-deleted
    if (note.deletedAt) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    if (note.board.organizationId !== user.organizationId || note.boardId !== boardId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Check if user is the author of the note or an admin
    if (note.createdBy !== session.user.id && !user.isAdmin) {
      return NextResponse.json({ error: "Only the note author or admin can edit this note" }, { status: 403 })
    }

    const updatedNote = await db.note.update({
      where: { id: noteId },
      data: {
        ...(content !== undefined && { content }),
        ...(color !== undefined && { color }),
        ...(done !== undefined && { done }),
        ...(checklistItems !== undefined && { checklistItems }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        board: {
          select: {
            name: true,
            sendSlackUpdates: true
          }
        }
      }
    })

    // Send a single batched Slack summary if checklist items changed
    if (checklistItems !== undefined && user.organization?.slackWebhookUrl) {
      const oldItems = (note.checklistItems as unknown as ChecklistItem[]) || []
      const newItems = (checklistItems as unknown as ChecklistItem[]) || []
      const changes = diffChecklistItems(oldItems, newItems)

      const userName = user.name || user.email || 'Unknown User'
      const boardName = updatedNote.board.name

      const summary = {
        added: changes.added.map(i => i.content).filter(hasValidContent),
        completed: changes.completed.map(i => i.content).filter(Boolean),
        reopened: changes.reopened.map(i => i.content).filter(Boolean),
        edited: changes.edited
          .filter(e => hasValidContent(e.before.content) || hasValidContent(e.after.content))
          .map(e => ({ before: e.before.content, after: e.after.content })),
        deleted: changes.deleted.map(i => i.content).filter(Boolean),
      }

      const hasAnySummary =
        summary.added.length || summary.completed.length || summary.reopened.length || summary.edited.length || summary.deleted.length

      if (hasAnySummary && shouldSendNotification(session.user.id, boardId, boardName, note.board.sendSlackUpdates)) {
        await sendChecklistSummaryMessage(
          user.organization.slackWebhookUrl,
          boardName,
          userName,
          summary
        )
      }
    }

    // Send Slack notification if content is being added to a previously empty note
    if (content !== undefined && user.organization?.slackWebhookUrl && !note.slackMessageId) {
      const wasEmpty = !hasValidContent(note.content)
      const hasContent = hasValidContent(content)
      
      if (wasEmpty && hasContent && shouldSendNotification(session.user.id, boardId, updatedNote.board.name, note.board.sendSlackUpdates)) {
        const slackMessage = formatNoteForSlack(updatedNote, updatedNote.board.name, user.name || user.email || 'Unknown User')
        const messageId = await sendSlackMessage(user.organization.slackWebhookUrl, {
          text: slackMessage,
          username: 'Gumboard',
          icon_emoji: ':clipboard:'
        })

        if (messageId) {
          await db.note.update({
            where: { id: noteId },
            data: { slackMessageId: messageId }
          })
        }
      }
    }

    // Update existing Slack message when done status changes
    if (done !== undefined && user.organization?.slackWebhookUrl && note.slackMessageId) {
      const userName = note.user?.name || note.user?.email || 'Unknown User'
      const boardName = note.board.name
      await updateSlackMessage(user.organization.slackWebhookUrl, note.content, done, boardName, userName)
    }

    return NextResponse.json({ note: updatedNote })
  } catch (error) {
    console.error("Error updating note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Delete a note (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: boardId, noteId } = await params

    // Verify user has access to this board (same organization)
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true }
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 })
    }

    // Verify the note belongs to a board in the user's organization
    const note = await db.note.findUnique({
      where: { id: noteId },
      include: { board: true }
    })

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    // Check if note is already soft-deleted
    if (note.deletedAt) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    if (note.board.organizationId !== user.organizationId || note.boardId !== boardId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Check if user is the author of the note or an admin
    if (note.createdBy !== session.user.id && !user.isAdmin) {
      return NextResponse.json({ error: "Only the note author or admin can delete this note" }, { status: 403 })
    }

    // Soft delete: set deletedAt timestamp instead of actually deleting
    await db.note.update({
      where: { id: noteId },
      data: {
        deletedAt: new Date()
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting note:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}                                                                