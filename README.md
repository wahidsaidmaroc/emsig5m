# emsig5m

Minimal Node.js RAG chatbot MVP.

## Stack

- Node.js + Express
- OpenAI embeddings + chat model
- Local markdown knowledge base
- Minimal vanilla UI

## Run

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.

## Knowledge base

Put `.md` or `.txt` files in `knowledge/`. The server chunks them, embeds them, and retrieves the most relevant chunks for each user question.
