import { test, expect } from "../fixtures/test-helpers";
import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { TestContext } from "../fixtures/test-helpers";

test.describe("Real-time Synchronization (DB-backed)", () => {
  async function createSecondUserSession(testPrisma: PrismaClient, testContext: TestContext) {
    const secondUserId = `usr2_${testContext.testId}`;
    const secondEmail = `user2-${testContext.testId}@example.com`;
    const secondSessionToken = `sess_${testContext.testId}_${randomBytes(16).toString("hex")}`;

    await testPrisma.user.create({
      data: {
        id: secondUserId,
        email: secondEmail,
        name: `User Two ${testContext.testId}`,
        organizationId: testContext.organizationId,
      },
    });

    await testPrisma.session.create({
      data: {
        sessionToken: secondSessionToken,
        userId: secondUserId,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return { secondUserId, secondSessionToken } as const;
  }

  test("should sync checklist item changes between two users and persist in DB", async ({
    authenticatedPage,
    testContext,
    testPrisma,
    browser,
  }) => {
    const board = await testPrisma.board.create({
      data: {
        name: testContext.getBoardName("Realtime Board"),
        description: testContext.prefix("A test board for realtime"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const note = await testPrisma.note.create({
      data: {
        content: "",
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    const { secondSessionToken } = await createSecondUserSession(testPrisma, testContext);
    const context2 = await browser.newContext();
    await context2.addCookies([
      {
        name: "authjs.session-token",
        value: secondSessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page2 = await context2.newPage();

    await authenticatedPage.goto(`/boards/${board.id}`);
    await page2.goto(`/boards/${board.id}`);

    // Add a checklist item on page 1
    await authenticatedPage.getByRole("button", { name: "Add task" }).first().click();
    const itemContent = testContext.prefix("First item");
    const addItemResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/${note.id}`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await authenticatedPage.getByPlaceholder("Add new item...").fill(itemContent);
    await authenticatedPage.getByPlaceholder("Add new item...").press("Enter");
    await addItemResponse;

    // DB should have one checklist item
    const updatedNoteAfterAdd = await testPrisma.note.findUnique({
      where: { id: note.id },
      include: { checklistItems: true },
    });
    expect(updatedNoteAfterAdd?.checklistItems).toHaveLength(1);
    const createdItem = updatedNoteAfterAdd!.checklistItems[0];
    expect(createdItem.content).toBe(itemContent);

    // Page 2 should reflect the item after polling
    await expect
      .poll(async () => await page2.getByTestId(createdItem.id).count())
      .toBe(1);

    // Toggle completion on page 1 and verify DB + page 2
    await authenticatedPage.getByTestId(createdItem.id).getByRole("checkbox", { disabled: false }).click();

    const toggledInDb = await testPrisma.checklistItem.findUnique({ where: { id: createdItem.id } });
    expect(toggledInDb?.checked).toBe(true);

    await expect
      .poll(async () =>
        page2
          .getByTestId(createdItem.id)
          .getByRole("checkbox", { disabled: false })
          .getAttribute("data-state")
      )
      .toBe("checked");

    // Edit content on page 1 and verify DB + page 2
    await authenticatedPage.getByTestId(createdItem.id).getByText(itemContent).click();
    const editInput = authenticatedPage.getByTestId(createdItem.id).getByRole("textbox").first();
    const editedContent = testContext.prefix("First item edited");
    const saveEditResponse = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/${note.id}`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await editInput.fill(editedContent);
    await authenticatedPage.click("body");
    await saveEditResponse;

    const updatedItemDb = await testPrisma.checklistItem.findUnique({ where: { id: createdItem.id } });
    expect(updatedItemDb?.content).toBe(editedContent);

    await expect
      .poll(async () => await page2.getByTestId(createdItem.id).getByText(editedContent).count())
      .toBeGreaterThan(0);

    await context2.close();
  });

  test("should sync note creation between multiple users and persist in DB", async ({
    authenticatedPage,
    testContext,
    testPrisma,
    browser,
  }) => {
    const board = await testPrisma.board.create({
      data: {
        name: testContext.getBoardName("Realtime Board Notes"),
        description: testContext.prefix("Realtime notes board"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const { secondSessionToken } = await createSecondUserSession(testPrisma, testContext);
    const context2 = await browser.newContext();
    await context2.addCookies([
      {
        name: "authjs.session-token",
        value: secondSessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page2 = await context2.newPage();

    await authenticatedPage.goto(`/boards/${board.id}`);
    await page2.goto(`/boards/${board.id}`);

    // Create first note from user1
    const createNoteResp1 = authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );
    await authenticatedPage.getByRole("button", { name: "Add Your First Note" }).click();
    await createNoteResp1;

    const notesAfterFirst = await testPrisma.note.findMany({ where: { boardId: board.id } });
    expect(notesAfterFirst).toHaveLength(1);

    // Create second note from user2
    const createNoteResp2 = page2.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes`) &&
        resp.request().method() === "POST" &&
        resp.status() === 201
    );
    await page2.getByRole("button", { name: "Add Note" }).click();
    await createNoteResp2;

    const notesAfterSecond = await testPrisma.note.findMany({ where: { boardId: board.id } });
    expect(notesAfterSecond).toHaveLength(2);

    // Page1 should observe the new note after polling
    await expect
      .poll(async () => await authenticatedPage.locator(".note-background").count())
      .toBe(2);

    await context2.close();
  });

  test("should preserve active edits during polling and keep DB consistent", async ({
    authenticatedPage,
    testContext,
    testPrisma,
    browser,
  }) => {
    const board = await testPrisma.board.create({
      data: {
        name: testContext.getBoardName("Realtime Preserve"),
        description: testContext.prefix("Preserve edits board"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const note = await testPrisma.note.create({
      data: {
        content: "Original content",
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    const { secondSessionToken } = await createSecondUserSession(testPrisma, testContext);
    const context2 = await browser.newContext();
    await context2.addCookies([
      {
        name: "authjs.session-token",
        value: secondSessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page2 = await context2.newPage();

    await authenticatedPage.goto(`/boards/${board.id}`);
    await page2.goto(`/boards/${board.id}`);

    // Start editing locally on page1
    await authenticatedPage.getByText("Original content").click();
    const editArea = authenticatedPage.locator("textarea").first();
    await expect(editArea).toBeVisible();
    await editArea.fill("Local editing draft");

    // Update content from page2 via API (simulating another user's change)
    const putResp = page2.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/${note.id}`) &&
        resp.request().method() === "PUT" &&
        resp.ok()
    );
    await page2.evaluate(({ boardId, id }) => {
      return fetch(`/api/boards/${boardId}/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "User 2 updated content" }),
      });
    }, { boardId: board.id, id: note.id });
    await putResp;

    // DB should reflect user2's update
    const dbNote = await testPrisma.note.findUnique({ where: { id: note.id } });
    expect(dbNote?.content).toBe("User 2 updated content");

    // While editing, page1 should still show the local draft
    await expect(editArea).toHaveValue("Local editing draft");

    await context2.close();
  });

  test("should sync note deletions across sessions and soft-delete in DB", async ({
    authenticatedPage,
    testContext,
    testPrisma,
    browser,
  }) => {
    const board = await testPrisma.board.create({
      data: {
        name: testContext.getBoardName("Realtime Delete"),
        description: testContext.prefix("Deletion board"),
        createdBy: testContext.userId,
        organizationId: testContext.organizationId,
      },
    });

    const keepNote = await testPrisma.note.create({
      data: {
        content: testContext.prefix("Note to keep"),
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });
    const deleteNote = await testPrisma.note.create({
      data: {
        content: testContext.prefix("Note to delete"),
        color: "#fef3c7",
        boardId: board.id,
        createdBy: testContext.userId,
      },
    });

    const { secondSessionToken } = await createSecondUserSession(testPrisma, testContext);
    const context2 = await browser.newContext();
    await context2.addCookies([
      {
        name: "authjs.session-token",
        value: secondSessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page2 = await context2.newPage();

    await authenticatedPage.goto(`/boards/${board.id}`);
    await page2.goto(`/boards/${board.id}`);

    // Hover to reveal delete button and delete on page1
    await authenticatedPage.locator(`text=${deleteNote.content}`).hover();
    const deleteButton = authenticatedPage.getByRole("button", { name: `Delete Note ${deleteNote.id}`, exact: true });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // The UI waits ~4s before issuing DELETE; wait for the DELETE to occur
    await authenticatedPage.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/boards/${board.id}/notes/${deleteNote.id}`) &&
        resp.request().method() === "DELETE",
      { timeout: 7000 }
    );

    const softDeleted = await testPrisma.note.findUnique({ where: { id: deleteNote.id } });
    expect(softDeleted?.deletedAt).toBeTruthy();

    const keepNoteDb = await testPrisma.note.findUnique({ where: { id: keepNote.id } });
    expect(keepNoteDb?.deletedAt).toBeNull();

    // After polling, both sessions should show only one note
    await expect
      .poll(async () => await authenticatedPage.locator(".note-background").count())
      .toBe(1);
    await expect
      .poll(async () => await page2.locator(".note-background").count())
      .toBe(1);

    await context2.close();
  });
});
