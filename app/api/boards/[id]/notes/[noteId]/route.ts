import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notifySlackForNoteChanges, hasValidContent, updateSlackMessage } from "@/lib/slack"

type IncomingChecklistItem = { id: string; content: string; checked: boolean; order: number }

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
        },
        checklistItems: { orderBy: { order: 'asc' } }
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

    // Snapshot previous state for Slack
    const prevContent = note.content
    const prevItems = note.checklistItems || []

    let createdItems: IncomingChecklistItem[] = []
    let updatedItems: { id: string; content: string; checked: boolean; order: number; previous: { content: string; checked: boolean; order: number; slackMessageId?: string | null } }[] = []
    let deletedItems: IncomingChecklistItem[] = []

    const updatedNote = await db.$transaction(async (tx) => {
      // Update note fields
      const n = await tx.note.update({
        where: { id: noteId },
        data: {
          ...(content !== undefined && { content }),
          ...(color !== undefined && { color }),
          ...(done !== undefined && { done }),
        },
        include: {
          board: true,
          user: { select: { id: true, name: true, email: true } },
          checklistItems: { orderBy: { order: 'asc' } },
        },
      })

      // Reconcile checklist items if provided
      if (Array.isArray(checklistItems)) {
        const existing = await tx.checklistItem.findMany({ where: { noteId }, orderBy: { order: 'asc' } })
        const existingMap = new Map(existing.map((i) => [i.id, i]))
        const incomingMap = new Map((checklistItems as IncomingChecklistItem[]).map((i) => [i.id, i]))

        const toCreate = (checklistItems as IncomingChecklistItem[]).filter((i) => !existingMap.has(i.id))
        const toUpdate = (checklistItems as IncomingChecklistItem[]).filter((i) => {
          const old = existingMap.get(i.id)
          return !!old && (old.content !== i.content || old.checked !== i.checked || old.order !== i.order)
        })
        const toDelete = existing.filter((i) => !incomingMap.has(i.id))

        if (toDelete.length) {
          await tx.checklistItem.deleteMany({ where: { id: { in: toDelete.map((i) => i.id) } } })
        }
        if (toCreate.length) {
          await tx.checklistItem.createMany({
            data: toCreate.map((i) => ({ id: i.id, content: i.content, checked: i.checked, order: i.order, noteId })),
          })
        }
        for (const i of toUpdate) {
          await tx.checklistItem.update({
            where: { id: i.id },
            data: { content: i.content, checked: i.checked, order: i.order },
          })
        }

        createdItems = toCreate
        updatedItems = toUpdate.map((i) => ({ id: i.id, content: i.content, checked: i.checked, order: i.order, previous: { content: existingMap.get(i.id)!.content, checked: existingMap.get(i.id)!.checked, order: existingMap.get(i.id)!.order, slackMessageId: existingMap.get(i.id)!.slackMessageId } }))
        deletedItems = toDelete.map((i) => ({ id: i.id, content: i.content, checked: i.checked, order: i.order }))
      }

      // Get the final note with all relations
      const finalNote = await tx.note.findUnique({
        where: { id: noteId },
        include: { board: true, user: { select: { id: true, name: true, email: true } }, checklistItems: { orderBy: { order: 'asc' } } },
      })

      // Handle Slack notifications within the transaction
      if (user.organization?.slackWebhookUrl) {
        try {
          const res = await notifySlackForNoteChanges({
            webhookUrl: user.organization.slackWebhookUrl,
            boardName: finalNote!.board.name,
            boardId,
            sendSlackUpdates: finalNote!.board.sendSlackUpdates,
            userId: session.user.id,
            userName: user.name || user.email || 'Unknown User',
            prevContent,
            nextContent: content ?? prevContent,
            noteSlackMessageId: note.slackMessageId,
            itemChanges: Array.isArray(checklistItems)
              ? { created: createdItems, updated: updatedItems, deleted: deletedItems }
              : undefined,
          })

          // Update Slack message IDs within the transaction
          if (res.noteMessageId && !note.slackMessageId) {
            await tx.note.update({ where: { id: noteId }, data: { slackMessageId: res.noteMessageId } })
          }
          if (res.itemMessageIds) {
            for (const [itemId, msgId] of Object.entries(res.itemMessageIds)) {
              await tx.checklistItem.update({ where: { id: itemId }, data: { slackMessageId: msgId } })
            }
          }

          // Note done toggle message (optional)
          if (typeof done === 'boolean') {
            const contentForDone = hasValidContent(finalNote!.content)
              ? finalNote!.content
              : finalNote!.checklistItems[0]?.content || 'Note'
            if (hasValidContent(contentForDone)) {
              await updateSlackMessage(user.organization.slackWebhookUrl, contentForDone, done, finalNote!.board.name, user.name || user.email || 'Unknown User')
            }
          }
        } catch (slackError) {
          // Log Slack errors but don't fail the transaction
          console.error('Slack notification failed:', slackError)
          // Continue without failing - the note update is more important than Slack notifications
        }
      }

      return finalNote
    })

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