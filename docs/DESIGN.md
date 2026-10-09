# Metalog foundation

## Accepted decisions

Each market is one native-token Defifa game. The creator records the question, source, observation rule, UTC times and fixed range width before entry. Users choose their stakes. The opening distribution is stake-weighted. Equal-width finite ranges are centered on zero; two outer tiers cover all outcomes beyond that interval, including changes beyond ±100%. **The ratified Defifa scorecard is the payout authority.** Metalog does not replace it with a frontend winner-bin or automatic no-contest rule.

The first interface has four destinations: markets, create, a market with its curve editor, and data. The question and observation dates lead; rules expand in place. Simple selects mean/deviation; Expressive selects six labeled coefficient fields; By range selects exact NFT counts. Each editor retains its own draft. Exact positions fill two equal-width read-only tables in canonical range order, stacked on small screens, with no inner scrolling. Native inputs, one SVG combining density and allocation, and plain CSS with square corners suffice. The shared wallet dialog uses the same square theme. There is no marketing section, custom font, image pipeline, chart library or database.

## Outcome, evidence and execution

1. A validated market definition produces exact tier labels and an encoded JSON data URI. The native launch stores this definition in project/collection metadata. The launch has equal-price native ETH tiers, no reserves and no organizer splits.
2. Mean/standard deviation or raw coefficients produce a single curve. The domain owner computes each tier's CDF mass and deterministic integer quantities; users can then edit bucket quantities directly. Manual quantities determine the stake and histogram, while the curve remains a reference. The UI and API consume the same allocation owner.
3. The Defifa adapter verifies deployment/game identity, protocol configuration, current phase, native price, remaining supply and creation fee. It prepares exact calldata/value and readable terms. A bounded entry memo records coefficients and count; manual entries also record exact quantities and their mode in a version-2 memo. Recovery retains support for version-1 curve entries. Defifa does not itself enforce curve validity.
4. The shared SDK owns review, account/chain checks, fresh revalidation, simulation and the one wallet send. The app persists uncertainty before opening the wallet. Explicit rejection may release an unsent record; timeout cannot.
5. Success requires a canonical receipt for the exact reviewed transaction and matching Defifa effects. Launches prove the creator and definition; entries prove every expected NFT mint. Reload recovery reconstructs the same effect checker from saved bytes and never sends again.
6. Public views and JSON expose chain/block evidence. Missing reads, quotes and settlement are not represented as zero or success. Tests own the formulas, trust boundaries and recovery rules.

The shared reference clients include additional transports and workflows. This foundation consumes their SDK and provider architecture for its supported direct-write lane; it does not claim Safe, Relayr or omnichain execution parity for flows it does not offer.

## Probability and range semantics

Coefficients use percentage points, so 2.5 means +2.5%. With `z=p−½` and `L=log(p/(1−p))`, the six-term quantile is:

```text
Q(p) = a1 + a2 L + a3 zL + a4 z + a5 z² + a6 z²L
```

Basic controls generate `[μ, σ√3/π, 0, 0, 0, 0]`, an exact logistic Metalog with the requested mean and deviation. This is not labeled a normal distribution. The API accepts 2–6 finite coefficients, padded to six; the editor exposes six decimal/scientific fields with full precision. Their labels are Median, Base spread, Tail asymmetry, Middle spread, Shape asymmetry and Tail spread. The latter five describe interacting basis effects, not independent statistical moments; a1 is exactly the median. The global derivative certificate in `distribution.ts` accepts a conservative feasible subset; some valid shapes are refused with “could not be verified.” Sampled positivity is not a proof of a valid quantile function.

Incomplete text drafts remain editable. Each mode retains its own last valid display evidence, with a visible retained-preview label; retained bars cannot be dragged over an incomplete draft. Current validity alone gates export and submission. Expressive seeds coefficients and stake only on its first visit; By range seeds quantities and reference coefficients only on its first visit. Returning to any editor restores its own values, including invalid text. Simple and Expressive stakes are independent; the By range stake comes from its counts. Typing within a mode never unmounts its controls or the positions table. The author's [equations](https://www.metalogdistributions.com/equations.html) and [paper, section 3.3/Table 2](https://www.metalogdistributions.com/images/TheMetalogDistributions.pdf) distinguish median, collective scale and shape effects.

CDF uses centered bisection. Range mass is `CDF(upper)−CDF(lower)`. One chart overlays the interval-average curve density and finite NFT bars on a continuous percentage axis and shared density scale. Each bar uses its true range width and height `NFT share / range width`, so its area represents that share. The fixed viewport is the market's finite range interval, preserving a stable scale while editing without clipping partial tiers. Both infinite tails appear as exact count/share summaries outside the plot, never density bars with fabricated widths. Curve samples preserve narrow spikes through CDF integration over display intervals. Hover, focus or tap shows exact finite range/count/share details. Drag and keyboard controls still adjust automatic curves. Manual bars are edited through By range; their overlaid curve is explicitly a reference. The table separately reports underlying curve probabilities and acquired NFT shares.

Market definitions require `rangeCount` and `rangeWidth` in percentage points. For odd total count X (3–61, default 21) and width w (0.01–100, at most 2 decimals, default 1), the X−2 finite ranges span `−(X−2)w/2` through `+(X−2)w/2`, centered on zero. The two outer tiers contain all overflow. The default 21 tiers therefore give 19 one-point ranges from −9.5% to +9.5%, with a −0.5% to +0.5% middle tier. Boundaries use the existing canonical four-decimal precision and match their labels. Membership is lower-inclusive / upper-exclusive, assigning exact boundaries to the higher tier. This is the sole prototype schemaVersion 1 model; no legacy range model or migration is supported. Allocation, metadata, tier creation and onchain verification all consume the same range owner.

For budget B and uniform price c, position count is `N=floor(B/c)` using bigint. Hamilton apportionment allocates floors of `N×mass` then remaining positions to the largest fractional remainders, with tier-ID tie breaking. The payment is exactly `N×c`; unspent remainder stays in the wallet. The 200-NFT per-entry ceiling bounds the payload, but successful simulation is still required. The preview reports total variation `½Σ|count/N−mass|`. Tiny probabilities can receive zero NFTs.

Equations and feasibility context: [Metalog author’s equations](https://www.metalogdistributions.com/equations.html), [moments](https://www.metalogdistributions.com/moments.html), [feasibility](https://www.metalogdistributions.com/equations/feasibility.html). The conservative certificate and renderer checks are implemented and tested locally.

Manual counts are dense, non-negative safe integers in canonical range order, totaling 1–200. Their total sets the exact read-only stake; editing never redistributes other buckets. The editor retains incomplete or invalid counts so users can correct them, but disables export and submission. Switching tabs preserves manual counts and each automatic draft. Numeric counts can still be charted when their total is outside the allowed entry bounds; syntax-invalid drafts retain their last valid bars. The manual overlay explicitly labels the fixed reference curve from the initial allocation; the bars report average density within each finite range without claiming a smooth distribution for edited positions. `allocation.mode` distinguishes curve and manual drafts, and the reported difference from the reference curve is not called a rounding error for manual edits.

## Lifecycle

| Product phase | Defifa evidence | User-facing meaning |
| --- | --- | --- |
| Countdown | Future mint opening | Inspect rules and prepare a curve |
| Entry | MINT | Mint integer positions; Defifa refunds are possible |
| Trading | SCORING, before observation end | No new entries; existing NFTs are transferable |
| Settlement | SCORING, observation ended | Holders may attest and ratify a scorecard |
| Complete | COMPLETE | Ratified weights known; commitments/cash-out readiness remain separate |
| No contest | NO_CONTEST | Triggered state and refund readiness remain distinct |

`entryClosesAt` maps to native `start` with zero separate refund duration. `resolvesAt` is the attestation start, not a promise that scoring proposals cannot be submitted earlier. Native defaults include a one-day grace period, one-hour timelock and observation duration plus seven days before the scorecard timeout. Transfers are possible even during entry; the frontend cannot impose a post-start-only transfer rule.

The existing Defifa protocol and client own governance, transfers, refunds and cash-out. They have not been reimplemented in this first Metalog interface. No market has been launched as part of development.

## Adversarial mechanic review

| Hole | Implication and current treatment |
| --- | --- |
| Paid allocation is not a proper scoring rule | Rational bets can favor underpriced payouts rather than honest probabilities. Label stake-weighted positions; do not count wallets or curves as independent opinions. |
| Wealth, repeat entry and last-minute copying | A large or late entrant can move the opening distribution. There is no Sybil resistance or commit/reveal claim. The block/time and stake weighting travel with data. |
| Sparse-tier governance veto | Defifa discounts proposed winners’ attestation power; a holder in a sparsely occupied losing tier can prevent concentrated scorecards from reaching quorum. The UI exposes governance dependence; no artificial oracle guarantee. |
| Empty tiers and disputed source | Empty tiers cannot receive nonzero scorecard weight. The recorded observation rule guides participants; only native governance/timeout paths determine settlement. No nearest-tier substitution. |
| Arbitrary ratified weights | A measured result is not itself an enforceable one-winner payoff map. Display the actual ratified scorecard rather than infer one. |
| Unequal supply and non-bet NFT value | Even under a hypothetical one-winner rule, price-implied mass would involve NFT supply and net payout, not price alone. Governance/refund options and protocol token rewards also affect prices. |
| Thin liquidity and wash trading | Last sale is not an executable fair quote. No connected venue means `tradingDistribution: null`; do not fabricate a live curve from supply after mint close. |
| Refunds and redemptions | Cumulative mints overstate current stake after refunds. Read `currentSupplyOfTier`; reconstruct entry-close supply after completion only from the dedicated final-redemption counter. No-contest opening supply stays unknown. |
| Approximation and gas | Indivisible NFTs alter a submitted curve. Show exact quantities, spend and error before the wallet; preserve coefficients separately in the memo. |
| Uncertain send or replaced connection | Persist exact intent and check original evidence. Never auto-repeat, accept an old receipt or infer non-submission from missing activity. |

## Query data and next design boundary

`POST /api/preview` is a bounded, stateless calculation. `GET /api/markets/:chainId/:projectId` returns one block-pinned snapshot. Draft probabilities, acquired integer positions, current supply shares, reconstructed opening shares and ratified payout weights are separate concepts. Empty or unavailable distributions are null; known empty supply is zero. JSON includes raw wei and counts as strings.

Adding a trading distribution requires choosing a venue, executable bid/ask source, freshness limit, depth threshold, manipulation treatment and an explicit payoff assumption compatible with the market’s scorecard rule. Adding automated resolution requires a protocol-enforced authority model. Neither capability follows merely from wiring a new chart or price endpoint.

### SIPmath export

The editor downloads `metalog-forecast.SIPmath`; `POST /api/preview?format=sipmath` uses the same export owner and source inputs. `GET /api/markets/:chainId/:projectId?format=sipmath` downloads a market snapshot. Native JSON remains the default. One adapter in `src/lib/sipmath.ts` owns format selection, deterministic identity, seeds, calibration and the library envelope; `sipmath-market.ts` binds observed tiers to the canonical market definition before exporting them. Exports never submit transactions.

The [January 2025 SIPmath 3.1 specification](https://www.probabilitymanagement.org/s/SIPmath-31-Standard-2025-01-31.pdf) includes the `HDR_2_0`, `Metalog_1_0` and `Lookup_Table` functions used here. The file retains the publisher's canonical `libraryType: "SIPmath_3_0"` wire profile and identifies the target specification in metadata. It does not invent a `SIPmath_3_1` discriminator or reinterpret our existing coefficients as the incompatible Metalog 2.0 basis. This is a supported subset, not a general SIPmath reader or copula engine.

| Source | Exported SIPs |
| --- | --- |
| Simple / Expressive draft | `forecast`: continuous percentage change, exact six coefficients, percentage-point units; `allocation`: count-weighted tier IDs. |
| By range draft | `allocation` only. The native audit retains the reference curve and the SIP explicitly labels its role `reference-only`. |
| Market snapshot | `circulating_tier` and `opening_tier` when each distribution is available and nonempty; exact counts and evidence remain in the audit. |
| Empty or unavailable supply | No SIP for that distribution; explicit `empty` / `unavailable` audit status. A fully empty library has empty `sips` and `U01.rng` arrays. |
| Ratified scorecard | Audit evidence only; never a probability variable. |

Categorical outputs are tier IDs, not percentage outcomes or payout amounts. Each SIP carries exact range definitions; unbounded tails retain null bounds. Zero-count tiers are omitted from the cumulative lookup table. Counts and cumulative totals use bigint before conversion to floating-point probabilities. The final cumulative probability is exactly one; a positive share that cannot be represented without collapsing a lookup interval is rejected rather than erased. Live aggregate supply is not subject to the per-entry 200-NFT limit. Range shares alone do not imply a within-range outcome distribution.

`metadata.audit` contains the validated native forecast or `{native, availability}` snapshot evidence. It preserves the prompt, observation rule, exact boundaries/counts/payment, allocation mode, chain/block context and settlement authority. `metadata.auditSha256` hashes recursively key-sorted JSON using ECMAScript JSON.stringify numeric encoding, with array order retained and a `0x` hex prefix. `metadata.source` and `sourceSha256` separately preserve exact source context: market definition/draft mode, or chain/project/hook/block identity. Derived probabilities and calibration floats do not identify the random stream; their last digits may differ across math engines without reseeding. The export timestamp is separate from both identities. A digest identifies content; it is not authentication or proof of a transaction.

`src/domain/sipmath.ts` owns the [HDR 2.0 formula and seed ordering](https://www.probabilitymanagement.org/hdr). It uses exact integer arithmetic until the final uniform conversion. The portable profile uses seven-digit seeds and counters up to 99,999,999. Exported trials begin at one; each SIP includes the first five calibration outputs, and metadata records their indices. Repeating an unchanged export reproduces its seeds and HDR uniforms even when the download time changes. Continuous calibration permits `absolute + relative × |expected|` error: absolute tolerance is `1e-12 × max(1, |coefficients|)`, relative tolerance is `1e-12`. Both are recorded per SIP. This accommodates floating-point logarithm differences without rounding source coefficients. Discrete calibration has zero tolerance.

Stream identity is SHA-256 of `[profile, sourceSha256, variable name, kind, variable inputs]`. Variable inputs contain coefficients or exact string counts/tier IDs. `entity` is derived from the fixed JSON string `metalog.sipmath.entity.v1`; `varId`, `seed3` and `seed4` use the identity hash's first three unsigned 32-bit hex words, each modulo 10,000,000. Full identities and the mapping version `metalog.sipmath.v1` are retained. Duplicate variable names or seed tuples inside a library are rejected. The finite mapping is collision-resistant, not a global uniqueness guarantee; downstream composition must check stream identities. Separate streams provide a replay convention, not evidence of real-world independence. Identical exports reuse streams. A joint simulation requires an explicit dependence model; no cross-market copula is inferred.

Validation fixtures and source hashes live in `test/fixtures/sipmath`. The independent test-only `@solace-fi/hydrate@0.1.3` reader consumes the actual generated two-variable draft file's continuous SIP, including a nontrivial six-term shape. Its counter starts at zero, so tests align it with the publisher's one-based calibration. HDR matches selected cached workbook values; all 10,000 workbook values also matched exactly during implementation. Discrete lookup passes the publisher's Poisson calibration and exact cumulative-boundary tests. This reader does not implement Lookup_Table, so there is no claim that it consumes the categorical SIPs. The official linked schema returned a Squarespace error on 2026-10-09; schema-wide certification and arbitrary-reader compatibility are not claimed. Browser tests cover downloads/API parity, all three modes, independent drafts, invalid-input locking and mobile layout.

## Verification boundary

Unit/adversarial tests exercise math, metadata, real ABI decoding, modeled chain state, review/simulation, partial/incorrect effects and reload recovery. Browser checks cover rendered local journeys and responsive interaction; the public Railway example and stateless preview API are also smoke-tested. Runtime fingerprints came from deployment artifacts; preflight checks them against the requested chain before any write. Actual Signa ceremony, funded wallet execution and the full real-value game lifecycle remain unverified. No onchain transaction has been created as part of development.
