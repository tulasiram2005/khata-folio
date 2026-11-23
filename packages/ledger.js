import { z } from 'zod';
import { parse } from 'csv-parse/sync';

export const customers =
  'Ravi Meena Asha Kiran Lakshmi Imran Kavya Arjun Leela Nisha Bala Tara Anita Dev Farah Gita Hari Isha Jaya Kartik Lata Manu Neha Omar Pooja Rani Sara Teja Uma Vijay Zoya Aditya Bhavna Chitra Deepa Esha Ganesh Hema Ishaan Jyoti'.split(
    ' ',
  );
export const accounts = [
  'Cash',
  'UPI/Bank',
  'Inventory',
  'Sales',
  'Purchases',
  'GST Payable',
  'Expenses',
  'Owner Capital',
  ...customers.map((n) => 'Due/' + n),
];
export const day = z.iso.date();
const kind = z.enum([
  'Credit sale',
  'UPI receipt',
  'Cash receipt',
  'Cash sale',
  'Expense',
  'Capital',
]);
export const proposal = z.strictObject({
  kind,
  customer: z.enum(customers),
  amount: z.int().positive().max(100000000),
  date: day,
  note: z.string().trim().max(160),
});
export function pair(input) {
  const p = proposal.parse(input),
    due = 'Due/' + p.customer;
  const sides = {
    'Credit sale': [due, 'Sales'],
    'UPI receipt': ['UPI/Bank', due],
    'Cash receipt': ['Cash', due],
    'Cash sale': ['Cash', 'Sales'],
    Expense: ['Expenses', 'Cash'],
    Capital: ['Cash', 'Owner Capital'],
  };
  const [debit, credit] = sides[p.kind];
  return { date: p.date, note: p.note || p.kind, debit, credit, amount: p.amount };
}
export function paise(value) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))
    throw Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (n < 1 || n > 100000000) throw Error('Amount must be between ₹0.01 and ₹10,00,000.');
  return n;
}
export function draft(text, date) {
  const frames = [
    [/^([a-z]+) took (\d+(?:\.\d{1,2})?) on credit$/i, 'Credit sale'],
    [/^([a-z]+) paid (\d+(?:\.\d{1,2})?) by upi$/i, 'UPI receipt'],
    [/^([a-z]+) ne (\d+(?:\.\d{1,2})?) udhaar liya$/i, 'Credit sale'],
    [/^([a-z]+) ने (\d+(?:\.\d{1,2})?) उधार लिया$/i, 'Credit sale'],
    [/^([a-z]+) (\d+(?:\.\d{1,2})?) అప్పు తీసుకున్నారు$/i, 'Credit sale'],
    [/^([a-z]+) (\d+(?:\.\d{1,2})?) கடன் வாங்கினார்$/i, 'Credit sale'],
  ];
  for (const [pattern, kind] of frames) {
    const match = text.trim().match(pattern);
    if (!match) continue;
    const customer = customers.find((n) => n.toLowerCase() === match[1].toLowerCase());
    if (customer)
      return proposal.parse({ kind, customer, amount: paise(match[2]), date, note: text });
  }
  throw Error('Could not identify one customer, amount and entry type. Use the entry form.');
}
export function balances(entries) {
  const totals = Object.fromEntries(accounts.map((a) => [a, 0]));
  for (const e of entries) {
    totals[e.debit] += e.amount;
    totals[e.credit] -= e.amount;
  }
  return totals;
}
function similarName(word, target) {
  if (word.length < 4 || Math.abs(word.length - target.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < word.length && j < target.length) {
    if (word[i] === target[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (word.length >= target.length) i++;
    if (target.length >= word.length) j++;
  }
  return edits + (word.length - i) + (target.length - j) <= 1;
}
export function reconcile(csv, entries) {
  const [header, ...rows] = parse(csv, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    max_record_size: 1200,
  });
  const keys = (header ?? []).map((k) => k.toLowerCase());
  if (!['date', 'amount', 'narration'].every((k) => keys.includes(k)) || rows.length > 300)
    throw Error('Use date,amount,narration and at most 300 rows.');
  const receipts = entries.filter(
    (e) =>
      e.debit === 'UPI/Bank' &&
      e.credit.startsWith('Due/') &&
      !e.reversal &&
      !entries.some((r) => r.reversal === e.id),
  );
  const used = new Set();
  return rows.map((row) => {
    const cell = (k) => row[keys.indexOf(k)],
      date = day.parse(cell('date')),
      amount = paise(cell('amount')),
      narration = cell('narration');
    const window = receipts.filter(
      (e) => !used.has(e.id) && Math.abs(Date.parse(e.date) - Date.parse(date)) <= 3 * 86400000,
    );
    const candidates = window
      .filter((e) => e.amount === amount)
      .map((e) => {
        const name = e.credit.slice(4).toLowerCase(),
          nameHit = narration
            .toLowerCase()
            .split(/[^a-z]+/)
            .includes(name);
        const reasons = ['Same amount', e.date === date ? 'Same day' : 'Within three days'];
        const fuzzy =
          !nameHit &&
          narration
            .toLowerCase()
            .split(/[^a-z]+/)
            .some((w) => similarName(w, name));
        if (nameHit) reasons.push('Customer name');
        else if (fuzzy) reasons.push('Similar customer name');
        return {
          id: e.id,
          score: 50 + (e.date === date ? 25 : 10) + (nameHit ? 25 : fuzzy ? 15 : 0),
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score);
    const first = candidates[0];
    let match = first && first.score >= 85 && first.score !== candidates[1]?.score ? first : null;
    if (!first) {
      const pairs = [];
      for (const [i, a] of window.entries()) {
        if (
          !narration
            .toLowerCase()
            .split(/[^a-z]+/)
            .includes(a.credit.slice(4).toLowerCase())
        )
          continue;
        for (const b of window.slice(i + 1)) {
          if (a.credit === b.credit && a.amount + b.amount === amount) pairs.push([a.id, b.id]);
          if (pairs.length > 1) break;
        }
        if (pairs.length > 1) break;
      }
      if (pairs.length === 1)
        match = {
          ids: pairs[0],
          score: 90,
          reasons: ['Two receipts total the amount', 'Customer name', 'Within three days'],
        };
    }
    if (match) for (const id of match.ids ?? [match.id]) used.add(id);
    return { date, amount, narration, match };
  });
}
