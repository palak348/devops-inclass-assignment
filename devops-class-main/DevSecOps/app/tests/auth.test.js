'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { getApiToken, safeCompare, extractBearer } = require('../src/auth');

test('getApiToken returns null when the token is absent', () => {
  delete process.env.API_TOKEN;
  assert.strictEqual(getApiToken(), null);
});

test('getApiToken rejects a token that is too short to be useful', () => {
  process.env.API_TOKEN = 'short';
  assert.strictEqual(getApiToken(), null);
});

test('getApiToken accepts a token of a sensible length', () => {
  process.env.API_TOKEN = 'a-sufficiently-long-token';
  assert.strictEqual(getApiToken(), 'a-sufficiently-long-token');
});

test('safeCompare matches identical strings and rejects different ones', () => {
  assert.strictEqual(safeCompare('secretvalue', 'secretvalue'), true);
  assert.strictEqual(safeCompare('secretvalue', 'secretvalve'), false);
  assert.strictEqual(safeCompare('short', 'muchlongervalue'), false);
});

test('extractBearer parses a valid header and rejects the rest', () => {
  assert.strictEqual(extractBearer('Bearer abc123'), 'abc123');
  assert.strictEqual(extractBearer('bearer abc123'), 'abc123');
  assert.strictEqual(extractBearer('Basic abc123'), null);
  assert.strictEqual(extractBearer('Bearer'), null);
  assert.strictEqual(extractBearer(undefined), null);
});
