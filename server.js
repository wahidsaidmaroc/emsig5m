import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { buildIndex, retrieveContext } from './rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const openAIApiKey = process.env.OPENAI_API_KEY;
const client = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey }) : null;
const knowledgeDir = path.join(__dirname, 'knowledge');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const index = client ? await buildIndex(knowledgeDir, client).catch(() => ({ chunks: [] })) : { chunks: [] };

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, chunks: index.chunks.length });
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

app.listen(port, () => {
  console.log(`Chatbot running on http://localhost:${port}`);
});