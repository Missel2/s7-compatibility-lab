# S7 Compatibility Lab — outcome-driven roadmap

**Updated 2026-11-17.** Tests executed are not equivalent to driver qualification. Track code merged, PR-open observations, published candidate defects, and hardware unknowns separately. See [comparison architecture](COMPARISON_ARCHITECTURE.md).

## Implemented and evidenced on main

- [x] Independent synthetic python-snap7 3.3.1 S7Comm-only fixture and TCP/COTP/S7 observer with fragmented-packet / injected-fault self-tests
- [x] Bound published Node-RED 5.0.9, JS `@oriolrius/node-red-contrib-s7@4.4.1` and Rust `node-red-contrib-s7-rust@1.4.0` healthy DB1 and TCP teardown controls
- [x] Rust 1.4.0 known-unsafe **not qualified**: duplicate WRITE_VAR after lost ACK, wrong PDU reference as fresh, and post-unload COTP requests
- [x] Published JS 4.4.1 known-unsafe AckData length reception; wrong-reference and short-ACK probes produce only *narrow observed results*, not general PASS
- [x] Published JS 4.4.1 multi-item 3-BYTE write readback correct on synthetic DB1
- [x] SHA-256 of actual full observed TPKT frames (including mutation/dropped-ACK events), with bounded event history
- [x] Fail-closed contract registry and separate qualification guard; none of the above is a full release certificate

## Merged baseline source (not qualified)

- [x] [PR #13](https://github.com/Missel2/s7-compatibility-lab/pull/13): exact source-packed historical `@missel2` alpha2 with npm-SRI pinned nodes7; independently reproduced a **partial three-byte write** [15,11,13] vs [15,29,43]. All six exact-head jobs green; **merged via bcf7a51de6a3b7bcd236531c5ddff29a93ae4c02**. Different runtime `iso-on-tcp` resolution recorded.
- [x] Versioned evidence and implementation comparison matrix (this development branch): curated older-run index **and** same-head real JS/Rust Node-RED execution with original strict candidate result files and fail-closed collation; CI proof needed before merge

## P0 — the strongest next product evidence

1. **Direct evidence ingestion:** GitHub Action per candidate exports a stable, signed-or-hashed envelope linking exact package SRI/source, fixture commit, observer events, mutated packet hashes, original strict process exit, exact applied DB bytes, cleanup, evidence SHA. Reject malformed and stale reports.
2. **Joint comparison on the same CI head:** same independent scenario for every applicable candidate, in isolated processes (JS historical/current, Rust); monitor contracts `READ_IMPOSSIBLE_ACK_LENGTH`, `READ_WRONG_PDU_REFERENCE`, `WRITE_THREE_DISJOINT_BYTES`, `WRITE_ACK_LOST_AFTER_APPLY`, `COTP_AFTER_EXPLICIT_UNLOAD`.
3. **High-impact missing oracles:** S7ANY 24-bit range, segmented writes, overlapping 240/480/960 PDU, concurrent reference correlation and late errors. Keep unavailable cases NOT_TESTED.
4. **Source-owner fixes:** independent follow-up to nodes7 serializer and Rust lost-ACK / wrong-ref logic; strict fail-on-unsafe candidate CI before merging any driver fix.

## P1 — resilience, coverage and ecosystem breadth

- Add deterministic FIN/RST, delayed response, reconnect, timeout, flood and memory/socket/handle trend tests.
- Add property-based wire mutations, reproducible seeds, bounded budget and independent crash-fail criteria.
- Add new **client** adapters, when exact package and license feasibility is confirmed: python-snap7, Apache PLC4X, native Snap7, S7.NetPlus and Go S7 libraries.
- Build a segmented ecosystem matrix: classic S7Comm only; S7CommPlus and optimized memory remain a separately qualified protocol.
- Convert external source issue inventory (293 archived reports) into referenced risk groups without treating them as tests.

## HIL and releases

Seven HIL gates remain **PENDING_HARDWARE**. Do not connect CI to physical controllers, install on production, publish npm, or infer industrial safety from simulator-only checks. Hardware testing requires a distinct explicit authorization and isolated plan. Merge only after exact-head checks, review and human approval under [AGENTS.md](../AGENTS.md).

### Review-stage external candidate

- [x] [PR #16](https://github.com/Missel2/s7-compatibility-lab/pull/16) was merged: 3-BYTE write scenario is now exercised by **both** published JS and Rust via the same source oracle; an independent Python S7Comm client separately verifies DB1 target and adjacent spacer bytes. [Real CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030890856) observed both `[15,29,43]` values with one write frame per candidate, eleven live result cells at the cited earlier run, no candidate qualification. PR #13 is separately merged and its historical unsafe Alpha2 finding remains unqualified.

- [ ] [PR #19](https://github.com/Missel2/s7-compatibility-lab/pull/19) (unmerged): first real external Python client, independent process, 12 exact DB1 bytes, real COTP/READ_VAR and clean close; 5/5 adversarial tests. [Original real CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44037883892).
- [ ] Four-candidate versioned capability declarations (56 scenario cells) + source-bound same-head client evidence. [Shared CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44038695742) executes Python along with the JS/Rust clients.
- [ ] Next independent client ecosystem: Apache PLC4X Java on an exact released, verified JDK/Maven artifact, same READ_HEALTHY_DB1 independent wire oracle.
- [ ] Add independent S7ANY address bounds and multi-PDU read/write scenarios; do not mislabel Python sequential API operations as one multi-item WRITE_VAR.
