# Metalog

A minimal Defifa interface for percentage-change markets.

Source: [mejango/metalog](https://github.com/mejango/metalog).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3020. Requires Node 22.16 or later. The example curve works without a wallet or RPC. This directory is an independent Next.js app.

## Hosting

[Public example](https://metalog-production.up.railway.app/markets/example). Railway project `c708f483-caab-4951-bcd6-6becdc95a83e`, service `metalog`, uses the checked-in Dockerfile and `railway.json` to run the full standalone Next app. The configured site origin is `https://metalog.money`; Signa remains disabled until that origin is registered with Signa. The example does not mint positions.

After the checks below pass, publish this directory with `railway up --project c708f483-caab-4951-bcd6-6becdc95a83e --service metalog --environment production --ci`. Railway retains successful deployments for rollback; verify the public example and `/api/preview` after each release. Source uploads and Docker builds exclude environment files, dependencies and generated artifacts.

## What works

- Market definition with exact observation dates/rule, equal-width NFT ranges centered on zero and two overflow ranges. Creators choose the range width.
- Simple mean/deviation, Expressive coefficients and By range NFT counts retain independent drafts. One chart overlays the curve and allocation bars on the same percentage axis, with exact bucket details, overflow totals and two read-only positions columns without inner scrolling.
- Defifa launch and entry preparation, external-wallet review, simulation, receipt-effect verification and reload recovery.
- Signa connection using the shared SDK, enabled after origin/callback registration.
- Block-pinned market reads, circulating and reconstructed opening supply, ratified scorecard weights, and native JSON plus reproducible SIPmath export/preview.

The ratified Defifa scorecard controls payouts. There is no automatic oracle, exchange, invented trade history or price-derived probability feed. Governance, refunds, transfers and cash-out remain Defifa operations outside this initial interface. This is a foundation, not evidence of a tested real-wallet settlement lifecycle.

## SIPmath downloads

Use **Download SIPmath** in any forecast mode, or append `?format=sipmath` to the preview or individual market API. The file uses the canonical SIPmath_3_0 profile described by SIPmath 3.1: exact Metalog_1_0 curves, categorical tier lookups, reproducible HDR_2_0 streams and native audit data. Manual entries export tier categories; their curve remains reference evidence. No copula or within-range outcome is inferred. [Export semantics and compatibility evidence](docs/DESIGN.md#sipmath-export).

## Configuration

Copy `.env.example` to `.env.local` as needed. Public settings are fixed at build time.

`METALOG_MARKETS` is a comma-separated listing such as `8453:123,84532:456`. It is a curated list, not a chain index. Anyone can open a compatible market by its chain and project ID without listing it. Creation returns the shareable market URL.

Signa uses fixed `https://signa.center` / `https://api.signa.center` trust origins. Register the app origin and exact `/center/callback` URI with Signa, then set `NEXT_PUBLIC_SIGNA_ENABLED=true`. Its current connector supplies read-only Base account access. Defifa create/entry calls require an injected external wallet; there is no Para dependency or fabricated Signa arbitrary-signing route.

The default transports use public RPCs. `NEXT_PUBLIC_JBCENTER_URL` selects the shared SDK's Center RPC transport; that service must allow the site origin. `NEXT_PUBLIC_SITE_URL` supplies the server request origin. No private keys or API secrets belong in public environment variables.

Defifa addresses, minimized ABIs and runtime fingerprints are pinned in `src/lib/defifa-*`. Writes freshly verify the configured release and game invariants. These files were derived from local deployment artifacts; that does not establish that every chain is currently reachable. Public RPC failure remains an explicit error.

## Owners

| Location | Responsibility |
| --- | --- |
| `src/domain` | Distribution, exact range boundaries, allocation, definition validation |
| `src/lib/defifa*` | Pinned deployments, native Defifa calls, chain evidence and receipt effects |
| `src/lib/transaction.ts` | Shared SDK execution adapter and durable transaction evidence |
| `src/lib/wallet*`, `src/providers` | One chain/RPC policy, wagmi, Query, lazy Signa and connection state |
| `src/lib/forecast.ts`, `market-data.ts` | Identical UI/API interpretation and native export |
| `src/domain/sipmath.ts`, `src/lib/sipmath*.ts` | HDR/lookup math and shared SIPmath output with audit evidence |
| `src/components`, `src/app` | Forms, SVG, routes and plain presentation |

Reference architecture: current Sticky `web/` and Homerun's Next client; SDK core 2.25.0 and connect 0.5.6. App-specific adapters use the shared SDK owners instead of copying the sibling transaction engines. [Design and mechanics](docs/DESIGN.md) records decisions and limitations.

## Checks

```sh
npm run check          # lint, typecheck, unit/adversarial tests, production build
npm run test:browser   # production server on 3020; Playwright Chromium required
```

Browser tests cover the example, sequential decimal typing, raw inputs, dragging/keyboard controls, create definitions, wallet chooser, responsive layout and query endpoints. Adapter tests model chain evidence and decode real ABIs; they do not represent a submitted transaction. No real Signa passkey or external-wallet transaction was performed during foundation development.

If a wallet send becomes uncertain, preserve its saved record. Recovery checks the original hash and exact chain/account/calldata/value and verifies Defifa effects before clearing it. It never retries the send. Wrapped smart-account/Safe transactions are not a supported execution lane yet.
