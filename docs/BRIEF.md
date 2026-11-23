# PROJECT BRIEF 2: LEDGERLINE (working title, run a name-clash check first)

One line: double-entry bookkeeping for small Indian shopkeepers who already think in "khata" (credit ledgers), where the customer can confirm or dispute every entry, UPI statements reconcile with explainable matching, and AI only ever proposes entries, never posts them.

## Why it exists
Small shops run on informal credit. Disputes ("I already paid") destroy trust, books are single-entry notebooks, and UPI payments are matched to dues by memory. Existing khata apps focus on reminders. This project focuses on correctness and trust: a real accounting core, counter-signed entries, and reconciliation you can explain.

## Honest prior art (verify and document in PRIOR_ART.md)
Khatabook, OkCredit and similar apps exist, as do accounting suites such as ERPNext. Do not claim to beat them. The difference to prove: an invariant-enforcing double-entry core in a small MERN app, customer attestation links with no login, explainable reconciliation scores, and an AI proposer under hard invariants. Say clearly this is a student project on synthetic data, not statutory accounting or tax software, and do not handle real money.

## Users and jobs
- Shopkeeper: record sales, credit and payments quickly (including by typing or speaking in English, Hindi, Telugu or Tamil), see who owes what, reconcile UPI receipts, print an invoice.
- Customer: open a link, see their balance and entries, confirm or dispute, no account needed.
- Accountant or relative: read-only access to reports.

## Features (priority order)
P0
1. Shops, users, roles (owner, staff, accountant read-only). Chart of accounts auto-created: Cash, UPI/Bank, Receivables (a sub-account per customer), Inventory, Sales, Purchases, GST Payable (simplified), Expenses, Owner Capital.
2. Ledger core: immutable journal entries with lines; invariant that debits equal credits in integer paise; no edits, only reversal entries with a reason; period close; idempotency keys on every write; MongoDB multi-document transactions; optimistic concurrency on account balances or derived balances recomputed from entries; a test that proves the books always balance under random operations (property-based).
3. Quick entry: a form-first fast entry screen plus natural-language entry ("Ravi took 500 on credit", "Ravi ne 500 udhaar liya"). The AI parses into a DRAFT journal proposal with a plain explanation; the user must confirm. Voice input via the browser Web Speech API where supported.
4. Customer khata link: signed, expiring, revocable link showing the customer's statement. Customer can confirm or dispute each entry with a note; dispute freezes nothing but flags the entry and notifies the shop. Attestations are stored and hash-chained.
5. Reports: trial balance, profit and loss, simple balance sheet, receivables ageing, daily cash book. CSV and PDF export. Indian number grouping (12,34,567.00) and rupee formatting.
P1
6. UPI/bank statement reconciliation: upload CSV, parse with a tolerant parser, match to receivables using exact, many-to-one and fuzzy rules. Each match shows a score and the reasons (amount, date window, name similarity, reference text). Unmatched queue. Deterministic engine; AI may only explain, not decide.
7. Anomaly flags (deterministic): duplicate-looking entries, round-number spikes, unusually large amounts via robust MAD score, back-dated entries after period close attempts.
8. Simplified GST-style invoice PDF with a clear "not for statutory filing" mark; UPI collect link/QR using the standard `upi://pay` intent format (no gateway, no money movement; mark paid manually or via reconciliation).
P2 (stretch)
9. Offline-first PWA: queue entries in IndexedDB with idempotency keys and sync, conflict handling shown to the user.
10. Month-end "close the books" checklist with a signed trial balance snapshot.

## AI layer
Provider abstraction with mock fallback. Tools, strictly typed: `find_customer(name)`, `propose_entry(type, customer_id, amount_paise, date, note)`, `explain_match(match_id)`, `summarize_receivables()`. `propose_entry` returns a draft only; posting is a separate human-confirmed API with idempotency. The model never sees more customer data than needed for the request. Evals: 60 multilingual utterances (English, Hindi, Telugu, Tamil, mixed), labelled synthetic, scored on correct amount, direction and customer resolution; report mock and real-provider results separately. Injection cases include hostile text in customer names and statement narration.

## Data model (Mongo collections)
shops, users, memberships, accounts, customers, journal_entries (with embedded lines, immutable), reversals link, attestations, statement_uploads, statement_rows, matches, invoices, anomalies, share_links (hashed tokens), audit_events (hash-chained), idempotency_keys, jobs. Provide indexes and reasons. Money is always integer paise, never floats.

## Security focus specific to this project
Immutability enforced in code and in DB validators; idempotency under retries; transaction isolation tests; signed customer links with scoped read plus attest only; statement CSV formula injection and encoding attacks; field-level encryption for customer phone numbers; strict tenant isolation tests (shop A can never read shop B); amount limits and sanity checks; rate limits on link endpoints; audit of every post and reversal; synthetic data only.

## Art direction (starting point)
"A passbook and a cash book, made precise." Cover green `#17352B`, paper `#EEE6D3`, blue-black ink `#1B2340`, ruled-line blue `#8FA3C7`, margin rule red `#C23B22` used for reversals and disputes, stamp vermilion for status marks. Ruled-paper table rows with a vertical double rule between Debit and Credit columns, lining tabular numerals, right-aligned amounts, running balance column. Status shown as rubber-stamp marks (POSTED, REVERSED, DISPUTED, CONFIRMED) with slight rotation, used only on entries and invoices. Type: Hanken Grotesk for interface, Literata for headings and names, JetBrains Mono for amounts; Noto Sans/Serif Devanagari, Telugu and Tamil for local scripts, tested for line height and shaping. Layout: a left spine of accounts like a ledger index, a wide statement pane in the centre, a narrow "proposal tray" on the right where AI drafts wait for confirmation. Signature element: the "proposal tray", drafts shown as pencil-style lines that turn to ink when confirmed. Mobile first (shopkeepers use phones): a thumb-reachable quick-entry bar, large touch targets, Hindi/Telugu/Tamil UI toggle. What it refuses to be: a fintech purple gradient dashboard, a KPI tile wall, or a chat bubble UI.

## Seed data and demo story
One synthetic general store ("clearly fictional") with 40 customers, 6 months of entries, three disputed entries, two reversals, a statement CSV with tricky narration, and one customer link. The demo: type a Hindi credit sentence, confirm the draft, open the customer link on a phone, dispute an entry, reconcile a statement, watch the trial balance stay balanced.

## Gap-bridging this project demonstrates
Financial-domain correctness (double entry, idempotency, reversals, period close, reconciliation), MongoDB transactions and validators, money handling, multilingual input and fonts, PDF generation, PWA and offline sync (stretch), human-in-the-loop AI with hard invariants, a property-based test suite that proves an invariant.

## Measurements to record (real only)
Property-test iterations and invariant results, transaction throughput locally and deployed under k6, reconciliation precision and recall on a synthetic labelled statement set, multilingual parsing accuracy on the golden set (mock vs real), test counts, Lighthouse scores on mobile emulation.
