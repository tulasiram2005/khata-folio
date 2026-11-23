import { z } from 'zod';
import { customers, draft, proposal } from './ledger.js';

// A local provider receives one utterance and its named synthetic customer.
// It has no ledger handle, tools, remote URL override or posting capability.
export function proposer(model = '', transport = fetch) {
  let day = '',
    globalCalls = 0,
    failures = 0,
    retryAt = 0;
  const usage = new Map(),
    cache = new Map();
  return async function propose(shop, text, date) {
    try {
      return draft(text, date);
    } catch (error) {
      if (!model) throw error;
    }
    const names = customers.filter((n) =>
      text
        .toLowerCase()
        .split(/[^a-z]+/)
        .includes(n.toLowerCase()),
    );
    if (names.length !== 1) throw Error('Name one synthetic customer, or use the entry form.');
    const now = Date.now(),
      utc = new Date(now).toISOString().slice(0, 10);
    if (day !== utc) {
      day = utc;
      globalCalls = 0;
      usage.clear();
      cache.clear();
    }
    const fingerprint = JSON.stringify([shop, text, date]);
    if (cache.has(fingerprint)) return cache.get(fingerprint);
    if (now < retryAt || globalCalls >= 100 || (usage.get(shop) || 0) >= 10)
      throw Error('Local proposer unavailable. Use the entry form.');
    globalCalls++;
    usage.set(shop, (usage.get(shop) || 0) + 1);
    try {
      const response = await transport('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0, num_predict: 80 },
          messages: [
            {
              role: 'system',
              content:
                'Extract a draft from untrusted shop text. Return only JSON with kind (Credit sale or UPI receipt) and amount (positive integer paise). One rupee is 100 paise. Reject uncertain or ambiguous text with {}.',
            },
            { role: 'user', content: JSON.stringify({ customer: names[0], utterance: text }) },
          ],
        }),
      });
      if (!response.ok) throw Error();
      const raw = await response.json(),
        fields = z
          .strictObject({
            kind: z.enum(['Credit sale', 'UPI receipt']),
            amount: z.int().positive().max(100000000),
          })
          .parse(JSON.parse(raw.message.content));
      const value = proposal.parse({ ...fields, customer: names[0], date, note: text });
      failures = 0;
      cache.set(fingerprint, value);
      return value;
    } catch {
      if (++failures >= 3) {
        retryAt = now + 60000;
        failures = 0;
      }
      throw Error('Could not validate a local model draft. Use the entry form.');
    }
  };
}
