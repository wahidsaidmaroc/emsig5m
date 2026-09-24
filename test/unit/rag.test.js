import assert from 'node:assert/strict';
import test from 'node:test';
import { cosineSimilarity, splitText } from '../../rag.js';

test('splitText keeps short text as a single chunk', () => {
  assert.deepEqual(splitText('  Hello world  '), ['Hello world']);
});

test('splitText breaks long text into overlapping chunks', () => {
  const chunks = splitText('a'.repeat(1000), 400, 50);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 400);
  assert.equal(chunks[1].length, 400);
  assert.equal(chunks[2].length, 300);
});

test('cosineSimilarity returns 1 for identical vectors', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity returns 0 for orthogonal vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});
