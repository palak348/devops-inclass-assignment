'use strict';

const test = require('node:test');
const assert = require('node:assert');
const notes = require('../src/notes');

test('create stores a note and returns it with an id', () => {
  notes.reset();
  const note = notes.create({ title: 'first', body: 'hello world' });
  assert.ok(note.id);
  assert.strictEqual(note.title, 'first');
  assert.strictEqual(notes.count(), 1);
});

test('create trims whitespace', () => {
  notes.reset();
  const note = notes.create({ title: '  padded  ', body: '  text  ' });
  assert.strictEqual(note.title, 'padded');
  assert.strictEqual(note.body, 'text');
});

test('create rejects a missing title', () => {
  notes.reset();
  assert.throws(() => notes.create({ body: 'no title' }), /title is required/);
  assert.strictEqual(notes.count(), 0);
});

test('create rejects an over-long body', () => {
  notes.reset();
  const long = 'x'.repeat(notes.MAX_BODY + 1);
  assert.throws(() => notes.create({ title: 'ok', body: long }), /at most/);
});

test('escapeHtml neutralises a script tag', () => {
  const escaped = notes.escapeHtml('<script>alert(1)</script>');
  assert.strictEqual(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!escaped.includes('<script>'));
});

test('escapeHtml handles quotes and ampersands', () => {
  assert.strictEqual(notes.escapeHtml(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
});

test('remove deletes an existing note and reports a missing one', () => {
  notes.reset();
  const note = notes.create({ title: 'temp', body: 'delete me' });
  assert.strictEqual(notes.remove(note.id), true);
  assert.strictEqual(notes.remove(note.id), false);
  assert.strictEqual(notes.count(), 0);
});
