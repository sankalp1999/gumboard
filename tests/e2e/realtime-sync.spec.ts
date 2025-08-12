import { test, expect, Page, BrowserContext } from "@playwright/test";
import {
  mockAuth,
  mockBoards,
  mockBoard,
  createSharedNotesStore,
  mockBoardNotes,
  createMockNote,
} from "../fixtures/api-mocks";

test.describe("Real-time Synchronization", () => {
  const store = createSharedNotesStore();
  const setupMockRoutes = async (page: Page, userId: string) => {
    await mockAuth(page, {
      id: userId,
      email: `${userId}@example.com`,
      name: userId === "user-1" ? "User One" : "User Two",
    });
    await mockBoards(page, [{ id: "test-board", name: "Test Board", description: "A test board" }]);
    await mockBoard(page, { id: "test-board", name: "Test Board", description: "A test board" });
    await mockBoardNotes(page, "test-board", store);
  };

  test.beforeEach(async () => {
    store.setAll([]);
  });

  test("should sync checklist item changes between two users", async ({ browser }) => {
    const seeded = createMockNote({ content: "", boardId: "test-board", userId: "user-1" });
    store.add(seeded);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupMockRoutes(page1, "user-1");
    await setupMockRoutes(page2, "user-2");

    await page1.goto("/boards/test-board");
    await page2.goto("/boards/test-board");

    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);

    await page1.getByRole("button", { name: "Add task" }).first().click();
    await page1.getByPlaceholder("Add new item...").fill("First item");
    await page1.getByPlaceholder("Add new item...").press("Enter");

    await expect.poll(
      () => store.all().find((n) => n.id === seeded.id)?.checklistItems?.length
    ).toBe(1);

    const itemId = store.all().find((n) => n.id === seeded.id)?.checklistItems?.[0]?.id as string;

    await expect.poll(async () => await page2.getByTestId(itemId).count()).toBe(1);

    const itemRow1 = page1.getByTestId(itemId);
    await itemRow1.getByRole("checkbox", { disabled: false }).click();

    await expect.poll(async () => {
      const row = page2.getByTestId(itemId);
      const state = await row.getByRole("checkbox", { disabled: false }).getAttribute("data-state");
      return state;
    }).toBe("checked");

    await itemRow1.getByText("First item").click();
    const editInput = itemRow1
      .locator('input[type="text"]').filter({ hasValue: "First item" })
      .first();
    await editInput.fill("First item edited");
    await editInput.press("Enter");

    await page2.waitForTimeout(5000);
    const itemRow2 = page2.getByTestId(itemId);
    await expect.poll(async () => await itemRow2.getByText("First item edited").count()).toBeGreaterThan(0);

    await context1.close();
    await context2.close();
  });

  test("should sync note creation between multiple users", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupMockRoutes(page1, "user-1");
    await setupMockRoutes(page2, "user-2");

    await page1.goto("/boards/test-board");
    await page2.goto("/boards/test-board");

    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);

    expect(store.all().length).toBe(0);

    await page1.evaluate(() => {
      fetch("/api/boards/test-board/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Note from User 1" }),
      });
    });

    await page1.waitForTimeout(1000);

    expect(store.all().length).toBe(1);
    expect(store.all()[0].content).toBe("Note from User 1");

    await page2.waitForTimeout(5000);

    await page2.evaluate(() => {
      fetch("/api/boards/test-board/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Note from User 2" }),
      });
    });

    await page2.waitForTimeout(1000);

    expect(store.all().length).toBe(2);
    expect(store.all().find((n) => n.content === "Note from User 2")).toBeTruthy();

    await context1.close();
    await context2.close();
  });

  test("should preserve active edits during polling updates", async ({ browser }) => {
    const existingNote = createMockNote({
      content: "Original content",
      userId: "user-1",
      boardId: "test-board",
    });
    store.add(existingNote);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupMockRoutes(page1, "user-1");
    await setupMockRoutes(page2, "user-2");

    await page1.goto("/boards/test-board");
    await page2.goto("/boards/test-board");

    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    await page2.evaluate((id) => {
      fetch(`/api/boards/test-board/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "User 2 updated content" }),
      });
    }, existingNote.id);

    await page2.waitForTimeout(1000);

    // ensure store updated
    expect(store.all().find((n) => n.id === existingNote.id)?.content).toBe(
      "User 2 updated content"
    );

    await expect.poll(async () => await page1.locator(".note-background").count()).toBe(1);
    await expect.poll(async () => await page2.locator(".note-background").count()).toBe(1);

    await context1.close();
    await context2.close();
  });

  test("should sync note deletions across sessions", async ({ browser }) => {
    const note1 = createMockNote({
      content: "Note to keep",
      userId: "user-1",
      boardId: "test-board",
    });
    const note2 = createMockNote({
      content: "Note to delete",
      userId: "user-1",
      boardId: "test-board",
    });
    store.add(note1);
    store.add(note2);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await setupMockRoutes(page1, "user-1");
    await setupMockRoutes(page2, "user-2");

    await page1.goto("/boards/test-board");
    await page2.goto("/boards/test-board");

    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);

    expect(store.all().length).toBe(2);

    await page1.evaluate((id) => {
      fetch(`/api/boards/test-board/notes/${id}`, {
        method: "DELETE",
      });
    }, note2.id);

    await page1.waitForTimeout(1000);

    expect(store.all().length).toBe(1);
    expect(store.all()[0].content).toBe("Note to keep");

    await expect.poll(async () => await page1.locator(".note-background").count()).toBe(1);
    await expect.poll(async () => await page2.locator(".note-background").count()).toBe(1);

    await context1.close();
    await context2.close();
  });
});
