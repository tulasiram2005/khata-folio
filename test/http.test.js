import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { store, hash } from '../apps/api/store.js';
import { appFor } from '../apps/api/server.js';
test('isolated owner and customer capabilities across HTTP, rotation, expiry and revocation', async (t) => {
  const s = store(),
    app = appFor(s),
    server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    s.db.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/';
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Khata': '1',
        'Idempotency-Key': randomUUID(),
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const owner = (await post('session', {})).headers.get('set-cookie').split(';')[0];
  const cookie = { Cookie: owner },
    other = { Cookie: (await post('session', {})).headers.get('set-cookie').split(';')[0] };
  const get = async (path, headers) => (await fetch(base + path, { headers })).json();
  const a = await get('book', cookie),
    b = await get('book', other);
  assert.ok(!a.entries.some((x) => b.entries.some((y) => y.id === x.id)));
  assert.equal(
    (await post('close', { date: '2026-01-01' }, { ...cookie, Origin: 'https://other.example' }))
      .status,
    403,
  );
  const k = randomUUID(),
    link = await (
      await post('link', { customer: 'Ravi' }, { ...cookie, 'Idempotency-Key': k })
    ).json();
  assert.equal(link.token, createHmac('sha256', owner.slice(6)).update(k).digest('base64url'));
  const cap = { 'X-Statement': link.token },
    view = await get('statement', cap);
  assert.equal(view.customer, 'Ravi');
  assert.ok(view.entries.every((e) => [e.credit, e.debit].includes('Due/Ravi')));
  assert.equal(
    (await post('attest', { id: b.entries[0].id, action: 'Confirmed', note: '' }, cap)).status,
    400,
  );
  assert.equal(
    (
      await post(
        'attest',
        { id: view.entries[0].id, action: 'Disputed', note: 'Wrong amount' },
        cap,
      )
    ).status,
    200,
  );
  assert.equal((await post('close', { date: '2026-11-01' }, cap)).status, 401);
  await post('link', { customer: 'Ravi' }, cookie);
  assert.equal((await fetch(base + 'statement', { headers: cap })).status, 400);
  const next = await (await post('link', { customer: 'Ravi' }, cookie)).json();
  s.db.prepare('UPDATE links SET expires=0 WHERE token=?').run(hash(next.token));
  assert.equal(
    (await fetch(base + 'statement', { headers: { 'X-Statement': next.token } })).status,
    400,
  );
  const final = await (await post('link', { customer: 'Ravi' }, cookie)).json();
  await post('revoke', { customer: 'Ravi' }, cookie);
  assert.equal(
    (await fetch(base + 'statement', { headers: { 'X-Statement': final.token } })).status,
    400,
  );
});
test('staff and accountant role matrix is enforced server-side, including revocation', async (t) => {
  const s = store(),
    server = appFor(s).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    s.shutdown();
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/';
  const post = (path, body, headers) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Khata': '1',
        'Idempotency-Key': randomUUID(),
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const owner = { Cookie: (await post('session', {}, {})).headers.get('set-cookie').split(';')[0] };
  const entry = {
    kind: 'Credit sale',
    customer: 'Ravi',
    date: '2026-11-24',
    amount: 100,
    note: '',
  };
  for (const role of ['staff', 'accountant']) {
    const { token } = await (await post('invite', { role }, owner)).json(),
      headers = { 'X-Member': token };
    assert.equal((await (await fetch(base + 'book', { headers })).json()).role, role);
    for (const route of ['reverse', 'close', 'link', 'revoke', 'invite', 'remove-member'])
      assert.equal((await post(route, {}, headers)).status, 403);
    const allowed = role === 'staff' ? 200 : 403;
    assert.equal((await post('post', entry, headers)).status, allowed);
    assert.equal(
      (await post('draft', { text: 'Ravi took 10 on credit', date: entry.date }, headers)).status,
      allowed,
    );
    assert.equal(
      (await post('reconcile', { csv: 'date,amount,narration\n2026-11-24,10,Ravi' }, headers))
        .status,
      allowed,
    );
    await post('remove-member', { role }, owner);
    assert.equal((await fetch(base + 'book', { headers })).status, 401);
  }
});
