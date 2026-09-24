import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../../server.js';

test('GET /api/health returns ok', async () => {
  const server = app.listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = await response.json();

    assert.equal(response.ok, true);
    assert.deepEqual(body, { ok: true, chunks: 0 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/chat rejects missing message', async () => {
  const server = app.listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Message is required.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
