import { MongoClient } from 'mongodb';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';
import { hash, secret, fail } from './store.js';
import { customers, pair } from '../../packages/ledger.js';

// Only transaction-scoped calls inherit a session. Concurrent HTTP requests have independent contexts.
export async function mongoStore(uri, name) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 }),
    db = client.db(name),
    tx = new AsyncLocalStorage();
  await client.connect();
  const options = () => (tx.getStore() ? { session: tx.getStore() } : {});
  const journal = db.collection('journal_entries'),
    shops = db.collection('shops'),
    audit = db.collection('audit_events'),
    links = db.collection('share_links'),
    commands = db.collection('idempotency_keys');
  const validator = {
    $and: [
      {
        $jsonSchema: {
          bsonType: 'object',
          required: ['shop', 'id', 'amount', 'debit', 'credit', 'date', 'note'],
          properties: {
            amount: { bsonType: 'int', minimum: 1, maximum: 100000000 },
            id: { bsonType: 'int', minimum: 1 },
            debit: { bsonType: 'string' },
            credit: { bsonType: 'string' },
          },
        },
      },
      { $expr: { $ne: ['$debit', '$credit'] } },
    ],
  };
  try {
    await db.createCollection('journal_entries', { validator });
  } catch (e) {
    if (e.code !== 48) throw e;
  }
  await Promise.all([
    journal.createIndex({ shop: 1, id: 1 }, { unique: true }),
    journal.createIndex({ shop: 1, date: -1, id: -1 }),
    journal.createIndex(
      { shop: 1, reversal: 1 },
      { unique: true, partialFilterExpression: { reversal: { $type: 'number' } } },
    ),
    audit.createIndex({ shop: 1, seq: 1 }, { unique: true }),
    links.createIndex({ shop: 1, customer: 1 }),
    commands.createIndex({ scope: 1, key: 1 }, { unique: true }),
  ]);
  const transact = (fn) =>
    client.withSession((session) =>
      session.withTransaction(() => tx.run(session, fn), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      }),
    );
  async function event(shop, entry, action, note) {
    const state = await shops.findOne({ _id: shop }, options()),
      seq = state.seq + 1,
      previous = state.head;
    const digest = hash(JSON.stringify([shop, entry, action, note, previous]));
    await shops.updateOne({ _id: shop }, { $set: { seq, head: digest } }, options());
    await audit.insertOne({ shop, seq, entry, action, note, previous, digest }, options());
  }
  async function insert(shop, e, reversal = null) {
    const state = await shops.findOneAndUpdate(
      { _id: shop },
      { $inc: { serial: 1 } },
      { ...options(), returnDocument: 'after' },
    );
    await journal.insertOne({ ...e, shop, id: state.serial, reversal }, options());
    await event(shop, state.serial, reversal ? 'Reversed' : 'Posted', e.note);
    return state.serial;
  }
  const entries = (shop) =>
    journal
      .find({ shop }, { ...options(), projection: { shop: 0, _id: 0 } })
      .sort({ date: -1, id: -1 })
      .toArray();
  const history = (shop) =>
    audit
      .find({ shop }, { ...options(), projection: { _id: 0, entry: 1, action: 1, note: 1 } })
      .sort({ seq: 1 })
      .toArray();
  const active = async (token) => {
    const doc = await links.findOne(
      { _id: hash(token), expires: { $gt: Date.now() }, revoked: false },
      options(),
    );
    if (!doc) fail('This link has expired or was revoked.');
    return { shop: doc.shop, customer: doc.customer, token };
  };
  return {
    ready: async () => !!(await db.command({ ping: 1 })).ok,
    count: () => shops.countDocuments(),
    shutdown: () => client.close(),
    active,
    entries,
    member: (token) =>
      db
        .collection('members')
        .findOne({ _id: hash(token), expires: { $gt: Date.now() } }, options()),
    async invite(shop, role, value) {
      await this.removeMember(shop, role);
      await db
        .collection('members')
        .insertOne({ _id: hash(value), shop, role, expires: Date.now() + 86400000 }, options());
      await event(shop, 0, 'Invited', role);
      return {};
    },
    async removeMember(shop, role) {
      await db.collection('members').deleteMany({ shop, role }, options());
      await event(shop, 0, 'Revoked', role);
      return {};
    },
    exists: async (shop) =>
      !!(await shops.findOne({ _id: shop, created: { $gt: Date.now() - 86400000 } }, options())),
    state: async (shop) => ({
      entries: await entries(shop),
      closed: (await shops.findOne({ _id: shop }, options())).closed,
      events: await history(shop),
    }),
    seed: async () => {
      const token = secret(),
        shop = hash(token);
      // Build the deterministic seed in memory, then insert all three collections together.
      const docs = [],
        events = [];
      let head = '';
      const log = (entry, action, note) => {
        const digest = hash(JSON.stringify([shop, entry, action, note, head]));
        events.push({ shop, entry, action, note, digest, previous: head, seq: events.length + 1 });
        head = digest;
      };
      for (let i = 0; i < 120; i++) {
        const date = new Date(Date.UTC(2026, 5, 1) + Math.floor(i * 1.45) * 86400000)
            .toISOString()
            .slice(0, 10),
          credit = i < 40 || i % 3;
        const e = pair({
          kind: credit ? 'Credit sale' : 'UPI receipt',
          customer: customers[i % 40],
          date,
          amount: 3500 + ((i * 73) % 900) * 100,
          note: credit ? 'General provisions' : 'UPI settlement',
        });
        docs.push({ ...e, shop, id: i + 1, reversal: null });
        log(i + 1, 'Posted', e.note);
      }
      for (const i of [3, 14, 29]) log(i + 1, 'Disputed', 'Please check the quantity.');
      for (const i of [8, 16]) {
        const e = docs[i],
          id = docs.length + 1,
          note = 'Duplicate delivery slip';
        docs.push({
          ...e,
          id,
          date: '2026-11-22',
          debit: e.credit,
          credit: e.debit,
          reversal: e.id,
          note,
        });
        log(id, 'Reversed', note);
      }
      await transact(async () => {
        await shops.insertOne(
          {
            _id: shop,
            created: Date.now(),
            closed: '',
            serial: docs.length,
            seq: events.length,
            head,
          },
          options(),
        );
        await journal.insertMany(docs, options());
        await audit.insertMany(events, options());
      });
      return token;
    },
    async command(scope, key, body, fn) {
      const fingerprint = hash(JSON.stringify(body));
      async function replay(row) {
        if (row.fingerprint !== fingerprint)
          fail('This request key already belongs to another action.');
        return row.result;
      }
      try {
        return await transact(async () => {
          const prior = await commands.findOne({ scope, key }, options());
          if (prior) return replay(prior);
          const result = await fn();
          await commands.insertOne({ scope, key, fingerprint, result }, options());
          return result;
        });
      } catch (e) {
        if (e.code !== 11000) throw e;
        const prior = await commands.findOne({ scope, key });
        if (!prior) throw e;
        return replay(prior);
      }
    },
    async post(shop, p) {
      const e = pair(p);
      if (e.date <= (await shops.findOne({ _id: shop }, options())).closed)
        fail('This period is closed.');
      return { id: await insert(shop, e) };
    },
    async reverse(shop, id, date, note) {
      const e = await journal.findOne({ shop, id }, options());
      if (!e || e.reversal || (await journal.findOne({ shop, reversal: id }, options())))
        fail('Entry unavailable for reversal.');
      if (date < e.date || date <= (await shops.findOne({ _id: shop }, options())).closed)
        fail('Choose an open date on or after the entry.');
      return {
        id: await insert(
          shop,
          { date, note, amount: e.amount, debit: e.credit, credit: e.debit },
          id,
        ),
      };
    },
    async close(shop, date) {
      const r = await shops.updateOne(
        { _id: shop, closed: { $lt: date } },
        { $set: { closed: date } },
        options(),
      );
      if (!r.modifiedCount) fail('Choose a later closing date.');
      await event(shop, 0, 'Closed', date);
      return { closed: date };
    },
    async link(shop, customer, token, key) {
      await this.revoke(shop, customer);
      const value = createHmac('sha256', token).update(key).digest('base64url');
      await links.insertOne(
        { _id: hash(value), shop, customer, expires: Date.now() + 86400000, revoked: false },
        options(),
      );
      return {};
    },
    async revoke(shop, customer) {
      await shops.updateOne({ _id: shop }, { $inc: { linkChanges: 1 } }, options());
      await links.updateMany(
        { shop, customer, revoked: false },
        { $set: { revoked: true } },
        options(),
      );
      return {};
    },
    async statement(scope) {
      const account = 'Due/' + scope.customer,
        rows = (await entries(scope.shop)).filter((e) => [e.debit, e.credit].includes(account)),
        ids = new Set(rows.map((e) => e.id));
      return {
        customer: scope.customer,
        entries: rows,
        events: (await history(scope.shop)).filter(
          (e) => ids.has(e.entry) && ['Confirmed', 'Disputed'].includes(e.action),
        ),
      };
    },
    async attest(scope, id, action, note) {
      await active(scope.token);
      if (!(await this.statement(scope)).entries.some((e) => e.id === id))
        fail('Entry outside this statement.');
      await event(scope.shop, id, action, note);
      return { id };
    },
  };
}
