# Cross-implementation S7 compatibility lab — comparison architecture v1

## Objective

Build a durable, implementation-independent **test observatory**, not a competing S7 driver. The unit of comparison is **one explicitly defined behavior** against **one exact software candidate build** under a pinned fixture, not a brand score, GitHub popularity, language choice or undocumented claimed capability.

The first comparison index is `comparisons/catalog.v1.json`, validated with `scripts/build-comparison-matrix.cjs` and negative controls. Run:

```sh
node --test test/comparison-matrix.test.cjs
node scripts/build-comparison-matrix.cjs
```

The output is `test-reports/comparison-matrix.v1.json` and `test-reports/comparison-matrix.v1.md`. The **comparison workflow itself does not download or execute candidates**. It validates and renders an index of previously observed CI runs. Real candidate jobs (and their original **red strict assertions**) remain the authority. No result in this index is newer than its linked run. Curated CI URLs and source SHAs are claims requiring the attached original JSON reports to be inspected; they are not cryptographic attestations, signed bundles or live probes. Future automation must ingest reports directly with same-run SHA-256 binding instead of trusting manually copied assertion summaries.

## Evidence hierarchy

1. **Instrument validity:** independent observer, positive control, actually transmitted TPKT/COTP/S7Comm wire event, bounded run and clean teardown.
2. **Individual candidate result:** version, transitive transport package, exact CI head and original report, including original candidate failure exit where unsafe.
3. **Scenario:** protocol variant, exact request offsets/data, fault mutation, observed response and safety oracle revision. A different implementation may expose a different API; adapt semantics but never suppress strict safety checks.
4. **Cross-engine comparison:** compare only observations for the **same** scenario ID/oracle, fixture and supported protocol/platform. A scenario can be comparable with two engines even while a third remains NOT_TESTED.
5. **Qualification:** separate protected gate requiring a complete contracted set; software evidence cannot turn any HIL gate into PASS.

Outcome semantics:

| Outcome | Meaning |
| --- | --- |
| `KNOWN_UNSAFE` | A version-specific actual safety behavior violated; the characterization CI may be green while its *original strict candidate check fails* |
| `SCOPED_PASS` | The exact operation/defense succeeded under the named fixture; not a global certification |
| `NOT_OBSERVED_UNSAFE` | No unsafe value was observed for that one injected mutation; narrower than a proven safety case |
| `NOT_TESTED` | No admissible CI observation; must **not** count as a passed test or defect-free case |
| `PENDING_HARDWARE` | Requires separate isolated equipment approval and CPU/firmware-specific evidence |
| `NOT_ONBOARDED` | Candidate is only a future adapter target, with **zero** actual measured scores |

**No total score or overall winner.** A driver with one error and ten measured scenarios cannot be fairly ranked against another with zero errors and one measured scenario. Comparative findings should instead say precisely which implementation failed which identical oracle, and which cases are still missing.

## Current evidence contrast (2026-11-16)

- Historical `@missel2/node-red-contrib-s7@0.1.0-alpha.2` + SRI-verified `@missel2/nodes7@0.1.0-alpha.2`: 3-BYTE write **partially applied**; intended `[15,29,43]`, readback `[15,11,13]`, original candidate exit 1. The independent re-execution lives in **open PR #13**. The full historical source-lock tree differs from modern npm resolution of `iso-on-tcp` (source lock 0.1.0, current consumer 0.1.1).
- Published `@oriolrius/node-red-contrib-s7@4.4.1` + published `@oriolrius/nodes7@1.1.5`: same three-BYTE scenario returns `[15,29,43]`, but invalid AckData length **accepted as fresh** in a distinct READ_VAR oracle.
- Published Rust `node-red-contrib-s7-rust@1.4.0`: correct invalid-length rejection, but wrong PDU reference accepted, lost write ACK can induce a duplicate WRITE_VAR, and new COTP attempts observed after flow unload. All are **scoped** software-only behaviors, not complete reliability statements.
- The original 293 issue records are archival **triage data**, not 293 independently passing or failing tests.

## Six-layer target architecture

```
sourced issue and protocol requirements
           |
versioned scenario definitions and parameterized independent oracles
           |
implementation adapters (Node-RED JS, Rust, future PLC4X/Snap7/.NET/Go)
           |
disposable fixture + fault-injecting loopback wire observer
           |
strict raw candidate assertions + attested evidence bundle (future)
           |
validated comparison/coverage matrix + change detection + upstream bug reports
```

The catalog is the *first comparison/coverage layer*, not the final adapter framework. Over time each scenario should have a machine-checked `scenario.json`, adapter compatibility metadata, wire-observer source revision, expected negative/positive control and an immutable run bundle. A release gate should compare **two builds of the same candidate** for regressions as well as compare different implementations.

## Phased priorities

| Stage | Next deliverable | Acceptance evidence |
| --- | --- | --- |
| P0 — evidence foundation (current) | Version-pinned candidates, reusable test-oracle IDs, truthful comparison coverage, fail-closed static index | Unit/adversarial tests, GitHub-hosted CI artifact, no invented results |
| P0 — evidence transport | Produce a signed-or-hashed *same-run* evidence envelope directly from candidate CI reports, with source/fixture IDs, SHA-256 transcript, observed bytes, strict exit and cleanup | Reject missing, modified, mismatched CI head, wrong version and failed observer |
| P0 — joint scenario matrix | Run identical byte-write, invalid AckData length, PDU reference, lost write ACK, teardown and reconnect on each applicable candidate | Each implementation in separate process; results NOT_TESTED until executed |
| P0 — corruption and address safety | 24-bit S7ANY bounds, segmented multi-PDU read/write, short/error replies, overlapping reads, late responses | Exact independent byte offsets and wire oracle with adversarial negative controls |
| P1 — lifecycle and concurrency | FIN/RST, reconnect stress, duplicate listeners, pending reads, concurrent operations, timeouts, memory/socket trends | Fixed seed + bounded runtime + explicit cleanup; no platform/candidate score without repeatability |
| P1 — extend ecosystems | First independent python-snap7 **client**, Apache PLC4X Java, native Snap7, S7.NetPlus/.NET, Go implementations | Verify versions and licenses, safe loopback reachability, immutable adapter manifests and tests; unknowns stay NOT_ONBOARDED |
| P2 — protocol families | S7CommPlus and optimized DB access in **separate** protocol-specific matrix | Appropriate simulator/HIL contract; do not substitute classic S7Comm fixture |
| HIL — explicitly approved only | CPU/firmware/connection-mode matrix, physical read/write limits, secure isolated network | Dedicated human approval and independent hardware protocols; never public GitHub runner |

## Interpretation discipline

Version, platform and mode are part of an observed result. A repaired JavaScript serializer cannot excuse an unsafe Rust write replay; a Rust correct-length parser does not excuse its wrong-reference acceptance. A test that does not apply to an engine is `N/A` with documented reasons **only after** adapter capability discovery; before discovery the state must remain `NOT_TESTED` or `NOT_ONBOARDED`.

No real PLC, OT network, automatic npm publication or self-hosted Actions runner is involved. Existing `AGENTS.md` and protected PR checks take precedence. An open PR with valid CI is still not merged source.
