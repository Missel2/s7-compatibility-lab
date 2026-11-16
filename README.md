# S7 Compatibility Lab

Independent open-source verification laboratory for classic S7Comm and, later, S7CommPlus implementations. This project **is a test harness, not a PLC driver** and is **not a hardware qualification**.

## Status

**Phase 1: standalone harness bootstrap** (2026-11-16). The first automated job proves that an independent observation proxy sees real TCP/COTP/S7Comm traffic to a disposable `python-snap7==3.3.1` software server and that a synthetic DB1 read, write and readback work. It does **not** yet run cross-engine JavaScript/Rust comparisons. Those adapters are the next phase.

See [current evidence](docs/CURRENT_EVIDENCE.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md) and [source provenance](docs/PROVENANCE.md).

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

## Phase 2: Rust 1.4.0 characterization (in review)

A separate GitHub workflow installs unmodified published `node-red-contrib-s7-rust@1.4.0` in Node-RED 5.0.9, then uses the same independent S7Comm relay to confirm a **correctly rejected invalid length** (positive safety control) and two **unsafe behaviors** (a bad 16-bit PDU reference accepted as fresh, and an applied write repeated after losing its ACK), plus attempts to reconnect after explicit flow removal. The purpose of a successful *baseline-characterization job* is **to prove that the target is unsafe**, not to qualify it. The machine-readable report must say `classification: NOT_QUALIFIED`, `behavioralSafety: KNOWN_UNSAFE` and `candidatePass: false`. Upstream-fix candidates will have separate genuinely failing-on-error release gates. See [issue #2](https://github.com/Missel2/s7-compatibility-lab/issues/2).

Published package integrity values are checked from the npm-installed lock, but the transitive dependency lock is not yet committed; full immutable repeatability remains a next step. No S7CommPlus/HIL validation is claimed.
