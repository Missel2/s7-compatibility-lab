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

- [x] [PR #19](https://github.com/Missel2/s7-compatibility-lab/pull/19) (merged): first real external Python client, independent process, 12 exact DB1 bytes, real COTP/READ_VAR and clean close; 5/5 adversarial tests. [Original real CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44037883892).
- [x] Four-candidate versioned capability declarations (56 scenario cells) + source-bound same-head client evidence. [Shared CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44038695742) executes Python along with the JS/Rust clients.
- [x] Next independent client ecosystem: Apache PLC4X Java on an exact released, verified JDK/Maven artifact, same READ_HEALTHY_DB1 independent wire oracle.
- [ ] Add independent S7ANY address bounds and multi-PDU read/write scenarios; do not mislabel Python sequential API operations as one multi-item WRITE_VAR.

### Merged fifth independent PLC4X Java driver (PR #21)

- [x] Real published Apache PLC4X 1.0.0 (Maven S7 driver JAR pinned SHA-256), Java21, actual DB1 REAL0 12.5/INT4 -123/REAL8 3.25 from classic COTP/S7Comm. Original Java exit0, one actual READ_VAR, zero WRITE_VAR.
- [x] Strict original observer **red exit 1**: PLC4X sends 21 unframed zero bytes after valid framed COTP disconnect. SHA256 and original fail attached to [real #44045494434](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44045494434); see [full negative signature](PLC4X_JAVA_DISCONNECT.md).
- [x] Separate exact-fingerprint known-unsafe characterization preserves this negative instead of suppressing it. This is **not** a green safety gate for PLC4X.
- [x] [PR #21](https://github.com/Missel2/s7-compatibility-lab/pull/21) (merged at 6792728b0987154cd27b03f71e69e31cf4dd7d79): add candidate status `KNOWN_UNSAFE` to five-client matrix with all other Java scenarios `NOT_TESTED`. Require successful exact-head CI and independent review.
- [ ] Repeat close protocol test with different isolated S7 server implementation/minimal TCP peer to distinguish protocol-stack failure from fixture interaction, then propose upstream fix and red-on-current/green-on-candidate test.

### Second independent server falsification (PR #23, review-stage)

- [x] Independent Node-only 127.0.0.1 COTP/S7Comm read-only implementation — not python-snap7 and not the existing TCP relay; **no direct hardware access**.
- [x] Independently decoded actual released PLC4X 1.0.0 contiguous single-item DB1[0:12] READ_VAR; exact three values and 12 raw bytes correct.
- [x] [Real CI #44050053619](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619) independently reproduced exact **21 unframed zero bytes after COTP disconnect** in **both** server response policies: silence and explicit COTP DC confirm, original Java exit0 and original strict oracle red1. [Original source-bound artifacts](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619/artifacts/14313550909).
- [ ] [PR #23](https://github.com/Missel2/s7-compatibility-lab/pull/23) requires exact-head final CI/review/explicit merge authorization. Keep five-driver capability matrix unchanged: this is **additional fixture corroboration**, not a new driver/scenario pass.
- [ ] Investigate actual PLC4X 1.0.0 COTP disconnect serialization; create minimal Apache upstream reproducer, then compare independently released later version (if proven) red-on-1.0.0 vs green-on-fixed. A full CPU/firmware oracle stays PENDING_HARDWARE.
