#!/usr/bin/env node

/**
 * Automated performance comparison script using Playwright
 * Run this on both branches to compare layout calculation efficiency
 * 
 * Usage: 
 * 1. Set BOARD_ID environment variable or edit the default below
 * 2. Run: node test-performance.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

// Configuration - CHANGE THIS TO YOUR BOARD ID
const BOARD_ID = process.env.BOARD_ID || 'cme7jdwvg0001yzetc2d90m65'; 
const PORT = 3000;
const TEST_URL = `http://localhost:${PORT}`;
const SESSION_TOKEN = process.env.SESSION_TOKEN || null; // Optionally provide authjs.session-token value

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

// Get current branch name
function getCurrentBranch() {
  try {
    return execSync('git branch --show-current').toString().trim();
  } catch {
    return 'unknown';
  }
}

// Inject tracking only if board page doesn't already support perf counters
function injectTracking() {
  const boardPagePath = path.join(__dirname, 'app/boards/[id]/page.tsx');
  if (!fs.existsSync(boardPagePath)) {
    return () => {};
  }
  const content = fs.readFileSync(boardPagePath, 'utf8');
  const alreadyHasPerf = content.includes('perfCount(') || content.includes('__PERF__');
  if (alreadyHasPerf) {
    return () => {};
  }

  let modified = content;

  // Try to inject console.count markers in common patterns
  // calculateNoteHeight
  if (content.includes('const calculateNoteHeight = useCallback(')) {
    modified = modified.replace(
      /const calculateNoteHeight = useCallback\(\(\s*note: Note,[\s\S]*?\) => \{/,
      (m) => `${m}\n    console.count('calculateNoteHeight called');`
    );
  } else if (content.includes('const calculateNoteHeight = (')) {
    modified = modified.replace(
      /const calculateNoteHeight = \([\s\S]*?\) => \{/, 
      (m) => `${m}\n    console.count('calculateNoteHeight called');`
    );
  }

  // calculateGridLayout
  if (content.includes('const calculateGridLayout = useCallback(')) {
    modified = modified.replace(
      /const calculateGridLayout = useCallback\(\([\s\S]*?\) => \{/, 
      (m) => `${m}\n    console.count('calculateGridLayout called');`
    );
  } else if (content.includes('const calculateGridLayout = (')) {
    modified = modified.replace(
      /const calculateGridLayout = \([\s\S]*?\) => \{/, 
      (m) => `${m}\n    console.count('calculateGridLayout called');`
    );
  }

  // calculateMobileLayout
  if (content.includes('const calculateMobileLayout = useCallback(')) {
    modified = modified.replace(
      /const calculateMobileLayout = useCallback\(\([\s\S]*?\) => \{/, 
      (m) => `${m}\n    console.count('calculateMobileLayout called');`
    );
  } else if (content.includes('const calculateMobileLayout = (')) {
    modified = modified.replace(
      /const calculateMobileLayout = \([\s\S]*?\) => \{/, 
      (m) => `${m}\n    console.count('calculateMobileLayout called');`
    );
  }

  if (modified === content) {
    // Could not inject; skip silently
    return () => {};
  }

  fs.writeFileSync(boardPagePath + '.backup', content);
  fs.writeFileSync(boardPagePath, modified);

  return () => {
    try {
      fs.writeFileSync(boardPagePath, content);
      fs.unlinkSync(boardPagePath + '.backup');
    } catch {}
  };
}

// Run the performance test
async function runTest() {
  const branch = getCurrentBranch();
  console.log(`${colors.cyan}${colors.bright}========================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}Testing branch: ${branch}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}========================================${colors.reset}\n`);
  
  // Inject tracking
  console.log(`${colors.yellow}Injecting performance tracking...${colors.reset}`);
  const cleanup = injectTracking();
  
  try {
    // Kill any existing process on port 3000
    try {
      execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' });
    } catch (e) {
      // Port might not be in use, that's fine
    }
    
    // Build and start dev server
    console.log(`${colors.yellow}Starting development server...${colors.reset}`);
    console.log('This will take a moment...\n');
    
    // Start the dev server in background
    const { spawn } = require('child_process');
    const devServer = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: PORT.toString() }
    });
    
    let serverReady = false;
    
    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 60000);
      
      devServer.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(output); // Show build progress
        if (!serverReady && (output.includes('Ready') || output.includes('started server') || output.includes('Local:'))) {
          serverReady = true;
          clearTimeout(timeout);
          setTimeout(resolve, 3000); // Give it extra time to fully initialize
        }
      });
      
      devServer.stderr.on('data', (data) => {
        const output = data.toString();
        if (!output.includes('warning')) {
          process.stderr.write(output);
        }
      });
    });
    
    console.log(`\n${colors.green}Server ready!${colors.reset}\n`);
    
    // Now run playwright tests
    const browser = await chromium.launch({ 
      headless: true  // Run in background
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Set up console message handler to capture our counts
    const stats = {
      calculateNoteHeight: 0,
      calculateGridLayout: 0,
      calculateMobileLayout: 0
    };
    
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('calculateNoteHeight called:')) {
        const match = text.match(/calculateNoteHeight called: (\d+)/);
        if (match) stats.calculateNoteHeight = parseInt(match[1]);
      } else if (text.includes('calculateGridLayout called:')) {
        const match = text.match(/calculateGridLayout called: (\d+)/);
        if (match) stats.calculateGridLayout = parseInt(match[1]);
      } else if (text.includes('calculateMobileLayout called:')) {
        const match = text.match(/calculateMobileLayout called: (\d+)/);
        if (match) stats.calculateMobileLayout = parseInt(match[1]);
      }
    });
    
    // Optionally establish session before visiting board
    if (SESSION_TOKEN) {
      console.log(`${colors.yellow}Setting session via /api/auth/set-session...${colors.reset}`);
      try {
        await page.goto(
          `${TEST_URL}/api/auth/set-session?token=${encodeURIComponent(SESSION_TOKEN)}&redirectTo=${encodeURIComponent(`/boards/${BOARD_ID}?perf=1`)}`,
          { waitUntil: 'networkidle', timeout: 30000 }
        );
      } catch (error) {
        console.log(`${colors.red}Failed to set session. Check SESSION_TOKEN.${colors.reset}`);
        throw error;
      }
    } else {
      // Navigate to board directly (will work if already signed in or board is public)
      console.log(`${colors.yellow}Loading board: ${BOARD_ID} with perf flag${colors.reset}`);
      try {
        await page.goto(`${TEST_URL}/boards/${BOARD_ID}?perf=1`, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
      } catch (error) {
        console.log(`${colors.red}Failed to load board. Provide SESSION_TOKEN or sign in locally.${colors.reset}`);
        throw error;
      }
    }
    
    // Wait for initial render
    await page.waitForTimeout(3000);
    
    // Get initial stats
    const initialStats = { ...stats };
    console.log(`${colors.cyan}Initial load stats:${colors.reset}`);
    console.log(`  Grid layouts: ${initialStats.calculateGridLayout}`);
    console.log(`  Mobile layouts: ${initialStats.calculateMobileLayout}`);
    console.log(`  Note height calcs: ${initialStats.calculateNoteHeight}\n`);
    
    // Test 1: Search interaction
    console.log(`${colors.yellow}Test 1: Typing in search (5 characters)${colors.reset}`);
    const beforeSearch = { ...stats };
    
    // Type in search box
    try {
      const searchInput = await page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first();
      await searchInput.fill(''); // Clear first
      await searchInput.type('hello', { delay: 200 });
      await page.waitForTimeout(2500); // Wait for debounce and re-renders
    } catch (e) {
      console.log('  Search input not found, skipping...');
    }
    
    const afterSearch = { ...stats };
    console.log(`  Grid layouts triggered: ${afterSearch.calculateGridLayout - beforeSearch.calculateGridLayout}`);
    console.log(`  Mobile layouts triggered: ${afterSearch.calculateMobileLayout - beforeSearch.calculateMobileLayout}`);
    console.log(`  Note height calcs triggered: ${afterSearch.calculateNoteHeight - beforeSearch.calculateNoteHeight}\n`);
    
    // Test 2: Window resize
    console.log(`${colors.yellow}Test 2: Window resize (desktop -> mobile -> desktop)${colors.reset}`);
    const beforeResize = { ...stats };
    
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile size
    await page.waitForTimeout(2000);
    await page.setViewportSize({ width: 1400, height: 900 }); // Desktop size
    await page.waitForTimeout(2000);
    
    const afterResize = { ...stats };
    console.log(`  Grid layouts triggered: ${afterResize.calculateGridLayout - beforeResize.calculateGridLayout}`);
    console.log(`  Mobile layouts triggered: ${afterResize.calculateMobileLayout - beforeResize.calculateMobileLayout}`);
    console.log(`  Note height calcs triggered: ${afterResize.calculateNoteHeight - beforeResize.calculateNoteHeight}\n`);
    
    // Test 3: Clear search (triggers re-render with all notes)
    console.log(`${colors.yellow}Test 3: Clear search filter${colors.reset}`);
    const beforeClear = { ...stats };
    
    try {
      const searchInput = await page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]').first();
      await searchInput.fill(''); // Clear search
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('  Search input not found, skipping...');
    }
    
    const afterClear = { ...stats };
    console.log(`  Grid layouts triggered: ${afterClear.calculateGridLayout - beforeClear.calculateGridLayout}`);
    console.log(`  Mobile layouts triggered: ${afterClear.calculateMobileLayout - beforeClear.calculateMobileLayout}`);
    console.log(`  Note height calcs triggered: ${afterClear.calculateNoteHeight - beforeClear.calculateNoteHeight}\n`);

    // Test 4: Add note -> add 2 checklist items -> check both -> delete note
    console.log(`${colors.yellow}Test 4: Add note, add 2 items, check them, delete note${colors.reset}`);
    const beforeCrud = { ...stats };
    let crudSucceeded = false;
    try {
      const testNoteContent = `PERF_TEST_NOTE_${Date.now()}`;
      let usedUIAdd = false;
      // Try UI add first (works on perf branch)
      try {
        const addNoteButton = page.getByRole('button', { name: /add note/i });
        await addNoteButton.first().click();
        usedUIAdd = true;
      } catch {}

      if (usedUIAdd) {
        // Wait for the new checklist input to appear
        const addItemInput = page.locator('input[placeholder="Add new item..."]').first();
        await addItemInput.waitFor({ state: 'visible', timeout: 7000 });
        await addItemInput.fill('PERF_TEST_ITEM_1');
        await addItemInput.press('Enter');
        await page.waitForTimeout(500);

        // Find the note by the just added item text
        var noteRoot = page.locator('.note-background').filter({ hasText: 'PERF_TEST_ITEM_1' }).first();
      } else {
        // Fallback for main: create note via API with unique content, then reload to pick it up
        await page.evaluate(async (boardId, content) => {
          const res = await fetch(`/api/boards/${boardId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, checklistItems: [] })
          });
          if (!res.ok) throw new Error('Failed to create note');
          return res.json();
        }, BOARD_ID, testNoteContent);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        // Focus the created note
        var noteRoot = page.locator('.note-background', { hasText: testNoteContent }).first();

        // Start adding items by clicking Add task first
        const addTaskInNote = noteRoot.getByRole('button', { name: 'Add task' });
        await addTaskInNote.click();
        const addItemInput = noteRoot.locator('input[placeholder="Add new item..."]').first();
        await addItemInput.waitFor({ state: 'visible', timeout: 7000 });
        await addItemInput.fill('PERF_TEST_ITEM_1');
        await addItemInput.press('Enter');
        await page.waitForTimeout(500);
      }

      // Add second item via Add task button in the same note
      const addTaskInNote2 = noteRoot.getByRole('button', { name: 'Add task' });
      await addTaskInNote2.click();
      const addItemInput2 = noteRoot.locator('input[placeholder="Add new item..."]').first();
      await addItemInput2.waitFor({ state: 'visible', timeout: 5000 });
      await addItemInput2.fill('PERF_TEST_ITEM_2');
      await addItemInput2.press('Enter');
      await page.waitForTimeout(500);

      // Check both items' checkboxes
      const item1Row = noteRoot.getByText('PERF_TEST_ITEM_1', { exact: true }).locator('..');
      const item2Row = noteRoot.getByText('PERF_TEST_ITEM_2', { exact: true }).locator('..');
      await item1Row.getByRole('checkbox').click();
      await item2Row.getByRole('checkbox').click();
      await page.waitForTimeout(500);

      // Delete the note and confirm in dialog
      const deleteBtn = noteRoot.getByRole('button', { name: /delete note/i }).first();
      await deleteBtn.click();
      const confirmDelete = page.getByRole('button', { name: 'Delete note' });
      await confirmDelete.click();
      await page.waitForTimeout(1000);
      crudSucceeded = true;
    } catch (e) {
      console.log('  Note CRUD flow could not be completed, skipping...');
    }

    const afterCrud = { ...stats };
    if (crudSucceeded) {
      console.log(`  Grid layouts triggered: ${afterCrud.calculateGridLayout - beforeCrud.calculateGridLayout}`);
      console.log(`  Mobile layouts triggered: ${afterCrud.calculateMobileLayout - beforeCrud.calculateMobileLayout}`);
      console.log(`  Note height calcs triggered: ${afterCrud.calculateNoteHeight - beforeCrud.calculateNoteHeight}\n`);
    }
    
    // Final summary
    console.log(`${colors.bright}${colors.green}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.green}TOTAL PERFORMANCE STATS FOR: ${branch}${colors.reset}`);
    console.log(`${colors.bright}${colors.green}========================================${colors.reset}`);
    console.log(`Total grid layouts: ${stats.calculateGridLayout}`);
    console.log(`Total mobile layouts: ${stats.calculateMobileLayout}`);
    console.log(`Total note height calculations: ${stats.calculateNoteHeight}`);
    
    // Calculate efficiency score
    const totalCalculations = stats.calculateGridLayout + stats.calculateMobileLayout + stats.calculateNoteHeight;
    console.log(`\nTotal calculations: ${totalCalculations}`);
    
    // Save results to file
    const results = {
      branch,
      timestamp: new Date().toISOString(),
      boardId: BOARD_ID,
      totals: {
        gridLayouts: stats.calculateGridLayout,
        mobileLayouts: stats.calculateMobileLayout,
        noteHeightCalcs: stats.calculateNoteHeight,
        totalCalculations
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
    console.log(`\n${colors.green}Results saved to ${filename}${colors.reset}`);
    
    // Show comparison hint
    console.log(`\n${colors.cyan}To compare branches:${colors.reset}`);
    console.log(`1. git stash`);
    console.log(`2. git checkout ${branch === 'main' ? 'perf/memoize-board-layout' : 'main'}`);
    console.log(`3. node test-performance.js`);
    console.log(`4. Compare the two perf-results-*.json files\n`);
    
    await browser.close();
    
    // Kill dev server
    devServer.kill();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error(`${colors.red}Error during testing:${colors.reset}`, error);
    throw error;
  } finally {
    // Always cleanup
    cleanup();
    console.log(`${colors.green}Cleanup complete${colors.reset}`);
  }
}

// Run the test
runTest().catch(console.error).finally(() => process.exit(0));

