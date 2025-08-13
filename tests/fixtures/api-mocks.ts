import { Page } from "@playwright/test";

export interface UserMock {
  id: string;
  email?: string;
  name?: string;
  organizationId?: string;
  isAdmin?: boolean;
}

export interface BoardMock {
  id: string;
  name: string;
  description?: string;
}

export async function mockAuth(page: Page, user: UserMock) {
  const email = user.email ?? `${user.id}@example.com`;
  const name = user.name ?? user.id;
  const organizationId = user.organizationId ?? "test-org";
  const isAdmin = user.isAdmin ?? true;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: user.id, email, name } }),
    });
  });

  await page.route("**/api/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: user.id, email, name, isAdmin, organizationId }),
    });
  });
}

export async function mockBoards(page: Page, boards: BoardMock[]) {
  await page.route("**/api/boards", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ boards }),
    });
  });
}

export async function mockBoard(page: Page, board: BoardMock) {
  await page.route(`**/api/boards/${board.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ board }),
    });
  });
}

export type SharedNotesStore = ReturnType<typeof createSharedNotesStore>;

export function createSharedNotesStore(initial: any[] = []) {
  let notes = [...initial];
  return {
    all: () => notes,
    setAll: (newNotes: any[]) => {
      notes = [...newNotes];
    },
    add: (note: any) => {
      notes = [note, ...notes];
    },
    update: (id: string, patch: any) => {
      notes = notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
      );
    },
    remove: (id: string) => {
      notes = notes.filter((n) => n.id !== id);
    },
    lastModified: () => {
      const latest = notes.reduce<string | undefined>((acc, n) => {
        return !acc || new Date(n.updatedAt) > new Date(acc) ? n.updatedAt : acc;
      }, undefined);
      return latest || null;
    },
  };
}

export function createMockNote(params: {
  id?: string;
  content: string;
  userId?: string;
  boardId?: string;
}) {
  const now = new Date().toISOString();
  const id = params.id ?? `note_${Math.random().toString(36).slice(2, 10)}`;
  const userId = params.userId ?? "test-user";
  return {
    id,
    content: params.content,
    color: "#fef3c7",
    archivedAt: null,
    checklistItems: [],
    createdAt: now,
    updatedAt: now,
    boardId: params.boardId ?? "test-board",
    user: {
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
    },
  };
}

export async function mockBoardNotes(page: Page, boardId: string, store: SharedNotesStore) {
  await page.route(`**/api/boards/${boardId}/notes`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      const url = new URL(req.url());
      const isCheckOnly = url.searchParams.get("check") === "true";

      if (isCheckOnly) {
        const lastModified = store.lastModified();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ lastModified }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notes: store.all() }),
      });
    }

    if (req.method() === "POST") {
      const body = await req.postDataJSON();
      const newNote = createMockNote({ content: body.content ?? "", userId: "test-user", boardId });
      if (body.checklistItems) {
        newNote.checklistItems = body.checklistItems;
      }
      store.add(newNote);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ note: newNote }),
      });
    }
  });

  await page.route(`**/api/boards/${boardId}/notes/*`, async (route) => {
    const id = route.request().url().split("/").pop()!;
    if (route.request().method() === "PUT") {
      const patch = await route.request().postDataJSON();
      store.update(id, patch);
      const updated = store.all().find((n) => n.id === id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ note: updated }),
      });
    }
    if (route.request().method() === "DELETE") {
      store.remove(id);
      return route.fulfill({ status: 200 });
    }
  });
}
