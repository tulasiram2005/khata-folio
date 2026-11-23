import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { store, hash } from '../apps/api/store.js';
test('consistent SQLite snapshot restores a posted journal and its full audit chain', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'khata-restore-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = store(join(dir, 'source.sqlite')),
    shop = hash(source.seed()),
    expected = source.state(shop),
    snapshot = join(dir, 'restore.sqlite');
  source.db.prepare('VACUUM INTO ?').run(snapshot);
  source.db.close();
  const restored = store(snapshot);
  assert.deepEqual(restored.state(shop), expected);
  let previous = '';
  for (const e of restored.db.prepare('SELECT * FROM events WHERE shop=? ORDER BY id').all(shop)) {
    assert.equal(e.previous, previous);
    previous = hash(JSON.stringify([shop, e.entry, e.action, e.note, previous]));
    assert.equal(e.digest, previous);
  }
  restored.db.close();
});
