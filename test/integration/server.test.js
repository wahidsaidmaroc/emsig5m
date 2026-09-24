import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
async function loadApp(storePath) {
  process.env.SETTINGS_STORE_PATH = storePath;
  const moduleUrl = new URL(`../../server.js?cacheBust=${Date.now()}${Math.random()}`, import.meta.url);
  const { default: app } = await import(moduleUrl.href);
  return app;
}

test('GET /api/health returns ok', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emsig5m-settings-'));
  const app = await loadApp(path.join(tempDir, 'settings.json'));
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

test('GET /api/settings returns defaults', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emsig5m-settings-'));
  const app = await loadApp(path.join(tempDir, 'settings.json'));
  const server = app.listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/settings`);
    const body = await response.json();

    assert.equal(response.ok, true);
    assert.equal(body.profile.firstName, '');
    assert.equal(body.ai.model, 'gpt-4o-mini');
    assert.equal(body.display.theme, 'light');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('PUT /api/settings persists updates', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emsig5m-settings-'));
  const storePath = path.join(tempDir, 'settings.json');
  let app = await loadApp(storePath);
  let server = app.listen(0);

  try {
    let address = server.address();
    let response = await fetch(`http://127.0.0.1:${address.port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: {
          firstName: 'Amina',
          lastName: 'Diallo',
          email: 'amina@example.com',
          avatarUrl: 'https://example.com/avatar.png',
          password: 'secret123',
        },
        ai: {
          model: 'gpt-4o',
          temperature: 1.1,
          maxResponseLength: 2048,
          language: 'en',
          tone: 'technique',
        },
        display: {
          theme: 'dark',
          fontSize: 18,
          animations: false,
        },
        notifications: {
          enabled: false,
          channels: ['push', 'email'],
        },
        data: {
          privacyPolicyUrl: 'https://example.com/privacy',
        },
      }),
    });

    const saved = await response.json();

    assert.equal(response.ok, true);
    assert.equal(saved.profile.firstName, 'Amina');
    assert.equal(saved.profile.password, '');
    assert.equal(saved.profile.passwordConfigured, true);
    assert.equal(saved.ai.model, 'gpt-4o');
    assert.equal(saved.display.theme, 'dark');
    assert.deepEqual(saved.notifications.channels, ['push', 'email']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  app = await loadApp(storePath);
  server = app.listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/settings`);
    const body = await response.json();

    assert.equal(body.profile.firstName, 'Amina');
    assert.equal(body.profile.password, '');
    assert.equal(body.profile.passwordConfigured, true);
    assert.equal(body.display.theme, 'dark');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/chat rejects missing message', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emsig5m-settings-'));
  const app = await loadApp(path.join(tempDir, 'settings.json'));
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
