const form = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt');
const messages = document.getElementById('messages');
const status = document.getElementById('status');

const conversation = [
  {
    role: 'assistant',
    content: 'Hi. Ask me about the local knowledge base, and I will answer using retrieval first.',
  },
];

renderMessages();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

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

function renderMessages() {
  messages.innerHTML = conversation
    .map((message) => `<article class="message ${message.role}">${escapeHtml(message.content)}</article>`)
    .join('');
  messages.scrollTop = messages.scrollHeight;
}

function setBusy(isBusy, label) {
  form.querySelector('button').disabled = isBusy;
  status.textContent = label;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}