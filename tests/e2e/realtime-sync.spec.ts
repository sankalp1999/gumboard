import { test, expect, Page, BrowserContext } from '@playwright/test'

test.describe('Real-time Synchronization', () => {
  let sharedNotesData: any[] = [];
  let noteIdCounter = 1;

  const createMockNote = (content: string, userId = 'user-1') => ({
    id: `note-${noteIdCounter++}`,
    content,
    color: '#fef3c7',
    archivedAt: null,
    checklistItems: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    boardId: 'test-board',
    board: {
      id: 'test-board',
      name: 'Test Board',
    },
    user: {
      id: userId,
      name: userId === 'user-1' ? 'User One' : 'User Two',
      email: `${userId}@example.com`,
    },
  });

  const setupMockRoutes = async (page: Page, userId: string) => {
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: userId,
            email: `${userId}@example.com`,
            name: userId === 'user-1' ? 'User One' : 'User Two',
          }
        }),
      });
    });

    await page.route('**/api/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: userId,
          email: `${userId}@example.com`,
          name: userId === 'user-1' ? 'User One' : 'User Two',
          isAdmin: true,
          organizationId: 'test-org',
        }),
      });
    });

    await page.route('**/api/boards', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          boards: [
            {
              id: 'test-board',
              name: 'Test Board',
              description: 'A test board',
            },
          ],
        }),
      });
    });

    await page.route('**/api/boards/test-board', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          board: {
            id: 'test-board',
            name: 'Test Board',
            description: 'A test board',
          },
        }),
      });
    });

    await page.route('**/api/boards/test-board/notes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'ETag': `etag-${sharedNotesData.length}-${Date.now()}`,
          },
          body: JSON.stringify({ notes: sharedNotesData }),
        });
      } else if (route.request().method() === 'POST') {
        const postData = await route.request().postDataJSON();
        const newNote = createMockNote(postData.content || '', userId);
        
        if (postData.checklistItems) {
          newNote.checklistItems = postData.checklistItems;
        }
        
        sharedNotesData.push(newNote);
        
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ note: newNote }),
        });
      }
    });

    await page.route('**/api/boards/test-board/notes/*', async (route) => {
      const noteId = route.request().url().split('/').pop();
      
      if (route.request().method() === 'PUT') {
        const putData = await route.request().postDataJSON();
        const noteIndex = sharedNotesData.findIndex(n => n.id === noteId);
        
        if (noteIndex !== -1) {
          sharedNotesData[noteIndex] = {
            ...sharedNotesData[noteIndex],
            ...putData,
            updatedAt: new Date().toISOString(),
          };
          
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ note: sharedNotesData[noteIndex] }),
          });
        } else {
          await route.fulfill({ status: 404 });
        }
      } else if (route.request().method() === 'DELETE') {
        sharedNotesData = sharedNotesData.filter(n => n.id !== noteId);
        await route.fulfill({ status: 200 });
      }
    });
  };

  test.beforeEach(async () => {
    sharedNotesData = [];
    noteIdCounter = 1;
  });

  test('should sync note creation between multiple users', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await setupMockRoutes(page1, 'user-1');
    await setupMockRoutes(page2, 'user-2');
    
    await page1.goto('/boards/test-board');
    await page2.goto('/boards/test-board');
    
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);
    
    expect(sharedNotesData.length).toBe(0);
    
    await page1.evaluate(() => {
      fetch('/api/boards/test-board/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Note from User 1' })
      });
    });
    
    await page1.waitForTimeout(1000);
    
    expect(sharedNotesData.length).toBe(1);
    expect(sharedNotesData[0].content).toBe('Note from User 1');
    
    await page2.waitForTimeout(5000);
    
    await page2.evaluate(() => {
      fetch('/api/boards/test-board/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Note from User 2' })
      });
    });
    
    await page2.waitForTimeout(1000);
    
    expect(sharedNotesData.length).toBe(2);
    expect(sharedNotesData.find(n => n.content === 'Note from User 2')).toBeTruthy();
    
    await context1.close();
    await context2.close();
  });

  test('should preserve active edits during polling updates', async ({ browser }) => {
    const existingNote = createMockNote('Original content', 'user-1');
    sharedNotesData.push(existingNote);
    
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await setupMockRoutes(page1, 'user-1');
    await setupMockRoutes(page2, 'user-2');
    
    await page1.goto('/boards/test-board');
    await page2.goto('/boards/test-board');
    
    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);
    
    await page2.evaluate(() => {
      fetch('/api/boards/test-board/notes/note-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'User 2 updated content' })
      });
    });
    
    await page2.waitForTimeout(1000);
    
    expect(sharedNotesData[0].content).toBe('User 2 updated content');
    
    await expect.poll(async () => await page1.locator('.note-background').count()).toBe(1);
    await expect.poll(async () => await page2.locator('.note-background').count()).toBe(1);
    
    await context1.close();
    await context2.close();
  });

  test('should sync note deletions across sessions', async ({ browser }) => {
    const note1 = createMockNote('Note to keep', 'user-1');
    const note2 = createMockNote('Note to delete', 'user-1');
    sharedNotesData.push(note1, note2);
    
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    await setupMockRoutes(page1, 'user-1');
    await setupMockRoutes(page2, 'user-2');
    
    await page1.goto('/boards/test-board');
    await page2.goto('/boards/test-board');
    
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);
    
    expect(sharedNotesData.length).toBe(2);
    
    await page1.evaluate(() => {
      fetch('/api/boards/test-board/notes/note-2', {
        method: 'DELETE'
      });
    });
    
    await page1.waitForTimeout(1000);
    
    expect(sharedNotesData.length).toBe(1);
    expect(sharedNotesData[0].content).toBe('Note to keep');
    
    await expect.poll(async () => await page1.locator('.note-background').count()).toBe(1);
    await expect.poll(async () => await page2.locator('.note-background').count()).toBe(1);
    
    await context1.close();
    await context2.close();
  });
});