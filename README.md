# S7 Compatibility Lab

Independent open-source verification laboratory for classic S7Comm and, later, S7CommPlus implementations. This project **is a test harness, not a PLC driver** and is **not a hardware qualification**.

## Status (2026-11-17)

The independent software-only laboratory has already executed real S7Comm loopback comparisons against exact published JavaScript and Rust packages. The synthetic instrument, historical Rust known-unsafe characterization, released JavaScript AckData-length unsafe characterization, and 3-BYTE positive write are in merged CI. The historical `@missel2` alpha2 partial-write reproduction is **merged** via [PR #13](https://github.com/Missel2/s7-compatibility-lab/pull/13); it remains a confirmed unsafe historical candidate, never a release qualification. A green baseline-characterization workflow can prove an unsafe candidate behavior; it is **never** a candidate release PASS.

The new [comparison architecture](docs/COMPARISON_ARCHITECTURE.md) builds a machine-readable `comparisons/catalog.v1.json` index of **specific versioned CI observations**. It lists untested and future candidates separately. It does not run the candidates anew, infer missing results, produce a global leaderboard, or substitute for production/HIL qualification.

See [current evidence](docs/CURRENT_EVIDENCE.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [comparison architecture](docs/COMPARISON_ARCHITECTURE.md), and [source provenance](docs/PROVENANCE.md).

## Build the scoped cross-implementation index

```sh
node --test test/comparison-matrix.test.cjs
node scripts/build-comparison-matrix.cjs
```

GitHub Actions archives `test-reports/comparison-matrix.v1.json` and `test-reports/comparison-matrix.v1.md`. Source CI run links are **curated historical evidence pointers**, not newly executed or signed result attestations. A second `live-cross-engine-comparison.yml` workflow **actually executes** released JS and Rust in one exact-commit Actions run and writes `test-reports/live-comparison-v1.json` with per-input report SHA-256 and strict-original-exit evidence. Historical Alpha2 has a separately merged reproduction via PR #13. All candidates remain not qualified.

## Run the standalone self-validation

Requires Node.js 22 and Python 3.12 (Linux CI is currently the supported evidence platform):

```sh
python -m pip install --only-binary=:all: --require-hashes -r requirements/python-snap7.txt
node --test test/*.test.cjs
```

The Python probe **does not accept a target IP**. The synthetic server and TCP relay bind only to `127.0.0.1` on ephemeral, unprivileged ports. Synthetic DB1 values are independently checked byte-for-byte. No real PLC, factory network, vendor emulator, hardware output, npm publish or Kubernetes action is involved.

## Evaluation design

1. **Harness health:** real synthetic positive controls, fault-injection self-tests, parser and observer safety. CI should be green when the measuring instrument works.
2. **Candidate contracts:** against *unmodified, exact-version* installed candidate packages, assert S7Comm wire count, references, offsets, freshness, errors, reconnect and teardown. A failed safety contract is always RED for that candidate; historical baseline failures must never become release PASS by an `xfail` shortcut.
3. **Comparisons:** compare JavaScript, Rust, Apache PLC4X and other candidates *only where equivalent public behavior is available*. Unsupported capabilities are `N/A`, not `PASS`.
4. **Qualification:** independent CPU/firmware evidence on isolated hardware is a separate future gate; software tests cannot establish Siemens hardware compatibility.

## Governance and licensing

This lab is GPL-3.0-or-later because the imported harness files originate from a GPL-3.0-or-later repository. See [NOTICE](NOTICE), [LICENSE](LICENSE), [PROVENANCE](docs/PROVENANCE.md) and [AGENTS.md](AGENTS.md). Published third-party S7 packages are **not vendored**. Changes are reviewed in GitHub PRs and are not merged or released automatically. Maintainers should preserve upstream authorship and direct contributions to appropriate upstream projects.

## Phase 2: Rust 1.4.0 characterization (merged evidence)

A separate GitHub workflow installs unmodified published `node-red-contrib-s7-rust@1.4.0` in Node-RED 5.0.9, then uses the same independent S7Comm relay to confirm a **correctly rejected invalid length** (positive safety control) and two **unsafe behaviors** (a bad 16-bit PDU reference accepted as fresh, and an applied write repeated after losing its ACK), plus attempts to reconnect after explicit flow removal. The purpose of a successful *baseline-characterization job* is **to prove that the target is unsafe**, not to qualify it. The machine-readable report must say `classification: NOT_QUALIFIED`, `behavioralSafety: KNOWN_UNSAFE` and `candidatePass: false`. Upstream-fix candidates will have separate genuinely failing-on-error release gates. See [issue #2](https://github.com/Missel2/s7-compatibility-lab/issues/2).

Published package integrity values are checked from the npm-installed lock, but the transitive dependency lock is not yet committed; full immutable repeatability remains a next step. No S7CommPlus/HIL validation is claimed.

### Phase 2: actual published JS/Rust comparison (merged evidence)

The second candidate CI workflow installs real published `@oriolrius/node-red-contrib-s7@4.4.1` and `node-red-contrib-s7-rust@1.4.0` under unmodified Node-RED `5.0.9`. Both must read the same synthetic DB1 values over the same real COTP/S7Comm fixture and demonstrate kernel-visible TCP client teardown. This **healthy-path only** result does not reverse Rust 1.4.0's independent known-unsafe lost-WRITE-ACK, wrong-PDU-ref and post-unload retries. npm integrity records are retained, but a fully committed transitive lock remains pending.

### Merged Rust three-BYTE parity

[PR #16](https://github.com/Missel2/s7-compatibility-lab/pull/16) extends the same-run PR #14 comparison with an **identical native Rust and JavaScript three-BYTE write oracle** and a separate Python S7Comm client that verifies actual DB1 contents (including untouched bytes). [First independent re-read CI](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030890856): each published candidate wrote `[15,29,43]` using one observed `WRITE_VAR`, then passed the separate-client DB1 witness. PR #16 was merged; the result remains only a scoped software-loopback observation.

## Independent Python S7Comm client (PR #19, merged)

The first real external **non-Node-RED client** is pinned `python-snap7==3.3.1` in an isolated CPython 3.12 process. The client is read-only and cannot take a target host/IP. It reads the same known DB1 REAL0/INT4/REAL8 byte oracle as the released JS and Rust candidates. The independent TCP observer verifies actual COTP + S7Comm `READ_VAR`, no WRITE_VAR, exact byte hashes and a closed socket. [Real first run](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44037883892) and [same-head JS/Rust/Python run](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44038695742) are successful, and [PR #19](https://github.com/Missel2/s7-compatibility-lab/pull/19) is merged.

The new `comparisons/candidate-capabilities.v1.json` and `scripts/validate-candidate-capabilities.cjs` provide an exhaustive **five-candidate / fourteen-scenario** declaration with observed, untested and hardware states, not invented PASS claims. See [adapter admission contract](docs/CANDIDATE_ADAPTERS.md).

**Important limit:** the fixture server and Python client run separately but use the same python-snap7 package release. This is a real client from a different application ecosystem than Node-RED, **not** a protocol-stack-independent Python server comparison or any Siemens firmware qualification.

## Real Apache PLC4X 1.0.0 Java client: reproducible unsafe close (PR #21)

A genuine **Temurin Java 21** process now loads pinned published Maven `org.apache.plc4x:plc4j-driver-s7:1.0.0`, which independently speaks COTP/S7Comm to the synthetic localhost DB1. The actual REAL0/INT4/REAL8 values are correct with **one READ_VAR, zero WRITE_VAR and original Java exit 0**, but following an eleven-byte framed COTP disconnect, the client sends **21 unframed zero bytes**. The original strict observer **fails (exit 1)**. The separate exact-fingerprint characterization proves the released version/driver JAR SHA256, real original report, TCP direction, COTP frame, 21-byte SHA256 and preserved strict negative result; it does not turn the Java client into a healthy PASS. [Verified CI #44045494434](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44045494434); [full technical note](docs/PLC4X_JAVA_DISCONNECT.md). In review via [PR #21](https://github.com/Missel2/s7-compatibility-lab/pull/21), **not merged**. The Java candidate has one scoped `KNOWN_UNSAFE` scenario, thirteen `NOT_TESTED`/hardware cases, never a global safety score.
