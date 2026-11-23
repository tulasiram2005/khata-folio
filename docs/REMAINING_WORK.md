# Remaining release gates

This is a runnable portfolio demo. The complete production-style specification in BRIEF.md and MASTER_PROMPT.md has open work.

- Durable hosting requires a configured replica set, indexes and least-privilege app credentials, including insert-only permissions on journal and audit collections. Replica-set validators enforce document shape, not immutability under privileged direct database writes.
- Team and customer access use expiring bearer links. Registered identities, rotating refresh families, verified email, password recovery, account export/deletion and retention cleanup remain open. The disposable demo currently caps the number of seeded shops. Redeployment reclaims its SQLite storage.
- A real local-model inference run and evaluation on independently authored utterances remain open. The grammar fixture measures supported sentence patterns only. Voice input, complete translated UI and offline synchronization remain open.
- Reconciliation currently compares one upload at a time and does not persist reviewer acceptance. Auditing rejected back-dated posting attempts, signed month-end snapshots, UPI intent/QR and statutory GST calculations remain open.
- Encrypted scheduled off-site backups and a hosted restore drill, production monitoring, pagination and load budgets remain open. The tested snapshot restore applies to SQLite locally.
- Further release gates include the full ASVS review, CodeQL/Semgrep, k6, Lighthouse, all-screen visual critique and manual assistive-technology testing. The web client is hand-written browser JavaScript, not React/TypeScript. A production security or accessibility certification has not been performed.
