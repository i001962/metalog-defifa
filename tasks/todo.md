# Market page design pass (stage focus, Seurat palette)

Resources: `/Users/jango/Documents/jb/v6/evm/AGENTS.md`, `tasks/lessons.md`, `workflow/ponytail/SKILL.md`, `docs/PLAN_REFINEMENT.md`; local `AGENTS.md`, `docs/DESIGN.md`. Isolated worktree `../metalog-design` on `design/market-stage-focus` from e552516; dirty `main` checkout untouched.

- **Outcome:** Full-width market page that shows one thing at a time: the panel that matters for the current game stage, with the rest one tab away. Orange tint and palette from Seurat's *Parade de cirque*; data viz over prose.
- **Owners:** Presentation only (`src/components`, `globals.css`). No domain, chain, calldata or transaction change. Stage comes from `MarketSnapshot.stage`; crowd shares reuse `marketData` and `positionDensities`.
- **Rules kept:** No auto-switch of the open panel when a refresh changes the stage (drafts stay in view). Panels stay mounted (`hidden`) so drafts and selections survive tab changes. Square corners, input sizes and accessible names stay.
- **Verification:** `npm run check`, full browser suite desktop + mobile, screenshots per stage.
- **Recovery:** Branch only; no merge without jango.

- [x] Theme tokens, pointillist paper, full-width layout
- [x] Stage lamps (stage + schedule + countdown)
- [x] Stage-focused tabs in MarketView; lifecycle split into panels
- [x] Crowd chart (stake share, ratified payout overlay), crowd line on your chart
- [x] Forecast editor as canvas + ticket
- [x] Tests updated, check + browser suite green, screenshots reviewed

Review: `npm run check` passes; browser suite 56/56 (desktop + mobile) after updating tests for tabs (entries, timing), the collapsed positions table and the new ink color. Timing test now also asserts a stage change does not switch the open panel. One real regression caught and fixed: the positions summary shifted the ticket 0.5px on mobile while editing. Stage screenshots reviewed for entry, observation, results and complete at 1440px and iPhone 13.


# Shared Defifa SDK owners

Resources: `/Users/jango/Documents/jb/v6/evm/AGENTS.md`, `/Users/jango/Documents/jb/v6/evm/tasks/lessons.md`, `/Users/jango/Documents/jb/v6/evm/workflow/ponytail/SKILL.md`, `/Users/jango/Documents/jb/v6/evm/workflow/ponytail/README.md`, `/Users/jango/Documents/jb/v6/evm/docs/PLAN_REFINEMENT.md`; local `AGENTS.md`, `README.md`, `docs/DESIGN.md` apply. Isolated `refactor/shared-defifa-sdk` starts at2084a48; dirty parent stays untouched.

## Plan refinement
- **Objective:** Remove duplicate Defifa metadata and cumulative holdings rules from Metalog without changing its observable behavior, configured Oracle/delegate, memo, recovery or authority.
- **System fit:** Released SDK owns native payload/envelope encoders and authenticated bounded holdings. Metalog retains market verification, allocation, explicit delegation policy, receipt effects, lifecycle and JSON serialization.
- **Reuse and simplicity:** Entry wrapper supplies existing implementation, exact repeated tier IDs and explicit `defaultAttestationDelegate ?? beneficiary` to `buildDefifaPayMetadata`; cash-out wrapper delegates existing implementation/IDs to `build721CashOutMetadata`; holdings wrapper adapts `getDefifaHoldings(limit200)` output to existing decimal strings/cursor. No new UI, protocol or capability.
- **Evidence and unknowns:** SDK PR202 is merged and official core2.29.0 is installed with its verified registry tarball integrity. Existing Metalog byte/delegate/manual/curve/recovery and burned-hole/pagination fixtures establish behavior; dependency verification must use the official exact locked release rather than an unpublished preview.
- **Verification:** Add full-byte pre-migration equivalence assertions and prove the baseline before swapping owners. After official dependency release, run relevant exact-byte/receipt/holdings tests, required `npm run check` and browser suite. New SDK authentication must keep missing-token/RPC distinctions and the original pinned snapshot.
- **Resource budget:** One isolated checkout, two source adapters, narrow existing tests and exact package lock. No public-chain sends, pins or publication here; root owns review/release. Replan on a real SDK/mock protocol boundary mismatch rather than weakening authentication.

- [x] Prove full-byte and holdings baseline equivalence fixtures.
- [x] Replace local encoding/scanning bodies with SDK owners and preserve adapters.
- [x] Lock official SDK release and complete required tests/check/browser evidence.

Baseline evidence: before migration65Defifa/lifecycle/Entries tests passed with full-byte assertions for beneficiary and configured Oracle pay metadata and sorted-ID cash-out metadata. Source adapters prepared against merged SDK API; existing holdings fixture extended with exact native project owner, clone bytecode/reporters/store and pinned identity reads so after release it tests the real shared reader rather than mocking holdings. Official exact locked dependency checks remain pending.

## Review

Official core2.29.0 registry integrity matches the SDK release receipt (`sha512-1EnCA+O8V8UEKOl5Gh9hAQR63OYUAkLn4gG2VrQfAy2ueoRFxNTJmQvzJQkJd9TQMMrS9LvzCv8ZV8TOjAY2pA==`). Initial cached ETARGET was resolved using a fresh task cache after registry propagation; no preview package was used. Minimal lock changes only SDK version/tarball/integrity and passes `npm ci`. All65 relevant equivalence tests pass after migration, matching the65-test pre-migration proof. Required `npm run check` passes lint, typecheck,211unit tests and production build; all56 production desktop/mobile browser cases pass on isolated port3130. Evidence: `/tmp/metalog-sdk-owners-before.log`, `/tmp/metalog-sdk-owners-after.log`, `/tmp/metalog-sdk-owners-check.log`, `/tmp/metalog-sdk-owners-browser.log`. Dirty parent is untouched, and no public-chain sends/pins occurred. Root owns hosted CI review, merge and publication.

# Order book UI during play (2026-10-13)

Resources: `/Users/jango/Documents/jb/v6/evm/AGENTS.md`, `/Users/jango/Documents/jb/v6/evm/tasks/lessons.md`, `/Users/jango/Documents/jb/v6/evm/workflow/ponytail/SKILL.md`, `/Users/jango/Documents/jb/v6/evm/workflow/ponytail/README.md`, `/Users/jango/Documents/jb/v6/evm/docs/PLAN_REFINEMENT.md`; local `AGENTS.md`, `README.md`, `docs/DESIGN.md` apply.

## Plan refinement
- **Objective:** While a game is in play, the Market tab keeps the opening spread and adds a per-range order book (bids, asks, buy, sell, place bid, place ask) and book-implied odds. jango ruled UI only for now; the book closes at observation end. Venue (Seaport on-chain vs off-chain vs new contract) is unresolved and out of scope.
- **System fit:** Outcome is a design to judge, not executable trading. Capability: a typed `RangeBook` read owned by `src/lib/book.ts`, which returns no venue in production and a labeled sample only under `next dev`. Evidence: implied odds derive from the book plus on-chain supply and pot. Prepared action/authority: none; every order control stays disabled with "No trading venue is connected yet." Lifecycle, entry, payout and transaction owners are unaffected.
- **Reuse and simplicity:** Reuse PositionChart's second-number label for opening → book odds, the existing pip/hint/table styles and the stage owner (`STEP`/stage). One new pure owner `src/domain/book.ts` for implied odds (price x range supply / pot) so UI never computes it. No new dependency.
- **Evidence and unknowns:** DESIGN.md forbids fabricated live curves; so production shows no odds or levels, only the empty book. Implied odds assume the range takes the whole pot; weighted scorecards make it an upper-bound reading, stated in one short hint. Unknown: venue, fees, WETH, settlement.
- **Verification:** Unit test for implied odds (mid, missing side, zero pot/supply, clamp). Browser test: trading stage shows the book with disabled controls and no sample data in a production build; existing suites stay green. Screenshot the dev sample.
- **Resource budget:** One domain module + test, one book component, one lib reader, MarketView wiring and CSS. No contract, backend or chain writes. Replan if the book needs data the snapshot does not carry.

- [x] Domain implied-odds owner + unit test.
- [x] Book reader (none in production, labeled dev sample) and OrderBook component wired into Market tab during play.
- [x] Chart shows opening → book odds when the book has prices.
- [x] Browser test for production empty/disabled book; full suites; screenshots; push.

## Review

Implemented as UI only. `src/domain/book.ts` owns implied odds (3 unit tests). `src/lib/book.ts` returns no book in production and a labeled sample under `next dev`. `OrderBook` shows per-range odds, best bid/ask in USD (ETH until the price loads), depth, and place-bid/place-ask forms, all disabled with "No trading venue is connected yet." The chart reads "opening share → book odds" while in play. ETH/USD moved to `src/lib/eth-usd.ts` (one owner for the pot and book). Production build: 63 browser cases (new one asserts no sample data and disabled Buy/Sell/Review bid in play, no book during entry) and 217 unit tests pass. Venue, settlement and fees are open; nothing transacts.
