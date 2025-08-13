let autocannon = null;
let execFile;
let fs;
let path;

async function runOnceCli({ url, connections, duration, headers }) {
  const mod = await import('child_process');
  execFile = mod.execFile;
  return new Promise((resolve, reject) => {
    const args = ['--yes', 'autocannon', '-c', String(connections), '-d', String(duration), '--json'];
    Object.entries(headers || {}).forEach(([k, v]) => {
      args.push('-H');
      args.push(`${k}: ${v}`);
    });
    args.push(url);

    execFile('npx', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        console.error('Failed to parse autocannon JSON output');
        console.error(stderr || stdout);
        reject(e);
      }
    });
  });
}

async function runOnce({ url, connections = 50, duration = 30, headers = {} }) {
  if (!autocannon) {
    try {
      autocannon = (await import('autocannon')).default;
    } catch {
      // ignore
    }
  }
  if (autocannon) {
    return await new Promise((resolve) => {
      const instance = autocannon({ url, connections, duration, headers });
      instance.on('done', (result) => resolve(result));
    });
  }
  return await runOnceCli({ url, connections, duration, headers });
}

async function getEtag(url, headers = {}) {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.method = 'GET';
    options.headers = headers;
    const req = http.request(options, (res) => {
      const etag = res.headers.etag || null;
      res.resume();
      res.on('end', () => resolve(etag));
    });
    req.on('error', reject);
    req.end();
  });
}

async function ensureDir(p) {
  if (!fs) fs = await import('fs');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function saveJson(file, data) {
  if (!path) path = await import('path');
  await ensureDir(path.dirname(file));
  if (!fs) fs = await import('fs');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function printRow(name, r) {
  const bytes = r.throughput.total; // bytes sent by server
  const p = r.latency;
  const sc = r.statusCodeStats || {};
  const p95 = (p && (p.p95 ?? p.p99 ?? p.p90)) || '—';
  const codes = Object.entries(sc)
    .map(([code, stats]) => `${code}:${stats.count}`)
    .join(' ');
  console.log(
    `${name}\t${r.requests.average.toFixed(1)}\t${p.p50}ms\t${p95}ms\t${bytes}\t${codes}`
  );
}

function toMdRow(name, r) {
  const bytes = r.throughput.total;
  const p = r.latency;
  const sc = r.statusCodeStats || {};
  const p95 = (p && (p.p95 ?? p.p99 ?? p.p90)) || '—';
  const codes = Object.entries(sc)
    .map(([code, stats]) => `${code}:${stats.count}`)
    .join('<br/>');
  return `| ${name} | ${r.requests.average.toFixed(1)} | ${p.p50} | ${p95} | ${bytes} | ${codes} |`;
}

async function main() {
  const base = process.env.BASE || 'http://localhost:3000';
  const boardId = process.env.BOARD || 'test-board';
  const connections = Number(process.env.CONN || 50);
  const duration = Number(process.env.DUR || 20);
  const outDir = process.env.OUT || 'scripts/bench/results';
  const cookie = process.env.COOKIES || '';
  const commonHeaders = cookie ? { cookie, 'cache-control': 'no-cache' } : { 'cache-control': 'no-cache' };

  const etagUrl = `${base}/api/boards/${boardId}/notes`;
  const simpleUrl = `${base}/api/boards/${boardId}/notes?mode=simple`;

  console.log(`# Benchmark: ETag vs Simple`);
  console.log(`# base=${base} board=${boardId} conn=${connections} dur=${duration}s`);
  console.log(`name\tRPS(avg)\tp50\tp95\tbytesSent\tstatusCodes`);

  const etag = await getEtag(etagUrl, commonHeaders);

  const etagIdle = await runOnce({
    url: etagUrl,
    connections,
    duration,
    headers: etag ? { ...commonHeaders, 'if-none-match': etag } : commonHeaders,
  });
  printRow('etag-idle', etagIdle);
  if (!path) path = await import('path');
  await saveJson(path.join(outDir, 'etag-idle.json'), etagIdle);

  const simpleIdle = await runOnce({
    url: simpleUrl,
    connections,
    duration,
    headers: commonHeaders,
  });
  printRow('simple-idle', simpleIdle);
  await saveJson(path.join(outDir, 'simple-idle.json'), simpleIdle);

  const churn = process.env.CHURN === '1';
  if (!churn) {
    console.log('\nSet CHURN=1 and optionally NOTE=<noteId> to auto-run writer, then rerun.');
    // Also write markdown summary for idle case
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const md = [
      `# ETag vs Simple (Idle)`,
      ``,
      `- base: ${base}`,
      `- board: ${boardId}`,
      `- connections: ${connections}`,
      `- duration: ${duration}s`,
      ``,
      `| scenario | rps(avg) | p50 (ms) | p95 (ms) | bytesSent | statusCodes |`,
      `|---|---:|---:|---:|---:|---|`,
      toMdRow('etag-idle', etagIdle),
      toMdRow('simple-idle', simpleIdle),
      ``,
    ].join('\n');
    await ensureDir(outDir);
    if (!path) path = await import('path');
    if (!fs) fs = await import('fs');
    fs.writeFileSync(path.join(outDir, `summary-idle-${stamp}.md`), md);
    return;
  }

  // Optionally start churn writer if NOTE provided
  let writer = null;
  const noteId = process.env.NOTE;
  if (noteId) {
    const env = { ...process.env, BASE: base, BOARD: boardId, NOTE: noteId };
    const cp = await import('child_process');
    if (!path) path = await import('path');
    writer = cp.fork(path.join(__dirname, 'churn-writer.js'), { env, stdio: 'ignore' });
    // small warmup delay
    await new Promise((r) => setTimeout(r, 1000));
  }

  const etagChurn = await runOnce({
    url: etagUrl,
    connections,
    duration,
    headers: commonHeaders,
  });
  printRow('etag-churn', etagChurn);
  await saveJson(path.join(outDir, 'etag-churn.json'), etagChurn);

  const simpleChurn = await runOnce({
    url: simpleUrl,
    connections,
    duration,
    headers: commonHeaders,
  });
  printRow('simple-churn', simpleChurn);
  await saveJson(path.join(outDir, 'simple-churn.json'), simpleChurn);

  if (writer) {
    writer.kill('SIGTERM');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const md = [
    `# ETag vs Simple (Churn=${Boolean(noteId)})`,
    ``,
    `- base: ${base}`,
    `- board: ${boardId}`,
    `- connections: ${connections}`,
    `- duration: ${duration}s`,
    ``,
    `| scenario | rps(avg) | p50 (ms) | p95 (ms) | bytesSent | statusCodes |`,
    `|---|---:|---:|---:|---:|---|`,
    toMdRow('etag-idle', etagIdle),
    toMdRow('simple-idle', simpleIdle),
    toMdRow('etag-churn', etagChurn),
    toMdRow('simple-churn', simpleChurn),
    ``,
  ].join('\n');
  await ensureDir(outDir);
  if (!path) path = await import('path');
  if (!fs) fs = await import('fs');
  fs.writeFileSync(path.join(outDir, `summary-churn-${stamp}.md`), md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


