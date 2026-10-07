'use strict';

const crypto = require('node:crypto');

const MAX_TITLE = 80;
const MAX_BODY = 2000;

// In-memory store. Fine for a demo; a real service would use a database.
const store = new Map();

// Any character that could break out of an HTML context is escaped before the
// value is ever rendered. This is what stops stored XSS: a note whose title is
// `<script>alert(1)</script>` is displayed as text, not executed.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validate BEFORE storing. Rejecting bad input at the edge means the rest of
// the code can assume the data is well formed.
function validate(input) {
  const errors = [];

  if (typeof input !== 'object' || input === null) {
    return ['body must be a JSON object'];
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    errors.push('title is required');
  } else if (input.title.length > MAX_TITLE) {
    errors.push(`title must be at most ${MAX_TITLE} characters`);
  }
  if (typeof input.body !== 'string' || input.body.trim() === '') {
    errors.push('body is required');
  } else if (input.body.length > MAX_BODY) {
    errors.push(`body must be at most ${MAX_BODY} characters`);
  }

  return errors;
}

function create(input) {
  const errors = validate(input);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.validation = errors;
    throw err;
  }

  const note = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  store.set(note.id, note);
  return note;
}

function get(id) {
  return store.get(id) || null;
}

function list() {
  return Array.from(store.values());
}

function remove(id) {
  return store.delete(id);
}

function count() {
  return store.size;
}

function reset() {
  store.clear();
}

module.exports = { create, get, list, remove, count, reset, escapeHtml, validate, MAX_TITLE, MAX_BODY };
