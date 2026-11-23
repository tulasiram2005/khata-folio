import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const page = await fetch(base);
assert.equal(page.status, 200);
assert.match(await page.text(), /Khata Folio/);
assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
if (base.startsWith('https:')) assert.ok(page.headers.get('strict-transport-security'));
assert.equal((await (await fetch(base + '/readyz')).json()).ok, true);
const api = async (route, body, headers = {}, key = randomUUID()) => {
  const res = await fetch(base + '/api/' + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      'X-Khata': '1',
      'Idempotency-Key': key,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(res.status, 200, route + ' status ' + res.status);
  return res;
};
const owner = { Cookie: (await api('session', {})).headers.get('set-cookie').split(';')[0] };
const book = () => api('book', null, owner).then((r) => r.json());
const before = await book(),
  day = '2026-11-24',
  proposal = await (
    await api('draft', { text: 'Ravi ne 500 udhaar liya', date: day }, owner)
  ).json();
assert.equal((await book()).entries.length, before.entries.length);
const key = randomUUID(),
  posted = await (await api('post', proposal, owner, key)).json();
assert.deepEqual(await (await api('post', proposal, owner, key)).json(), posted);
assert.equal((await book()).entries.length, before.entries.length + 1);
const cap = {
  'X-Statement': (await (await api('link', { customer: 'Ravi' }, owner)).json()).token,
};
const statement = await (await api('statement', null, cap)).json();
assert.equal(statement.customer, 'Ravi');
await api('attest', { id: posted.id, action: 'Disputed', note: 'Synthetic smoke check' }, cap);
const after = await book();
assert.ok(after.events.some((e) => e.entry === posted.id && e.action === 'Disputed'));
const receipt = after.entries.find((e) => e.debit === 'UPI/Bank');
const csv =
  'date,amount,narration\n' +
  receipt.date +
  ',' +
  (receipt.amount / 100).toFixed(2) +
  ',UPI ' +
  receipt.credit.slice(4);
const match = await (await api('reconcile', { csv }, owner)).json();
assert.equal(match[0].match.id, receipt.id);
console.log(
  'Passed live shell, readiness, response headers, draft isolation, retry-safe post, scoped statement, dispute and receipt match.',
);
