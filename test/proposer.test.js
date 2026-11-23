import test from 'node:test';
import assert from 'node:assert/strict';
import { proposer } from '../packages/proposer.js';
test('local-model adapter validates simulated transport, caches drafts and falls back without credentials', async () => {
  let calls = 0;
  const make = proposer('local-model', async () => {
    calls++;
    return Response.json({ message: { content: '{"kind":"UPI receipt","amount":4500}' } });
  });
  const text = 'Ravi settled forty-five rupees digitally',
    date = '2026-11-24';
  assert.equal((await make('shop', text, date)).amount, 4500);
  await make('shop', text, date);
  assert.equal(calls, 1);
  assert.equal((await make('shop', 'Ravi took 75 on credit', date)).amount, 7500);
  assert.equal(calls, 1);
  const bad = proposer('local-model', async () =>
    Response.json({ message: { content: '{"kind":"post","amount":1}' } }),
  );
  await assert.rejects(() => bad('shop', text, date));
});
