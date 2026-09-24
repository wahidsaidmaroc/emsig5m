import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { buildIndex, retrieveContext } from './rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3555);
const openAIApiKey = process.env.OPENAI_API_KEY;
const client = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey }) : null;
const knowledgeDir = path.join(__dirname, 'knowledge');
const settingsStorePath = process.env.SETTINGS_STORE_PATH || path.join(__dirname, '.data', 'settings.json');
const allowedModels = new Set(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini']);
const allowedLanguages = new Set(['fr', 'en', 'es']);
const allowedTones = new Set(['professionnel', 'amical', 'technique', 'concise']);
const allowedThemes = new Set(['light', 'dark']);
const allowedNotificationChannels = new Set(['email', 'teams', 'push']);

const defaultSettings = {
  profile: {
    firstName: '',
    lastName: '',
    email: '',
    avatarUrl: '',
    password: '',
  },
  ai: {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxResponseLength: 1200,
    language: 'fr',
    tone: 'professionnel',
  },
  display: {
    theme: 'light',
    fontSize: 16,
    animations: true,
  },
  notifications: {
    enabled: true,
    channels: ['email'],
  },
  data: {
    privacyPolicyUrl: 'https://openai.com/policies/privacy-policy',
  },
  security: {
    passwordHash: '',
  },
};

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const index = client ? await buildIndex(knowledgeDir, client).catch(() => ({ chunks: [] })) : { chunks: [] };
let settings = await loadSettings();

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, chunks: index.chunks.length });
});

app.get('/api/settings', (_request, response) => {
  response.json(toPublicSettings(settings));
});

app.put('/api/settings', async (request, response) => {
  try {
    settings = await saveSettings(request.body);
    response.json(toPublicSettings(settings));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Settings could not be saved.' });
  }
});

app.post('/api/chat', async (request, response) => {
  const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content?.trim();

  if (!lastUserMessage) {
    response.status(400).json({ error: 'Message is required.' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({ error: 'OPENAI_API_KEY is not set.' });
    return;
  }

  try {
    const contextChunks = await retrieveContext(client, index, lastUserMessage, 4);
    const context = contextChunks
      .map((chunk, chunkIndex) => `[${chunkIndex + 1}] ${chunk.text}\nSource: ${chunk.source}`)
      .join('\n\n');

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a concise assistant. Use the provided context when it helps. If the context does not contain the answer, say so briefly.',
        },
        ...(context
          ? [
              {
                role: 'system',
                content: `Context:\n${context}`,
              },
            ]
          : []),
        ...messages,
      ],
    });

    response.json({
      reply: completion.choices[0]?.message?.content?.trim() || '',
      sources: contextChunks.map((chunk) => chunk.source),
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Chat request failed.' });
  }
});

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  app.listen(port, () => {
    console.log(`Chatbot running on http://localhost:${port}`);
  });
}

export default app;

async function loadSettings() {
  try {
    const content = await fs.readFile(settingsStorePath, 'utf8');
    return normalizeInternalSettings(JSON.parse(content));
  } catch {
    return structuredClone(defaultSettings);
  }
}

async function saveSettings(payload) {
  const nextSettings = normalizeSettings(payload, settings);
  await fs.mkdir(path.dirname(settingsStorePath), { recursive: true });
  await fs.writeFile(settingsStorePath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
  return nextSettings;
}

function normalizeSettings(payload, previousSettings) {
  const previous = isObject(previousSettings) ? previousSettings : defaultSettings;
  const incoming = isObject(payload) ? payload : {};
  const profile = isObject(incoming.profile) ? incoming.profile : {};
  const ai = isObject(incoming.ai) ? incoming.ai : {};
  const display = isObject(incoming.display) ? incoming.display : {};
  const notifications = isObject(incoming.notifications) ? incoming.notifications : {};
  const data = isObject(incoming.data) ? incoming.data : {};

  const password = typeof profile.password === 'string' ? profile.password.trim() : '';

  return {
    profile: {
      firstName: cleanString(profile.firstName),
      lastName: cleanString(profile.lastName),
      email: cleanString(profile.email),
      avatarUrl: cleanString(profile.avatarUrl),
      password: '',
    },
    ai: {
      model: pickAllowed(ai.model, allowedModels, previous.ai.model),
      temperature: clampNumber(ai.temperature, 0, 2, previous.ai.temperature, 1),
      maxResponseLength: clampNumber(ai.maxResponseLength, 128, 8192, previous.ai.maxResponseLength, 0),
      language: pickAllowed(ai.language, allowedLanguages, previous.ai.language),
      tone: pickAllowed(ai.tone, allowedTones, previous.ai.tone),
    },
    display: {
      theme: pickAllowed(display.theme, allowedThemes, previous.display.theme),
      fontSize: clampNumber(display.fontSize, 12, 24, previous.display.fontSize, 0),
      animations: toBoolean(display.animations, previous.display.animations),
    },
    notifications: {
      enabled: toBoolean(notifications.enabled, previous.notifications.enabled),
      channels: normalizeChannels(notifications.channels, previous.notifications.channels),
    },
    data: {
      privacyPolicyUrl: cleanString(data.privacyPolicyUrl) || previous.data.privacyPolicyUrl,
    },
    security: {
      passwordHash: password ? hashPassword(password) : previous.security.passwordHash,
    },
  };
}

function normalizeInternalSettings(value) {
  const normalized = normalizeSettings(toPublicSettings(value), value);
  return {
    ...normalized,
    security: {
      passwordHash: isObject(value?.security) && typeof value.security.passwordHash === 'string' ? value.security.passwordHash : '',
    },
  };
}

function toPublicSettings(value) {
  const normalized = isObject(value) ? value : {};
  const profile = isObject(normalized.profile) ? normalized.profile : {};

  return {
    profile: {
      firstName: cleanString(profile.firstName),
      lastName: cleanString(profile.lastName),
      email: cleanString(profile.email),
      avatarUrl: cleanString(profile.avatarUrl),
      password: '',
      passwordConfigured: Boolean(normalized.security?.passwordHash),
    },
    ai: {
      model: pickAllowed(normalized.ai?.model, allowedModels, defaultSettings.ai.model),
      temperature: clampNumber(normalized.ai?.temperature, 0, 2, defaultSettings.ai.temperature, 1),
      maxResponseLength: clampNumber(normalized.ai?.maxResponseLength, 128, 8192, defaultSettings.ai.maxResponseLength, 0),
      language: pickAllowed(normalized.ai?.language, allowedLanguages, defaultSettings.ai.language),
      tone: pickAllowed(normalized.ai?.tone, allowedTones, defaultSettings.ai.tone),
    },
    display: {
      theme: pickAllowed(normalized.display?.theme, allowedThemes, defaultSettings.display.theme),
      fontSize: clampNumber(normalized.display?.fontSize, 12, 24, defaultSettings.display.fontSize, 0),
      animations: toBoolean(normalized.display?.animations, defaultSettings.display.animations),
    },
    notifications: {
      enabled: toBoolean(normalized.notifications?.enabled, defaultSettings.notifications.enabled),
      channels: normalizeChannels(normalized.notifications?.channels, defaultSettings.notifications.channels),
    },
    data: {
      privacyPolicyUrl: cleanString(normalized.data?.privacyPolicyUrl) || defaultSettings.data.privacyPolicyUrl,
    },
  };
}

function hashPassword(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickAllowed(value, allowed, fallback) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback, decimals = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  const limited = Math.min(max, Math.max(min, number));
  return Number(limited.toFixed(decimals));
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function normalizeChannels(value, fallback = defaultSettings.notifications.channels) {
  const channels = Array.isArray(value) ? value : [value];
  const normalized = channels.filter((channel) => typeof channel === 'string' && allowedNotificationChannels.has(channel));
  return normalized.length ? [...new Set(normalized)] : [...fallback];
}
