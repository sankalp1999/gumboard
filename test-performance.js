#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const BOARD_ID = process.env.BOARD_ID || 'cme7jdwvg0001yzetc2d90m65';
const SESSION_TOKEN = process.env.SESSION_TOKEN || null;
const PORT = 3000;
const TEST_URL = `http://localhost:${PORT}`;

const colors = { reset: '\x1b[0m', bright: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m' };

function getCurrentBranch() {
  try { return execSync('git branch --show-current').toString().trim(); } catch { return 'unknown'; }
}

function injectTracking() {
  const boardPagePath = path.join(__dirname, 'app/boards/[id]/page.tsx');
  if (!fs.existsSync(boardPagePath)) return () => {};
  const content = fs.readFileSync(boardPagePath, 'utf8');
  if (content.includes('perfCount(') || content.includes('__PERF__')) return () => {};
  let modified = content;
  if (content.includes('const calculateNoteHeight = useCallback(')) {
    modified = modified.replace(/const calculateNoteHeight = useCallback\(\([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateNoteHeight called');`);
  } else if (content.includes('const calculateNoteHeight = (')) {
    modified = modified.replace(/const calculateNoteHeight = \([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateNoteHeight called');`);
  }
  if (content.includes('const calculateGridLayout = useCallback(')) {
    modified = modified.replace(/const calculateGridLayout = useCallback\(\([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateGridLayout called');`);
  } else if (content.includes('const calculateGridLayout = (')) {
    modified = modified.replace(/const calculateGridLayout = \([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateGridLayout called');`);
  }
  if (content.includes('const calculateMobileLayout = useCallback(')) {
    modified = modified.replace(/const calculateMobileLayout = useCallback\(\([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateMobileLayout called');`);
  } else if (content.includes('const calculateMobileLayout = (')) {
    modified = modified.replace(/const calculateMobileLayout = \([\s\S]*?\) => \{/, (m) => `${m}\n    console.count('calculateMobileLayout called');`);
  }
  if (modified === content) return () => {};
  fs.writeFileSync(boardPagePath + '.backup', content);
  fs.writeFileSync(boardPagePath, modified);
  return () => { try { fs.writeFileSync(boardPagePath, content); fs.unlinkSync(boardPagePath + '.backup'); } catch {} };
}

async function run() {
  const branch = getCurrentBranch();
  console.log(`${colors.cyan}${colors.bright}Testing branch: ${branch}${colors.reset}`);
  const cleanup = injectTracking();
  let devServer;
  try {
    try { execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' }); } catch {}
    devServer = spawn('npm', ['run', 'dev'], { stdio: 'pipe', shell: true, env: { ...process.env, PORT: String(PORT) } });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 60000);
      devServer.stdout.on('data', (d) => { const out = d.toString(); process.stdout.write(out); if (out.includes('Local:') || out.includes('Ready') || out.includes('started server')) { clearTimeout(timeout); setTimeout(resolve, 3000); } });
      devServer.stderr.on('data', (d) => { const out = d.toString(); if (!out.toLowerCase().includes('warning')) process.stderr.write(out); });
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const stats = { calculateNoteHeight: 0, calculateGridLayout: 0, calculateMobileLayout: 0 };
    page.on('console', (msg) => {
      const t = msg.text();
      let m;
      if ((m = t.match(/calculateNoteHeight called: (\d+)/))) stats.calculateNoteHeight = parseInt(m[1]);
      if ((m = t.match(/calculateGridLayout called: (\d+)/))) stats.calculateGridLayout = parseInt(m[1]);
      if ((m = t.match(/calculateMobileLayout called: (\d+)/))) stats.calculateMobileLayout = parseInt(m[1]);
    });

    if (SESSION_TOKEN) {
      await page.goto(`${TEST_URL}/api/auth/set-session?token=${encodeURIComponent(SESSION_TOKEN)}&redirectTo=${encodeURIComponent(`/boards/${BOARD_ID}?perf=1`)}`, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
      await page.goto(`${TEST_URL}/boards/${BOARD_ID}?perf=1`, { waitUntil: 'networkidle', timeout: 30000 });
    }

    await page.waitForTimeout(3000);
    const initialStats = { ...stats };
    console.log('Initial:', initialStats);

    const beforeSearch = { ...stats };
    try { const input = await page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first(); await input.fill(''); await input.type('hello', { delay: 200 }); await page.waitForTimeout(2500); } catch {}
    const afterSearch = { ...stats };

    const beforeResize = { ...stats };
    await page.setViewportSize({ width: 375, height: 667 }); await page.waitForTimeout(2000);
    await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(2000);
    const afterResize = { ...stats };

    const beforeClear = { ...stats };
    try { const input = await page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first(); await input.fill(''); await page.waitForTimeout(2000); } catch {}
    const afterClear = { ...stats };

    const beforeCrud = { ...stats };
    let crudSucceeded = false;
    try {
      const testNoteContent = `PERF_TEST_NOTE_${Date.now()}`;
      let usedUIAdd = false;
      try { const btn = page.getByRole('button', { name: /add note/i }); await btn.first().click(); usedUIAdd = true; } catch {}
      let noteRoot;
      if (usedUIAdd) {
        const addItemInput = page.locator('input[placeholder="Add new item..."]').first();
        await addItemInput.waitFor({ state: 'visible', timeout: 7000 });
        await addItemInput.fill('PERF_TEST_ITEM_1');
        await addItemInput.press('Enter');
        await page.waitForTimeout(500);
        noteRoot = page.locator('.note-background').filter({ hasText: 'PERF_TEST_ITEM_1' }).first();
      } else {
        await page.evaluate(async (boardId, content) => {
          const res = await fetch(`/api/boards/${boardId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, checklistItems: [] }) });
          if (!res.ok) throw new Error('Failed to create note');
          return res.json();
        }, BOARD_ID, testNoteContent);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        noteRoot = page.locator('.note-background', { hasText: testNoteContent }).first();
        const addTask = noteRoot.getByRole('button', { name: 'Add task' });
        await addTask.click();
        const addItemInput = noteRoot.locator('input[placeholder="Add new item..."]').first();
        await addItemInput.waitFor({ state: 'visible', timeout: 7000 });
        await addItemInput.fill('PERF_TEST_ITEM_1');
        await addItemInput.press('Enter');
        await page.waitForTimeout(500);
      }
      const addTask2 = noteRoot.getByRole('button', { name: 'Add task' });
      await addTask2.click();
      const addItemInput2 = noteRoot.locator('input[placeholder="Add new item..."]').first();
      await addItemInput2.waitFor({ state: 'visible', timeout: 5000 });
      await addItemInput2.fill('PERF_TEST_ITEM_2');
      await addItemInput2.press('Enter');
      await page.waitForTimeout(500);
      const item1Row = noteRoot.getByText('PERF_TEST_ITEM_1', { exact: true }).locator('..');
      const item2Row = noteRoot.getByText('PERF_TEST_ITEM_2', { exact: true }).locator('..');
      await item1Row.getByRole('checkbox').click();
      await item2Row.getByRole('checkbox').click();
      await page.waitForTimeout(500);
      try { const deleteBtn = noteRoot.getByRole('button', { name: /delete note/i }).first(); await deleteBtn.click(); const confirmDelete = page.getByRole('button', { name: 'Delete note' }); await confirmDelete.click(); } catch {}
      await page.waitForTimeout(1000);
      crudSucceeded = true;
    } catch {}
    const afterCrud = { ...stats };

    const results = {
      branch,
      timestamp: new Date().toISOString(),
      boardId: BOARD_ID,
      totals: {
        gridLayouts: stats.calculateGridLayout,
        mobileLayouts: stats.calculateMobileLayout,
        noteHeightCalcs: stats.calculateNoteHeight,
        totalCalculations: stats.calculateGridLayout + stats.calculateMobileLayout + stats.calculateNoteHeight
      },
      searchTest: {
        gridLayouts: afterSearch.calculateGridLayout - beforeSearch.calculateGridLayout,
        mobileLayouts: afterSearch.calculateMobileLayout - beforeSearch.calculateMobileLayout,
        noteHeightCalcs: afterSearch.calculateNoteHeight - beforeSearch.calculateNoteHeight
      },
      resizeTest: {
        gridLayouts: afterResize.calculateGridLayout - beforeResize.calculateGridLayout,
        mobileLayouts: afterResize.calculateMobileLayout - beforeResize.calculateMobileLayout,
        noteHeightCalcs: afterResize.calculateNoteHeight - beforeResize.calculateNoteHeight
      },
      clearSearchTest: {
        gridLayouts: afterClear.calculateGridLayout - beforeClear.calculateGridLayout,
        mobileLayouts: afterClear.calculateMobileLayout - beforeClear.calculateMobileLayout,
        noteHeightCalcs: afterClear.calculateNoteHeight - beforeClear.calculateNoteHeight
      },
      noteCrudTest: crudSucceeded ? {
        gridLayouts: afterCrud.calculateGridLayout - beforeCrud.calculateGridLayout,
        mobileLayouts: afterCrud.calculateMobileLayout - beforeCrud.calculateMobileLayout,
        noteHeightCalcs: afterCrud.calculateNoteHeight - beforeCrud.calculateNoteHeight
      } : null
    };
    const filename = `perf-results-${branch.replace(/\//g, '-')}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`${colors.green}Saved ${filename}${colors.reset}`);

    await browser.close();
    devServer.kill();
  } finally {
    cleanup();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

