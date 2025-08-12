import { test, expect } from '@playwright/test'

test.describe('Smart Polling', () => {
  let requestCount = 0;
  let etagValue = 'initial-etag';
  let notesData = [
    {
      id: 'note-1',
      content: 'Test note 1',
      color: '#fef3c7',
      archivedAt: null,
      checklistItems: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
      },
    }
  ];

  test.beforeEach(async ({ page }) => {
    requestCount = 0;
    etagValue = 'initial-etag';
    
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user',
            email: 'test@example.com',
            name: 'Test User',
          }
        }),
      });
    });

    await page.route('**/api/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user',
          email: 'test@example.com',
          name: 'Test User',
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
  });

  test('should use ETag caching effectively', async ({ page }) => {
    let returned304 = false;
    
    await page.route('**/api/boards/test-board/notes', async (route) => {
      const ifNoneMatch = route.request().headers()['if-none-match'];
      
      if (ifNoneMatch === etagValue && requestCount > 0) {
        returned304 = true;
        await route.fulfill({
          status: 304,
          headers: {
            'ETag': etagValue,
          },
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'ETag': etagValue,
          },
          body: JSON.stringify({ notes: notesData }),
        });
      }
      requestCount++;
    });

    await page.goto('/boards/test-board');
    
    await page.waitForTimeout(1000);
    
    await page.waitForTimeout(5000);
    
    expect(returned304).toBe(true);
  });

  test('should pause polling when tab is hidden', async ({ page }) => {
    let requestsAfterHidden = 0;
    let hideTime = 0;
    
    await page.route('**/api/boards/test-board/notes', async (route) => {
      if (hideTime > 0 && Date.now() > hideTime + 1000) {
        requestsAfterHidden++;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'ETag': `etag-${Date.now()}`,
        },
        body: JSON.stringify({ notes: notesData }),
      });
    });

    await page.goto('/boards/test-board');
    await page.waitForTimeout(1000);
    
    hideTime = Date.now();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        writable: true,
        value: true
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    await page.waitForTimeout(5000);
    
    expect(requestsAfterHidden).toBe(0);
  });

  test('should adapt polling interval based on activity', async ({ page }) => {
    const pollingTimes: number[] = [];
    
    await page.route('**/api/boards/test-board/notes', async (route) => {
      pollingTimes.push(Date.now());
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'ETag': `etag-${Date.now()}`,
        },
        body: JSON.stringify({ notes: notesData }),
      });
    });

    await page.goto('/boards/test-board');
    await page.waitForTimeout(1000);
    
    await page.click('body');
    await page.waitForTimeout(12000);
    
    const activeIntervals: number[] = [];
    for (let i = 2; i < pollingTimes.length; i++) {
      activeIntervals.push(pollingTimes[i] - pollingTimes[i - 1]);
    }
    
    if (activeIntervals.length > 0) {
      const avgActiveInterval = activeIntervals.reduce((a, b) => a + b, 0) / activeIntervals.length;
      expect(avgActiveInterval).toBeGreaterThan(3000);
      expect(avgActiveInterval).toBeLessThan(5000);
    }
  });

  test('should only update UI when data actually changes', async ({ page }) => {
    let updateCount = 0;
    
    await page.route('**/api/boards/test-board/notes', async (route) => {
      updateCount++;
      
      const newEtag = updateCount <= 2 ? 'etag-1' : 'etag-2';
      const newNotes = updateCount <= 2 ? notesData : [...notesData, {
        id: 'note-2',
        content: 'Updated note',
        color: '#fef3c7',
        archivedAt: null,
        checklistItems: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: {
          id: 'test-user',
          name: 'Test User',
          email: 'test@example.com',
        },
      }];
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'ETag': newEtag,
        },
        body: JSON.stringify({ notes: newNotes }),
      });
    });

    await page.goto('/boards/test-board');
    await page.waitForTimeout(1000);
    
    const initialNoteCount = await page.locator('.note-background').count();
    expect(initialNoteCount).toBe(1);
    
    await page.waitForTimeout(8000);
    
    const updatedNoteCount = await page.locator('.note-background').count();
    expect(updatedNoteCount).toBe(2);
  });

  test('should clean up polling on navigation', async ({ page }) => {
    let requestsAfterNavigation = 0;
    let navigationTime = 0;
    
    await page.route('**/api/boards/test-board/notes', async (route) => {
      if (navigationTime > 0 && Date.now() > navigationTime + 1000) {
        requestsAfterNavigation++;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'ETag': 'test-etag',
        },
        body: JSON.stringify({ notes: notesData }),
      });
    });

    await page.goto('/boards/test-board');
    await page.waitForTimeout(2000);
    
    navigationTime = Date.now();
    await page.goto('/dashboard');
    
    await page.waitForTimeout(8000);
    
    expect(requestsAfterNavigation).toBe(0);
  });
});