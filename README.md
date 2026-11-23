# Khata Folio

A double-entry passbook for a fictional Indian general store. A shopkeeper reviews each proposal before posting, and customers can confirm or dispute their own entries.

**[Open the live demo](https://khata-folio.onrender.com/)** · [Verification workflow](https://github.com/tulasiram2005/khata-folio/actions/workflows/check.yml) · [Remaining work](docs/REMAINING_WORK.md)

## Try the shopkeeper workflow

1. Open the demo. Your browser receives a separate synthetic shop.
2. In the proposal tray, enter `Ravi ne 500 udhaar liya`. Review the debit to Ravi's receivable and credit to Sales. Choose **Confirm and post**.
3. Open **Statements**, select Ravi and create a customer link. Open it in a private window. Dispute the entry with a short note, then refresh the owner's view.
4. Open **Reconciliation** and compare the sample CSV. Inspect the journal reference and scoring reasons. Ambiguous receipts stay in the unmatched queue.
5. Open **Reports** to inspect the trial balance, income statement, balance sheet, daily cash book or FIFO receivables ageing. Export a CSV or print to PDF. Team access and period close are available to the owner.

The journal supports credit sales, cash and UPI receipts, cash sales, expenses and capital. Corrections use dated reversals. A credit sale has a printable synthetic invoice under **View**. Staff can post and reconcile. Accountants have read-only access. All payment records are synthetic.

## How it runs

The browser calls a same-origin Express API. The ledger represents each posting as one positive integer amount in paise shared by a debit and a credit account. The transaction stores the entry, audit event and retry result together. Run the demo with embedded SQLite or select a MongoDB replica set with MONGODB_URI. [Architecture and trust boundaries](docs/ARCHITECTURE.md) · [Prior art](docs/PRIOR_ART.md)

Node 22.16+ and npm are sufficient locally.

```sh
npm ci
npm start
```

Open http://127.0.0.1:4173. The first visit seeds your shop. The local database is folio.sqlite. PORT and DB_PATH are optional. The deployment uses GitHub and Render Free. [Account setup and limits](docs/SETUP_ACCOUNTS.md)

## Verification

```sh
npm test
npm run test:mongo
npm audit
# With the app running and Chrome installed:
npm run test:browser
TEST_URL=https://khata-folio.onrender.com node test/live.js
```

The Mongo integration starts a real temporary replica set. The browser suite visits the owner and customer views in separate browser contexts. The live smoke test creates an isolated synthetic book. [Recorded evidence](docs/EVIDENCE.md)

## Limits and authorship

The public service sleeps and loses its SQLite books on sleep or redeployment. Anyone holding an unexpired team or customer link can exercise its permissions. The account owner should use only fictional records. The hosted natural-language input uses a deterministic grammar with Latin-script customer names. A localhost-only Ollama adapter supports additional drafts when explicitly configured. Its tests use simulated model transport. Free-form model accuracy and statutory accounting suitability have not been established.

Built with Codex under human direction. The project owner supplied the brief, selected the free-only constraint and authorized repository publication. Codex implemented, tested and deployed this demonstration.

[MIT license](LICENSE)
