const chatForm = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt');
const messages = document.getElementById('messages');
const status = document.getElementById('status');
const sendButton = document.getElementById('send-button');
const openSettingsButton = document.getElementById('open-settings');
const closeSettingsButton = document.getElementById('close-settings');
const settingsPanel = document.getElementById('settings-panel');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const historyList = document.getElementById('history-list');
const downloadDataButton = document.getElementById('download-data');
const deleteDataButton = document.getElementById('delete-data');
const deleteConversationButton = document.getElementById('delete-conversation');
const deleteAllHistoryButton = document.getElementById('delete-all-history');
const exportHistoryButton = document.getElementById('export-history');
const clearConversationButton = document.getElementById('clear-conversation');
const passwordStatus = document.getElementById('password-status');
const privacyPolicyLink = document.getElementById('privacy-policy-link');
const settingsInputs = {
  firstName: document.getElementById('first-name'),
  lastName: document.getElementById('last-name'),
  email: document.getElementById('email'),
  avatarUrl: document.getElementById('avatar-url'),
  password: document.getElementById('password'),
  model: document.getElementById('model'),
  temperature: document.getElementById('temperature'),
  maxResponseLength: document.getElementById('max-response-length'),
  language: document.getElementById('language'),
  tone: document.getElementById('tone'),
  theme: document.getElementById('theme'),
  fontSize: document.getElementById('font-size'),
  animations: document.getElementById('animations'),
  notificationsEnabled: document.getElementById('notifications-enabled'),
  notificationEmail: document.getElementById('notification-email'),
  notificationTeams: document.getElementById('notification-teams'),
  notificationPush: document.getElementById('notification-push'),
  privacyPolicyUrl: document.getElementById('privacy-policy-url'),
};

const storageKeys = {
  settings: 'emsig5m-settings',
  transcript: 'emsig5m-transcript',
  archives: 'emsig5m-archives',
};

const defaultSettings = {
  profile: {
    firstName: '',
    lastName: '',
    email: '',
    avatarUrl: '',
    password: '',
    passwordConfigured: false,
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
};
const styleChoices = document.querySelectorAll('.style-choice');
const themeStorageKey = 'chat-theme';
const allowedThemes = new Set(['gemini', 'chatgpt', 'claude']);
let backendReady = false;
let selectedTheme = normalizeTheme(localStorage.getItem(themeStorageKey));

const initialConversation = [
  {
    role: 'assistant',
    content: 'Bonjour. Utilisez Configuration pour personnaliser votre chatbot.',
  },
];

let backendReady = false;
let settings = clone(defaultSettings);
let conversation = loadConversation();
let archives = loadArchives();

applySettings(settings);
renderMessages();
renderArchives();
populateSettingsForm(settings);
setPasswordStatus(settings.profile.passwordConfigured);
await checkBackendAvailability();
await loadSettings();
    content: 'Hi. Choose a chat style first, then ask me about the local knowledge base.',
  },
];

applyTheme(selectedTheme, false);
renderMessages();
checkBackendAvailability();
setComposerEnabled(Boolean(selectedTheme));

styleChoices.forEach((button) => {
  button.addEventListener('click', () => {
    applyTheme(button.dataset.theme || '', true);
  });
});

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!backendReady) {
    setBusy(false, 'Backend unavailable in this deployment.');
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    return;
  }

  conversation.push({ role: 'user', content: prompt });
  persistConversation();
  renderMessages();
  promptInput.value = '';
  setBusy(true, 'Thinking...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    conversation.push({ role: 'assistant', content: data.reply || 'No response.' });
    persistConversation();
    renderMessages();
    setBusy(false, data.sources?.length ? `Sources: ${data.sources.join(', ')}` : 'Ready.');
  } catch (error) {
    setBusy(false, error instanceof Error ? error.message : 'Request failed.');
  }
});

openSettingsButton.addEventListener('click', () => {
  settingsPanel.hidden = false;
  settingsPanel.scrollIntoView({ behavior: settings.display.animations ? 'smooth' : 'auto', block: 'start' });
  settingsInputs.firstName.focus();
});

closeSettingsButton.addEventListener('click', () => {
  settingsPanel.hidden = true;
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nextSettings = collectSettings();

  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    });

    let savedSettings = nextSettings;

    if (response.ok) {
      savedSettings = await response.json();
      persistSettings(savedSettings);
      setSettingsStatus('Paramètres enregistrés avec succès.');
    } else {
      throw new Error('Server refused settings update.');
    }

    settings = normalizeSettings(savedSettings);
    applySettings(settings);
    populateSettingsForm(settings);
    setPasswordStatus(settings.profile.passwordConfigured);
  } catch (error) {
    const localSettings = normalizeSettings({
      ...nextSettings,
      profile: {
        ...nextSettings.profile,
        password: '',
        passwordConfigured: Boolean(nextSettings.profile.password?.trim() || settings.profile.passwordConfigured),
      },
    });
    persistSettings(localSettings);
    settings = localSettings;
    applySettings(settings);
    populateSettingsForm(settings);
    setPasswordStatus(settings.profile.passwordConfigured);
    setSettingsStatus(error instanceof Error ? `${error.message} Enregistré localement.` : 'Enregistré localement.');
  }
});

clearConversationButton.addEventListener('click', () => {
  conversation = [...initialConversation];
  persistConversation();
  renderMessages();
  setBusy(false, 'Conversation réinitialisée.');
});

deleteConversationButton.addEventListener('click', () => {
  archiveCurrentConversation();
  conversation = [...initialConversation];
  persistConversation();
  renderMessages();
  renderArchives();
  setBusy(false, 'Conversation archivée puis supprimée.');
});

deleteAllHistoryButton.addEventListener('click', () => {
  archives = [];
  conversation = [...initialConversation];
  persistArchives();
  persistConversation();
  renderMessages();
  renderArchives();
  setBusy(false, 'Historique supprimé.');
});

exportHistoryButton.addEventListener('click', () => {
  downloadJson('historique.json', {
    currentConversation: conversation,
    archives,
  });
  setSettingsStatus('Historique exporté.');
});

downloadDataButton.addEventListener('click', () => {
  downloadJson('mes-donnees.json', {
    settings,
    currentConversation: conversation,
    archives,
  });
  setSettingsStatus('Données téléchargées.');
});

deleteDataButton.addEventListener('click', async () => {
  localStorage.removeItem(storageKeys.settings);
  localStorage.removeItem(storageKeys.transcript);
  localStorage.removeItem(storageKeys.archives);
  settings = clone(defaultSettings);
  conversation = [...initialConversation];
  archives = [];
  applySettings(settings);
  populateSettingsForm(settings);
  setPasswordStatus(false);
  persistConversation();
  persistArchives();
  persistSettings(settings);
  if (backendReady) {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch {
      // Ignore server sync errors for the local reset flow.
    }
  }
  renderMessages();
  renderArchives();
  setSettingsStatus('Données personnelles supprimées.');
});

settingsInputs.password.addEventListener('input', () => {
  setPasswordStatus(Boolean(settingsInputs.password.value.trim()) || settings.profile.passwordConfigured);
});

settingsInputs.theme.addEventListener('change', () => {
  applySettings({ ...settings, display: { ...settings.display, theme: settingsInputs.theme.value } });
});

settingsInputs.fontSize.addEventListener('input', () => {
  applySettings({ ...settings, display: { ...settings.display, fontSize: Number(settingsInputs.fontSize.value) } });
});

settingsInputs.animations.addEventListener('change', () => {
  applySettings({ ...settings, display: { ...settings.display, animations: settingsInputs.animations.checked } });
});

window.addEventListener('storage', (event) => {
  if (event.key === storageKeys.settings) {
    loadStoredSettings();
  }

  if (event.key === storageKeys.transcript) {
    conversation = loadConversation();
    renderMessages();
  }

  if (event.key === storageKeys.archives) {
    archives = loadArchives();
    renderArchives();
  }
});

async function checkBackendAvailability() {
  try {
    const response = await fetch('/api/health');
    backendReady = response.ok;
  } catch {
    backendReady = false;
  }

  if (!backendReady) {
    sendButton.disabled = true;
    promptInput.disabled = true;
    status.textContent = selectedTheme
      ? 'GitHub Pages preview only. Backend is not deployed here.'
      : 'Choose a style to begin. Backend is not deployed here.';
  } else if (!selectedTheme) {
    status.textContent = 'Choose a style to begin.';
  }
}

async function loadSettings() {
  if (!backendReady) {
    loadStoredSettings();
    return;
  }

  try {
    const response = await fetch('/api/settings');
    if (!response.ok) {
      throw new Error('Unable to load settings.');
    }

    settings = normalizeSettings(await response.json());
  } catch {
    loadStoredSettings();
  }

  persistSettings(settings);
  applySettings(settings);
  populateSettingsForm(settings);
  setPasswordStatus(settings.profile.passwordConfigured);
}

function loadStoredSettings() {
  const stored = localStorage.getItem(storageKeys.settings);
  try {
    settings = stored ? normalizeSettings(JSON.parse(stored)) : clone(defaultSettings);
  } catch {
    settings = clone(defaultSettings);
  }
  applySettings(settings);
  populateSettingsForm(settings);
}

function renderMessages() {
  messages.innerHTML = conversation
    .map((message) => `<article class="message ${message.role}">${escapeHtml(message.content)}</article>`)
    .join('');
  messages.scrollTop = messages.scrollHeight;
}

function renderArchives() {
  if (!archives.length) {
    historyList.innerHTML = '<p class="history-empty">Aucun historique archivé.</p>';
    return;
  }

  historyList.innerHTML = '';

  for (const archive of archives.slice().reverse()) {
    const article = document.createElement('article');
    article.className = 'history-item';

    const title = document.createElement('strong');
    title.textContent = archive.title;

    const meta = document.createElement('p');
    meta.className = 'history-meta';
    meta.textContent = `${archive.messages.length} message(s)`;

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.textContent = 'Consulter';
    viewButton.addEventListener('click', () => {
      conversation = archive.messages.map((message) => ({ ...message }));
      persistConversation();
      renderMessages();
      setBusy(false, `Conversation consultée : ${archive.title}`);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary';
    deleteButton.textContent = 'Supprimer';
    deleteButton.addEventListener('click', () => {
      archives = archives.filter((item) => item.id !== archive.id);
      persistArchives();
      renderArchives();
      setSettingsStatus('Conversation supprimée de l’historique.');
    });

    actions.append(viewButton, deleteButton);
    article.append(title, meta, actions);
    historyList.append(article);
  }
}

function populateSettingsForm(currentSettings) {
  settingsInputs.firstName.value = currentSettings.profile.firstName;
  settingsInputs.lastName.value = currentSettings.profile.lastName;
  settingsInputs.email.value = currentSettings.profile.email;
  settingsInputs.avatarUrl.value = currentSettings.profile.avatarUrl;
  settingsInputs.password.value = '';
  settingsInputs.model.value = currentSettings.ai.model;
  settingsInputs.temperature.value = String(currentSettings.ai.temperature);
  settingsInputs.maxResponseLength.value = String(currentSettings.ai.maxResponseLength);
  settingsInputs.language.value = currentSettings.ai.language;
  settingsInputs.tone.value = currentSettings.ai.tone;
  settingsInputs.theme.value = currentSettings.display.theme;
  settingsInputs.fontSize.value = String(currentSettings.display.fontSize);
  settingsInputs.animations.checked = currentSettings.display.animations;
  settingsInputs.notificationsEnabled.checked = currentSettings.notifications.enabled;
  settingsInputs.notificationEmail.checked = currentSettings.notifications.channels.includes('email');
  settingsInputs.notificationTeams.checked = currentSettings.notifications.channels.includes('teams');
  settingsInputs.notificationPush.checked = currentSettings.notifications.channels.includes('push');
  settingsInputs.privacyPolicyUrl.value = currentSettings.data.privacyPolicyUrl;
  privacyPolicyLink.href = currentSettings.data.privacyPolicyUrl;
  settingsPanel.dataset.theme = currentSettings.display.theme;
}

function collectSettings() {
  return normalizeSettings({
    profile: {
      firstName: settingsInputs.firstName.value,
      lastName: settingsInputs.lastName.value,
      email: settingsInputs.email.value,
      avatarUrl: settingsInputs.avatarUrl.value,
      password: settingsInputs.password.value,
    },
    ai: {
      model: settingsInputs.model.value,
      temperature: Number(settingsInputs.temperature.value),
      maxResponseLength: Number(settingsInputs.maxResponseLength.value),
      language: settingsInputs.language.value,
      tone: settingsInputs.tone.value,
    },
    display: {
      theme: settingsInputs.theme.value,
      fontSize: Number(settingsInputs.fontSize.value),
      animations: settingsInputs.animations.checked,
    },
    notifications: {
      enabled: settingsInputs.notificationsEnabled.checked,
      channels: [
        settingsInputs.notificationEmail.checked ? 'email' : null,
        settingsInputs.notificationTeams.checked ? 'teams' : null,
        settingsInputs.notificationPush.checked ? 'push' : null,
      ].filter(Boolean),
    },
    data: {
      privacyPolicyUrl: settingsInputs.privacyPolicyUrl.value,
    },
  }, settings);
}

function applySettings(currentSettings) {
  document.documentElement.dataset.theme = currentSettings.display.theme;
  document.documentElement.style.setProperty('--base-font-size', `${currentSettings.display.fontSize}px`);
  document.body.classList.toggle('animations-disabled', !currentSettings.display.animations);
}

function setBusy(isBusy, label) {
  sendButton.disabled = isBusy;
  status.textContent = label;
}

function setSettingsStatus(label) {
  settingsStatus.textContent = label;
}

function setPasswordStatus(isConfigured) {
  passwordStatus.textContent = isConfigured
    ? 'Mot de passe déjà configuré. Saisissez-en un nouveau pour le remplacer.'
    : 'Le mot de passe sera enregistré de manière hachée.';
}

function downloadJson(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function archiveCurrentConversation() {
  if (conversation.length <= 1) {
    return;
  }

  archives.push({
    id: crypto.randomUUID(),
    title: `Conversation du ${new Date().toLocaleDateString('fr-FR')}`,
    messages: conversation.map((message) => ({ ...message })),
    createdAt: new Date().toISOString(),
  });
  persistArchives();
}

function persistSettings(nextSettings) {
  localStorage.setItem(storageKeys.settings, JSON.stringify(nextSettings));
}

function persistConversation() {
  localStorage.setItem(storageKeys.transcript, JSON.stringify(conversation));
}

function persistArchives() {
  localStorage.setItem(storageKeys.archives, JSON.stringify(archives));
}

function loadConversation() {
  const stored = localStorage.getItem(storageKeys.transcript);

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: typeof message.content === 'string' ? message.content : '',
        }));
      }
    } catch {
      // Ignore invalid data.
    }
  }

  return [...initialConversation];
}

function loadArchives() {
  const stored = localStorage.getItem(storageKeys.archives);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((archive) => archive && typeof archive.id === 'string' && Array.isArray(archive.messages))
      .map((archive) => ({
        id: archive.id,
        title: typeof archive.title === 'string' ? archive.title : 'Conversation archivée',
        createdAt: typeof archive.createdAt === 'string' ? archive.createdAt : new Date().toISOString(),
        messages: archive.messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: typeof message.content === 'string' ? message.content : '',
        })),
      }));
  } catch {
    return [];
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSettings(rawSettings) {
  const value = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const profile = value.profile && typeof value.profile === 'object' ? value.profile : {};
  const ai = value.ai && typeof value.ai === 'object' ? value.ai : {};
  const display = value.display && typeof value.display === 'object' ? value.display : {};
  const notifications = value.notifications && typeof value.notifications === 'object' ? value.notifications : {};
  const data = value.data && typeof value.data === 'object' ? value.data : {};

  return {
    profile: {
      firstName: toText(profile.firstName),
      lastName: toText(profile.lastName),
      email: toText(profile.email),
      avatarUrl: toText(profile.avatarUrl),
      password: '',
      passwordConfigured: Boolean(profile.passwordConfigured),
    },
    ai: {
      model: toChoice(ai.model, ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], defaultSettings.ai.model),
      temperature: clampNumber(ai.temperature, 0, 2, defaultSettings.ai.temperature, 1),
      maxResponseLength: clampNumber(ai.maxResponseLength, 128, 8192, defaultSettings.ai.maxResponseLength, 0),
      language: toChoice(ai.language, ['fr', 'en', 'es'], defaultSettings.ai.language),
      tone: toChoice(ai.tone, ['professionnel', 'amical', 'technique', 'concise'], defaultSettings.ai.tone),
    },
    display: {
      theme: toChoice(display.theme, ['light', 'dark'], defaultSettings.display.theme),
      fontSize: clampNumber(display.fontSize, 12, 24, defaultSettings.display.fontSize, 0),
      animations: toBoolean(display.animations, defaultSettings.display.animations),
    },
    notifications: {
      enabled: toBoolean(notifications.enabled, defaultSettings.notifications.enabled),
      channels: toChannels(notifications.channels, defaultSettings.notifications.channels),
    },
    data: {
      privacyPolicyUrl: toText(data.privacyPolicyUrl) || defaultSettings.data.privacyPolicyUrl,
    },
  };
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toChoice(value, choices, fallback) {
  return typeof value === 'string' && choices.includes(value) ? value : fallback;
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

function toChannels(value, fallback) {
  const channels = Array.isArray(value) ? value : [];
  const allowed = new Set(['email', 'teams', 'push']);
  const filtered = channels.filter((channel) => typeof channel === 'string' && allowed.has(channel));
  return filtered.length ? [...new Set(filtered)] : [...fallback];
}
  form.querySelector('button').disabled = isBusy || !selectedTheme;
  status.textContent = label;
}

function setComposerEnabled(enabled) {
  promptInput.disabled = !enabled;
  form.querySelector('button').disabled = !enabled;
}

function applyTheme(theme, persist = true) {
  const normalizedTheme = normalizeTheme(theme);
  selectedTheme = normalizedTheme;

  if (persist && normalizedTheme) {
    localStorage.setItem(themeStorageKey, normalizedTheme);
  }

  if (normalizedTheme) {
    document.body.dataset.theme = normalizedTheme;
  } else {
    delete document.body.dataset.theme;
  }

  styleChoices.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.theme === normalizedTheme);
    button.setAttribute('aria-pressed', String(button.dataset.theme === normalizedTheme));
  });

  setComposerEnabled(Boolean(normalizedTheme));

  if (normalizedTheme) {
    status.textContent = backendReady
      ? `Style applied: ${prettyThemeName(normalizedTheme)}.`
      : `${prettyThemeName(normalizedTheme)} selected. Backend is not deployed here.`;
  }
}

function normalizeTheme(theme) {
  return allowedThemes.has(theme) ? theme : '';
}

function prettyThemeName(theme) {
  if (theme === 'chatgpt') return 'ChatGPT';
  if (theme === 'claude') return 'Claude';
  return 'Google Gemini';
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
