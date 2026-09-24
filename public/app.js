const form = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt');
const messages = document.getElementById('messages');
const status = document.getElementById('status');
const styleChoices = document.querySelectorAll('.style-choice');
const themeStorageKey = 'chat-theme';
const allowedThemes = new Set(['gemini', 'chatgpt', 'claude']);
let backendReady = false;
let selectedTheme = normalizeTheme(localStorage.getItem(themeStorageKey));

const conversation = [
  {
    role: 'assistant',
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

form.addEventListener('submit', async (event) => {
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
    renderMessages();
    setBusy(false, data.sources?.length ? `Sources: ${data.sources.join(', ')}` : 'Ready.');
  } catch (error) {
    setBusy(false, error instanceof Error ? error.message : 'Request failed.');
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
    form.querySelector('button').disabled = true;
    promptInput.disabled = true;
    status.textContent = selectedTheme
      ? 'GitHub Pages preview only. Backend is not deployed here.'
      : 'Choose a style to begin. Backend is not deployed here.';
  } else if (!selectedTheme) {
    status.textContent = 'Choose a style to begin.';
  }
}

function renderMessages() {
  messages.innerHTML = conversation
    .map((message) => `<article class="message ${message.role}">${escapeHtml(message.content)}</article>`)
    .join('');
  messages.scrollTop = messages.scrollHeight;
}

function setBusy(isBusy, label) {
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