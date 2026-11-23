# Discussing the demo

**How do the books balance?** Each paired entry has one positive paise amount, a debit account and a different credit account. Multi-leg compound entries are outside the current journal model.

**What happens on retry?** The key, request fingerprint and response are saved in the same transaction as the posting. Identical retries return its first result. A changed payload conflicts. The Mongo test races eight calls with the same key.

**What does a dispute change?** It appends a chained event visible on the owner's book. Balances continue to derive from posted entries and reversals. A bearer link establishes possession of that link, not legal proof of identity.

**Why two databases?** SQLite lets reviewers try the whole demo immediately. The native MongoDB adapter demonstrates concurrent transactional writes against a real replica set without requiring every visitor to open an Atlas account.

**Where does inference stop?** The provider can return a validated proposal only. The posting route needs a user-confirmed command. The hosted parser recognizes a bounded grammar. Accuracy on open-ended speech or text remains unmeasured.

## Resume wording

- AI full-stack: Built a draft-only multilingual shop-entry workflow with human confirmation, a validated local-model adapter and a deterministic fallback evaluated on 60 synthetic fixtures.
- Backend: Implemented integer-paise double-entry posting, idempotency, reversals and period close; verified 1,000 generated journals and concurrent retries against a MongoDB replica set.
- Product: Designed a mobile passbook linking customer disputes, explainable UPI matches and trial balance reports; exercised the browser journey and accessibility checks in CI.
