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
