import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { mongoStore } from '../apps/api/mongo.js';
import { hash } from '../apps/api/store.js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
try {
  const s = await mongoStore(rs.getUri(), 'folio_test');
  try {
    const shop = hash(await s.seed()),
      p = {
        kind: 'Credit sale',
        customer: 'Ravi',
        amount: 11770,
        date: '2026-11-24',
        note: 'Synthetic retry',
      },
      key = randomUUID();
    const post = () => s.command(shop, key, p, () => s.post(shop, p));
    const results = await Promise.all(Array.from({ length: 8 }, post));
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal((await s.entries(shop)).length, 123);
    await s.command(shop, randomUUID(), { close: p.date }, () => s.close(shop, p.date));
    await assert.rejects(() => s.command(shop, randomUUID(), p, () => s.post(shop, p)));
    assert.equal((await s.entries(shop)).length, 123);
    console.log('Passed real single-node Mongo replica-set retry race, period close and rollback.');
  } finally {
    await s.shutdown();
  }
} finally {
  await rs.stop();
}
