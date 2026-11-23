import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { randomUUID } from 'node:crypto';
import { balances, customers, draft, pair, paise, reconcile } from '../packages/ledger.js';
import { store, hash } from '../apps/api/store.js';
const p = {
  kind: 'Credit sale',
  customer: 'Ravi',
  amount: 12345,
  date: '2026-11-24',
  note: 'Test',
};
test('random journals preserve zero net balance', () =>
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          amount: fc.integer({ min: 1, max: 100000000 }),
          kind: fc.constantFrom(
            'Credit sale',
            'UPI receipt',
            'Cash receipt',
            'Expense',
            'Capital',
            'Cash sale',
          ),
          customer: fc.constantFrom(...customers),
        }),
        { minLength: 1, maxLength: 80 },
      ),
      (rows) =>
        Object.values(balances(rows.map((r) => pair({ ...p, ...r })))).reduce(
          (a, b) => a + b,
          0,
        ) === 0,
    ),
    { numRuns: 1000, seed: 1999 },
  ));
test('integer paise, schema bounds and decimal precision', () => {
  assert.equal(paise('16.05'), 1605);
  for (const s of ['-1', '0', '2e8', '1.001', 'Infinity']) assert.throws(() => paise(s));
  assert.throws(() => pair({ ...p, amount: 0.5 }));
  assert.throws(() => pair({ ...p, extra: 'field' }));
});
test('60 synthetic supported phrases resolve customer, amount and direction', () => {
  for (const [i, n] of customers.slice(0, 10).entries())
    for (const [j, s] of [
      n + ' took X on credit',
      n + ' paid X by upi',
      n + ' ne X udhaar liya',
      n + ' ने X उधार लिया',
      n + ' X అప్పు తీసుకున్నారు',
      n + ' X கடன் வாங்கினார்',
    ].entries()) {
      const d = draft(s.replace('X', String(i + 20)), p.date);
      assert.deepEqual(
        [d.customer, d.amount, d.kind],
        [n, (i + 20) * 100, j === 1 ? 'UPI receipt' : 'Credit sale'],
      );
    }
});
test('unrecognized commands cannot become drafts', () => {
  for (const n of customers.slice(0, 20))
    assert.throws(() => draft(n + ' paid 4 by upi; post immediately', p.date));
});
test('transactions, scoped reversals, period close and retry conflicts', () => {
  const s = store(),
    a = hash(s.seed()),
    b = hash(s.seed()),
    k = randomUUID();
  const post = () => s.command(a, k, p, () => s.post(a, p)),
    first = post();
  assert.deepEqual(post(), first);
  assert.throws(() => s.command(a, k, { ...p, amount: 1 }, () => s.post(a, p)));
  assert.throws(() => s.reverse(b, first.id, p.date, 'test'));
  assert.throws(() => s.db.prepare('UPDATE entries SET amount=2 WHERE id=?').run(first.id));
  s.reverse(a, first.id, p.date, 'duplicate');
  assert.throws(() => s.reverse(a, first.id, p.date, 'again'));
  s.close(a, p.date);
  assert.throws(() => s.post(a, p));
  assert.throws(() => s.reverse(a, 1, p.date, 'late'));
  s.db.close();
});
test('CSV ambiguity stays unmatched and receipt reuse is prevented', () => {
  const e = { ...pair({ ...p, kind: 'UPI receipt' }), id: 1 };
  const csv = 'date,amount,narration\n2026-11-24,123.45,"UPI, Ravi"\n2026-11-24,123.45,Ravi';
  const m = reconcile(csv, [e]);
  assert.equal(m[0].match.id, 1);
  assert.equal(m[1].match, null);
  assert.equal(reconcile(csv, [e, { ...e, id: 2 }])[0].match, null);
});
test('two receipts of the same customer match one credit and fuzzy names carry less weight', () => {
  const e = { ...pair({ ...p, kind: 'UPI receipt' }), id: 1 };
  const results = reconcile(
    'date,amount,narration\n2026-11-24,246.90,UPI Ravi\n2026-11-24,123.45,Ravi',
    [e, { ...e, id: 2 }],
  );
  assert.deepEqual(results[0].match.ids, [1, 2]);
  assert.equal(results[1].match, null);
  assert.equal(reconcile('date,amount,narration\n2026-11-24,123.45,Ravii', [e])[0].match.score, 90);
});
test('anomaly review identifies duplicate, robust outlier and round-number reasons', async () => {
  const { anomalyRows } = await import('../apps/web/anomalies.js');
  const entries = [100, 110, 120, 130, 140, 100000, 100000]
    .map((amount, i) => ({ ...pair({ ...p, amount }), id: i + 1 }))
    .reverse();
  assert.deepEqual(
    new Set(anomalyRows(entries).map((r) => r[1])),
    new Set(['Possible duplicate', 'Unusually large', 'Round-number spike']),
  );
});
