# Metalog

Read [README.md](README.md) for setup and checks, and [docs/DESIGN.md](docs/DESIGN.md) for architecture, mechanics and limitations. Paths in these instructions are relative to this repository.

For non-trivial changes, write a short checkable plan covering the outcome, affected owners, evidence, execution authority, verification and recovery. Update it when findings change, and record the result. Pass the relevant repository instructions and plan into delegated work.

Search for existing implementations first. Prefer native APIs and installed dependencies, keep each rule in one owning module, and make the smallest complete change. Fix root causes and preserve unrelated work.

After `npm ci`, read applicable Next guides in the installed `node_modules/next/dist/docs/` directory before changing framework code.

Keep the interface plain and responsive. Probability, allocation and validation rules belong in `src/domain`; chain evidence and calldata in `src/lib`. Import shared SDK wallet and review primitives. The ratified Defifa scorecard controls payouts. Never present drafts, simulated transactions, mint counts or missing trading quotes as verified forecasts or completed actions.

For code changes, run `npm run check` and relevant browser tests. For documentation-only changes, verify referenced files and links and run `git diff --check`. Report the checks performed and any unresolved limitations; do not claim unverified behavior works.

No real-value transaction or publication is implied by local development.
