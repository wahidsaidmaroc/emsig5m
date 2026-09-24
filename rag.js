import fs from 'node:fs/promises';
import path from 'node:path';

const allowedExtensions = new Set(['.md', '.txt']);

export async function buildIndex(rootDir, client) {
  const files = await listFiles(rootDir);
  const chunks = [];

  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8');
    for (const chunk of splitText(text)) {
      chunks.push({
        source: path.relative(process.cwd(), filePath),
        text: chunk,
      });
    }
  }

  if (chunks.length === 0) {
    return { chunks: [] };
  }

  const embeddingResponse = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    input: chunks.map((chunk) => chunk.text),
  });

  return {
    chunks: chunks.map((chunk, index) => ({
      ...chunk,
      vector: embeddingResponse.data[index].embedding,
    })),
  };
}

export async function retrieveContext(client, index, query, limit = 4) {
  if (!index.chunks.length) {
    return [];
  }

  const embeddingResponse = await client.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    input: query,
  });

  const queryVector = embeddingResponse.data[0].embedding;

  return index.chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, chunk.vector),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export { splitText, cosineSimilarity };

async function listFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
}

function splitText(text, size = 900, overlap = 120) {
  const cleanText = text.replace(/\r\n/g, '\n').trim();

  if (!cleanText) {
    return [];
  }

  if (cleanText.length <= size) {
    return [cleanText];
  }

  const chunks = [];
  let start = 0;

  while (start < cleanText.length) {
    const end = Math.min(cleanText.length, start + size);
    chunks.push(cleanText.slice(start, end));

    if (end >= cleanText.length) {
      break;
    }

    start = end - overlap;
  }

  return chunks;
}

function cosineSimilarity(left, right) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
}