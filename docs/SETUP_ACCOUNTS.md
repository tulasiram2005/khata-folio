# Accounts, plugins and cost

Run the app locally with Node 22.16+ and npm. No account, API key, database installation or browser plugin is required. Browser tests use Google Chrome. The Mongo integration test downloads the community server and starts a temporary single-node replica set.

The live demo uses the project's existing GitHub account and Render Free web service. On 24 November 2026 the Render workspace showed Hobby with no payment method. Free hours, build minutes and bandwidth are shared by the workspace. Render sleeps idle Free services after 15 minutes and clears the local disk on sleep, restart or redeployment. Without a payment method, exceeding included bandwidth can suspend other Free services in that workspace. Keep the workspace card-free and choose Free if recreating this service. No keep-alive traffic is configured. [Render free-service terms](https://render.com/docs/free)

## Optional persistence

Supply a MongoDB replica-set URI through Render → Khata Folio → Environment → Add environment variable → MONGODB_URI. MONGODB_DATABASE selects a dedicated database. A self-hosted community replica set also works. An Atlas account is optional. If choosing Atlas, select Free, keep billing disabled and restrict database access to the service's outbound addresses. Never paste the URI into an issue, chat message or Git file. Selecting Mongo creates a separate demo store. It does not migrate SQLite data.

A new reviewer can open the public URL directly. Email, payment processing, cloud LLM accounts, Redis, Sentry and paid hosting are unnecessary for this release.
