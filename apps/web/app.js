import { anomalyRows } from './anomalies.js';
const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const token = location.hash.startsWith('#statement=') ? location.hash.slice(11) : '';
const member = location.hash.startsWith('#team=') ? location.hash.slice(6) : '';
let book,
  tab = 'Day book',
  person = 'Ravi',
  sequence = 0,
  filter = 'All entries',
  shown = 16;
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function info(text, bad = false) {
  $('notice').textContent = text;
  $('notice').className = bad ? 'error' : '';
}
function action(label, fn, cls) {
  const n = el('button', label, cls);
  n.type = 'button';
  n.onclick = async () => {
    n.disabled = true;
    try {
      await fn();
    } catch (e) {
      info(e.message, true);
    } finally {
      n.disabled = false;
    }
  };
  return n;
}
function field(label, control) {
  const l = el('label', label);
  l.append(control);
  return l;
}
function select(values, current, change) {
  const n = el('select');
  for (const v of values) n.add(new Option(v, v));
  n.value = current;
  n.onchange = () => change(n.value);
  return n;
}
async function api(path, body, key = crypto.randomUUID()) {
  const headers = { 'X-Khata': '1' };
  if (token) headers['X-Statement'] = token;
  if (member) headers['X-Member'] = member;
  if (body) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = key;
  }
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(70000),
  });
  if (!(response.headers.get('content-type') || '').includes('application/json'))
    throw Error('The server is waking. Retry shortly.');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed.');
  return data;
}
function table(headers, rows, nums = []) {
  const wrap = el('div', undefined, 'scroll'),
    t = el('table'),
    head = t.createTHead().insertRow();
  headers.forEach((h) => {
    const th = el('th', h);
    th.scope = 'col';
    head.append(th);
  });
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    r.forEach((v, i) => {
      const td = tr.insertCell();
      if (nums.includes(i)) td.className = 'num';
      if (v instanceof Node) td.append(v);
      else td.textContent = v;
    });
  }
  wrap.append(t);
  return wrap;
}
function stamp(e) {
  const reversed = e.reversal || book.entries.some((r) => r.reversal === e.id);
  const a = book.events
    .filter((v) => v.entry === e.id && ['Confirmed', 'Disputed'].includes(v.action))
    .at(-1);
  const text = reversed ? 'Reversed' : a?.action || 'Posted';
  return el('span', text, 'stamp ' + (text === 'Disputed' || reversed ? 'alert' : ''));
}
function totals(entries) {
  const net = {};
  for (const e of entries) {
    net[e.debit] = (net[e.debit] || 0) + e.amount;
    net[e.credit] = (net[e.credit] || 0) - e.amount;
  }
  return net;
}
function download(name, headers, rows) {
  const quote = (v) => {
    let s = String(v);
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const a = el('a');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + [headers, ...rows].map((r) => r.map(quote).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refresh() {
  book = await api(token ? 'statement' : 'book');
  draw();
}
function modal(e) {
  const node = $('detailBody');
  node.replaceChildren(
    el('p', 'Journal #' + e.id, 'kicker'),
    el('h2', e.note),
    stamp(e),
    el('p', e.date + ' · ' + money(e.amount)),
    el('p', 'Debit ' + e.debit + ' / Credit ' + e.credit),
  );
  for (const v of book.events.filter(
    (v) => v.entry === e.id && ['Confirmed', 'Disputed'].includes(v.action),
  ))
    node.append(el('p', v.action + ' · ' + (v.note || 'Customer reviewed entry')));
  if (book.role === 'owner' && !e.reversal && !book.entries.some((r) => r.reversal === e.id)) {
    const reason = el('input');
    reason.maxLength = 160;
    const dt = el('input');
    dt.type = 'date';
    dt.value = today;
    node.append(
      field('Reason for reversal', reason),
      field('Reversal date', dt),
      action('Post reversal', async () => {
        if (!reason.value.trim()) {
          reason.focus();
          return;
        }
        await api('reverse', { id: e.id, note: reason.value, date: dt.value });
        $('details').close();
        await refresh();
        info('Reversal posted. The original entry is preserved.');
      }),
    );
  }
  if (e.debit.startsWith('Due/') && e.credit === 'Sales') {
    node.append(
      action('Print sample invoice', () => {
        const invoice = $('invoice');
        invoice.replaceChildren(
          el('p', 'Fictional general store · Synthetic sample', 'kicker'),
          el('h1', 'Sales invoice'),
          el('p', 'Journal #' + e.id + ' · ' + e.date),
          el('h2', e.debit.slice(4)),
          table(['Description', 'Total'], [[e.note, money(e.amount)]], [1]),
          el('p', 'Total due on this sale: ' + money(e.amount)),
          el('p', 'Demonstration only. Not for statutory filing.'),
        );
        document.body.classList.add('printing-invoice');
        $('details').close();
        window.print();
        document.body.classList.remove('printing-invoice');
      }),
    );
  }
  $('details').showModal();
}
function ledger(page) {
  const bar = el('div', undefined, 'bar');
  bar.append(
    el('h2', 'Journal entries'),
    field(
      'Show',
      select(['All entries', 'Disputed', 'Reversed', 'Confirmed'], filter, (v) => {
        filter = v;
        shown = 16;
        draw();
      }),
    ),
  );
  page.append(bar);
  const list = book.entries.filter(
    (e) => filter === 'All entries' || stamp(e).textContent === filter,
  );
  page.append(
    table(
      ['Date', 'Debit account', 'Credit account', 'Amount', 'Status', 'Entry'],
      list
        .slice(0, shown)
        .map((e) => [
          e.date,
          e.debit,
          e.credit,
          money(e.amount),
          stamp(e),
          action('View #' + e.id, () => modal(e)),
        ]),
      [3],
    ),
  );
  if (!list.length)
    page.append(el('p', 'No entries meet this filter. Choose All entries to see the journal.'));
  if (list.length > shown)
    page.append(
      action('Show more entries', () => {
        shown += 25;
        draw();
      }),
    );
}
function statement(page) {
  const name = token ? book.customer : person,
    acc = 'Due/' + name;
  if (!token) {
    page.append(
      field(
        'Customer statement',
        select(book.customers, person, (v) => {
          person = v;
          draw();
        }),
      ),
    );
  }
  const rows = book.entries
    .filter((e) => e.debit === acc || e.credit === acc)
    .slice()
    .reverse();
  let running = 0;
  const lines = rows.map((e) => {
    running += (e.debit === acc ? 1 : -1) * e.amount;
    const r = [
      e.date,
      e.note,
      e.debit === acc ? money(e.amount) : '—',
      e.credit === acc ? money(e.amount) : '—',
      money(running),
      stamp(e),
    ];
    if (token) {
      const group = el('div');
      for (const a of ['Confirmed', 'Disputed'])
        group.append(
          action(a === 'Confirmed' ? 'Confirm' : 'Dispute', async () => {
            let note = '';
            if (a === 'Disputed') {
              note = prompt('What needs checking?');
              if (!note?.trim()) return;
            }
            await api('attest', { id: e.id, action: a, note });
            await refresh();
            info('Response recorded.');
          }),
        );
      r.push(group);
    }
    return r;
  });
  page.append(
    el('h2', name + ' · ' + money(running)),
    table(
      [
        'Date',
        'Description',
        'Debit',
        'Credit',
        'Balance',
        'Status',
        ...(token ? ['Response'] : []),
      ],
      lines.reverse(),
      [2, 3, 4],
    ),
  );
  if (!token && book.role === 'owner') {
    const linkArea = el('p');
    page.append(
      action('Create customer link', async () => {
        const result = await api('link', { customer: person });
        const a = el('a', 'Open ' + person + '’s statement');
        a.href = location.origin + '/#statement=' + result.token;
        a.target = '_blank';
        a.rel = 'noopener';
        linkArea.replaceChildren(a, document.createTextNode(' · expires in 24 hours'));
      }),
      action('Revoke customer link', async () => {
        await api('revoke', { customer: person });
        linkArea.replaceChildren();
        info('Customer link revoked.');
      }),
      linkArea,
    );
  }
  page.append(action('Print statement', () => print()));
}
function reconciliation(page) {
  page.append(
    el('h2', 'UPI statement'),
    el(
      'p',
      'Compare receipts with the posted book. Each suggestion shows the evidence used to match it.',
    ),
  );
  const upload = el('input');
  upload.type = 'file';
  upload.accept = '.csv,text/csv';
  const csv = el('textarea');
  csv.rows = 5;
  const example = book.entries.find((e) => e.debit === 'UPI/Bank');
  csv.value =
    'date,amount,narration\n' +
    example.date +
    ',' +
    (example.amount / 100).toFixed(2) +
    ',UPI ' +
    example.credit.slice(4) +
    '\n' +
    example.date +
    ',17.45,Unidentified';
  upload.onchange = async () => {
    const f = upload.files[0];
    if (f?.size > 50000) return info('Choose a CSV under 50 KB.', true);
    if (f) csv.value = await f.text();
  };
  const output = el('div');
  page.append(
    field('Upload a synthetic CSV', upload),
    field('Statement CSV', csv),
    action(
      'Compare receipts',
      async () => {
        const result = await api('reconcile', { csv: csv.value });
        output.replaceChildren(
          table(
            ['Date', 'Narration', 'Amount', 'Suggestion', 'Evidence'],
            result.map((r) => [
              r.date,
              r.narration,
              money(r.amount),
              r.match ? 'Journal #' + (r.match.ids ?? [r.match.id]).join(' + #') : 'Unmatched',
              r.match ? r.match.score + '/100 · ' + r.match.reasons.join(', ') : 'Manual review',
            ]),
            [2],
          ),
        );
      },
      'primary',
    ),
    output,
  );
}
let report = 'Trial balance';
function reports(page) {
  const net = totals(book.entries),
    names = [
      ...new Set([
        'Cash',
        'UPI/Bank',
        'Inventory',
        'Sales',
        'Purchases',
        'GST Payable',
        'Expenses',
        'Owner Capital',
        ...Object.keys(net),
      ]),
    ];
  const reports = [
    'Trial balance',
    'Profit and loss',
    'Balance sheet',
    'Daily cash book',
    'Receivables ageing',
    'Anomaly flags',
  ];
  page.append(
    field(
      'Report',
      select(reports, report, (v) => {
        report = v;
        draw();
      }),
    ),
  );
  let headers, rows;
  if (report === 'Anomaly flags') {
    headers = ['Entry', 'Flag', 'Reason'];
    rows = anomalyRows(book.entries);
  }
  if (report === 'Trial balance') {
    headers = ['Account', 'Debit (₹)', 'Credit (₹)'];
    rows = names.map((a) => [a, Math.max(0, net[a] || 0) / 100, Math.max(0, -(net[a] || 0)) / 100]);
    const total = Object.values(net).reduce((a, n) => a + Math.max(n, 0), 0) / 100;
    rows.push(['Total', total, Object.values(net).reduce((a, n) => a + Math.max(-n, 0), 0) / 100]);
  }
  if (report === 'Profit and loss') {
    const sales = -(net.Sales || 0),
      expenses = (net.Expenses || 0) + (net.Purchases || 0);
    headers = ['Line', 'Amount (₹)'];
    rows = [
      ['Sales', sales / 100],
      ['Expenses and purchases', expenses / 100],
      ['Net result', (sales - expenses) / 100],
    ];
  }
  if (report === 'Balance sheet') {
    const assets = names
      .filter((a) => a.startsWith('Due/') || ['Cash', 'UPI/Bank', 'Inventory'].includes(a))
      .reduce((sum, a) => sum + (net[a] || 0), 0);
    headers = ['Line', 'Amount (₹)'];
    rows = [
      ['Assets', assets / 100],
      ['GST payable', -(net['GST Payable'] || 0) / 100],
      ['Owner capital', -(net['Owner Capital'] || 0) / 100],
      ['Retained result', -((net.Sales || 0) + (net.Purchases || 0) + (net.Expenses || 0)) / 100],
    ];
  }
  if (report === 'Daily cash book') {
    const days = {};
    for (const e of book.entries.filter((e) => e.debit === 'Cash' || e.credit === 'Cash'))
      days[e.date] = (days[e.date] || 0) + (e.debit === 'Cash' ? e.amount : -e.amount);
    headers = ['Date', 'Net cash flow (₹)'];
    rows = Object.entries(days).map(([d, n]) => [d, n / 100]);
  }
  if (report === 'Receivables ageing') {
    headers = [
      'Customer',
      '0–30 days (₹)',
      '31–60 days (₹)',
      '61+ days (₹)',
      'Unapplied credit (₹)',
    ];
    rows = book.customers.map((n) => {
      const account = 'Due/' + n;
      let credits = 0;
      const dues = [];
      for (const e of [...book.entries].reverse()) {
        if (
          e.date > today ||
          e.reversal ||
          book.entries.some((r) => r.reversal === e.id && r.date <= today)
        )
          continue;
        if (e.credit === account) credits += e.amount;
        if (e.debit === account) dues.push(e);
      }
      const buckets = [0, 0, 0];
      for (const e of dues) {
        const used = Math.min(e.amount, credits);
        credits -= used;
        const days = (Date.parse(today) - Date.parse(e.date)) / 86400000;
        buckets[days <= 30 ? 0 : days <= 60 ? 1 : 2] += e.amount - used;
      }
      return [n, ...buckets.map((v) => v / 100), credits / 100];
    });
  }
  page.append(
    el('h2', report),
    action('Export CSV', () => download('synthetic-report.csv', headers, rows)),
    action('Print / save PDF', () => print()),
    table(
      headers,
      rows.map((r) => r.map((v) => (typeof v === 'number' ? money(Math.round(v * 100)) : v))),
      headers.slice(1).map((_, i) => i + 1),
    ),
  );
  if (!rows.length && report === 'Anomaly flags')
    page.append(el('p', 'No entries crossed the review thresholds.'));
  if (!rows.length && report !== 'Anomaly flags')
    page.append(
      el('p', 'No cash movements yet. Post a cash receipt or expense to populate this report.'),
    );
  if (book.role !== 'owner') return;
  const team = el('div'),
    role = select(['accountant', 'staff'], 'accountant', () => {}),
    out = el('p');
  team.append(
    el('h3', 'Team access'),
    field('Access role', role),
    action('Create team link', async () => {
      const r = await api('invite', { role: role.value });
      const a = el('a', 'Open ' + role.value + ' book');
      a.href = location.origin + '/#team=' + r.token;
      a.target = '_blank';
      a.rel = 'noopener';
      out.replaceChildren(a, document.createTextNode(' · expires in 24 hours'));
    }),
    action('Revoke team access', async () => {
      await api('remove-member', { role: role.value });
      out.textContent = 'Access revoked.';
    }),
    out,
  );
  page.append(team);
  const d = el('input');
  d.type = 'date';
  d.value = book.closed || today;
  page.append(
    el('h3', 'Period close'),
    el('p', book.closed ? 'Closed through ' + book.closed : 'All periods are open.'),
    field('Last date to close', d),
    action('Close period', async () => {
      if (confirm('Close all dates through ' + d.value + ' for this demo book?')) {
        await api('close', { date: d.value });
        await refresh();
        info('Period closed.');
      }
    }),
  );
}
function draw() {
  const page = $('page');
  page.replaceChildren();
  $('heading').textContent = token ? 'Customer statement' : tab;
  $('summary').textContent = token ? 'Customer copy' : book.entries.length + ' journal entries';
  $('nav').hidden = !!token;
  $('tray').hidden = !!token || tab !== 'Day book' || book.role === 'accountant';
  for (const n of $('nav').children) {
    n.hidden = book.role === 'accountant' && n.textContent === 'Reconciliation';
    n.setAttribute('aria-current', n.textContent === tab ? 'page' : 'false');
  }
  if (token || tab === 'Statements') statement(page);
  else if (tab === 'Day book') ledger(page);
  else if (tab === 'Reports') reports(page);
  else reconciliation(page);
}
function review(p) {
  const k = crypto.randomUUID();
  const acc = 'Due/' + p.customer;
  const sides = {
    'Credit sale': [acc, 'Sales'],
    'UPI receipt': ['UPI/Bank', acc],
    'Cash receipt': ['Cash', acc],
    'Cash sale': ['Cash', 'Sales'],
    Expense: ['Expenses', 'Cash'],
    Capital: ['Cash', 'Owner Capital'],
  }[p.kind];
  $('preview').replaceChildren(
    el('h3', 'Draft · ' + money(p.amount)),
    el('p', 'Debit ' + sides[0] + ' / Credit ' + sides[1]),
    el('p', p.date + ' · ' + (p.note || p.kind)),
    action(
      'Confirm and post',
      async () => {
        await api('post', p, k);
        $('preview').replaceChildren();
        await refresh();
        info('Entry posted to both accounts.');
      },
      'primary',
    ),
    action('Discard', () => {
      $('preview').replaceChildren();
      info('Draft discarded.');
    }),
  );
}
$('manual').onsubmit = (e) => {
  e.preventDefault();
  const v = $('amount').value.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v))
    return info('Enter rupees with up to two decimal places.', true);
  const [whole, f = ''] = v.split('.');
  const amount = Number(whole) * 100 + Number(f.padEnd(2, '0'));
  if (amount < 1 || amount > 100000000)
    return info('Amount must be between ₹0.01 and ₹10,00,000.', true);
  review({
    kind: $('kind').value,
    customer: $('person').value,
    amount,
    date: $('date').value,
    note: $('note').value,
  });
};
$('sentence').onsubmit = async (e) => {
  e.preventDefault();
  try {
    review(await api('draft', { text: $('phrase').value, date: $('date').value }));
    info('Review the proposed accounts and amount.');
  } catch (err) {
    info(err.message, true);
  }
};
for (const n of $('nav').children)
  n.onclick = () => {
    tab = n.textContent;
    info('');
    draw();
  };
async function openBook() {
  const run = ++sequence;
  try {
    info('Opening your synthetic book…');
    if (!token && !member) await api('session', {});
    await refresh();
    if (!token) {
      $('person').replaceChildren(...book.customers.map((n) => new Option(n, n)));
      $('date').value = today;
    }
    info('');
    $('retry').hidden = true;
  } catch (e) {
    if (run === sequence) {
      info(e.message, true);
      $('retry').hidden = false;
    }
  }
}
$('retry').onclick = openBook;
openBook();
