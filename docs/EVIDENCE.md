# Verification · 24 November 2026 (Asia/Kolkata)

| Command or check | Observed result |
| --- | --- |
| npm test | 12 passing Node tests. Includes 1,000 seeded property runs, 60 supported-pattern multilingual fixtures, 20 rejection fixtures, HTTP authorization, close/reversal logic, reconciliation, local-model adapter with simulated transport and a SQLite snapshot restore with chain verification. |
| MONGOMS_DOWNLOAD_DIR=/private/tmp/khata-mongo npm run test:mongo | Real MongoDB 7.0.24 replica set started locally. Eight concurrent identical posts produced one new entry. Closed-period write rejected and count preserved. |
| npm audit | Zero known dependency vulnerabilities reported at the time of the check. |
| gitleaks git --staged --redact --no-banner | Staged repository content scanned before publication. |
| npm run test:browser | Passed on GitHub's Ubuntu runner with Chrome. Posted a reviewed proposal, disputed from a second browser context, matched a receipt, opened trial balance, ran four axe scans, and checked journal overflow at four widths in light and dark themes. Local macOS sandbox blocked the Chrome process launch. |
| TEST_URL=https://khata-folio.onrender.com node test/live.js | Public HTTPS app, ready endpoint, CSP and HSTS, draft isolation, idempotent posting, statement scoping, dispute and receipt matching passed in an isolated synthetic shop. |

[Integration and browser CI run](https://github.com/tulasiram2005/khata-folio/actions/runs/45250477273). Browser scans cover the tested states and rules. No production latency, model accuracy, business impact or active user figures were measured.
