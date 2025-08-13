async function main() {
  const http = await import('http');
  const base = process.env.BASE || 'http://localhost:3000';
  const boardId = process.env.BOARD || 'test-board';
  const noteId = process.env.NOTE;
  const intervalMs = Number(process.env.INT || 1000);
  if (!noteId) throw new Error('Set NOTE=<noteId> to update');

  const url = `${base}/api/boards/${boardId}/notes/${noteId}`;
  console.log(`# churn-writer -> ${url} every ${intervalMs}ms`);
  let n = 0;
  setInterval(() => {
    n += 1;
    const data = Buffer.from(JSON.stringify({ content: `touch-${n}` }));
    const req = http.request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (res) => {
      res.resume();
    });
    req.on('error', (e) => {
      console.error('writer error', e.message);
    });
    req.write(data);
    req.end();
  }, intervalMs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


