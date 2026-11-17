# Published JavaScript WRITE_VAR acknowledgement-loss characterization

## Purpose and strict boundary

A write is **not necessarily unapplied** when the initiating client has not received its ACK. The independent localhost-only fixture applies the actual `DB1.REAL8=-8.5` write and issues a positive S7Comm `WRITE_VAR` AckData; the independent relay observes and intentionally suppresses that ACK *after the upstream server responded positively*. This measures whether published `@oriolrius/node-red-contrib-s7@4.4.1` / `@oriolrius/nodes7@1.1.5` retries the potentially non-idempotent command.

The related Rust `node-red-contrib-s7-rust@1.4.0` case has independently exhibited duplicate wire writes and an unexpected certain success; that result is **not** carried over to JavaScript by assumption. The new JS result is measured separately.

## Actual original candidate test, one process and one local synthetic fixture

1. Pin GitHub-hosted Ubuntu 24.04, Node 22.23.4, Python 3.12, exact published Node-RED 5.0.9, published JavaScript 4.4.1 and `@oriolrius/nodes7@1.1.5`, and `python-snap7==3.3.1` from the existing hash-required requirements; assert each npm registry SRI and source commit in CI.
2. Start the **real** published Node-RED endpoint through a byte-observing `127.0.0.1` TCP/COTP/S7Comm relay with an ephemeral unprivileged port, connected exclusively to the disposable Python server's synthetic 64-byte DB1. The helper node reads `DB1.REAL8=3.25` and `DB1.REAL0=12.5`.
3. **Positive control:** issue one normal `REAL8=19.75` write. Require exactly one real wire `WRITE_VAR` and the original JS client to read back the expected value. This excludes fake/unwritable fixtures.
4. Arm one-shot `peer.dropWriteAck=true`, issue `REAL8=-8.5`, require one *real* upstream positive `WRITE_VAR` ACK to be observed and suppressed (not a mere TCP timeout before application), then observe on-wire retries over an 11-second bounded period. Count actual `WRITE_VAR` requests. Preserve bounded complete-TPKT SHA-256 transcript, acknowledgement-drop metadata and Node-RED error callbacks.
5. Unload the driver and independently connect a **second READ-ONLY S7Comm client** using pinned `python-snap7`. The witness may address **only** `127.0.0.1`, register **only DB1** and read **only bytes 0..11**, verifying the source server's `REAL8=-8.5` and unchanged `REAL0=12.5, INT4=-123`. The independent Node assessor reconstructs all 12 known bytes and compares the complete SHA-256, not merely the JSON's claimed value.
6. The unmodified original *strict test* exits **1** if a second write is observed; a separate fail-closed assessor verifies every independent control and requires the actual original process exit match the measured classification.

## Interpretation

| Measured result | What can be said |
| --- | --- |
| `DUPLICATE_WRITE_KNOWN_UNSAFE` with original strict candidate exit 1 | A user command was physically sent more than once after the fixture applied its first execution and the relay omitted the positive ACK. This is independently unsafe for non-idempotent semantics. |
| `NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED` with strict candidate exit 0 | No duplicate `WRITE_VAR` was observed in the bounded period. **This does not prove** that the published JS wrapper correctly tells a user the final outcome is ambiguous. A lack of Node-RED error callbacks is not a confirmed success signal, nor is a callback necessarily a write outcome. |
| Harness errors, non-positive upstream ACK, missing independent readback, wrong DB bytes, invalid wire SHA, unexpected original exit | **Assessment red / instrument invalid.** Never interpreted as a safe or unsafe driver verdict. |

The *baseline characterization* workflow may be green while accurately preserving a red original candidate exit. **Never** turn a known-unsafe baseline into a passing upgrade/release gate. Any candidate release fix must have its own strictly failing-on-unsafe job with complete exact-head evidence.

No programmable controller, industrial network, S7CommPlus, firmware-specific path, npm publication, cluster or HIL gate is involved. It is a synthetic software-only observation, not proof of industrial suitability or write atomicity.

## Source provenance

`lib/wire-peer.cjs` (the relay), `fixtures/s7_server.py` (the simulator) and the Node-RED integration idioms in `test/candidates/published-js-lost-write-ack.cjs` originate ultimately from the GPL-3.0-or-later fork `Missel2/node-red-contrib-s7` at [e94bb29490f8ecfd22fdc7f6cf4e6e012e784393](https://github.com/Missel2/node-red-contrib-s7/tree/e94bb29490f8ecfd22fdc7f6cf4e6e012e784393), including `test/comparison/rust-ci-parity.cjs` and `test/comparison/historical-s7-regressions.cjs`. The new JavaScript candidate scenario adapts the existing in-repo published-JS Node-RED flow and Rust lost-ACK fault semantics; no third-party JS driver or Rust binary code is vendored. The new witness, fail-closed assessor, negative controls and workflow are GPL-3.0-or-later lab source. Published driver packages stay separately installed and unmodified.

## First executed result (2026-11-17)

The first [real published-JavaScript ACK-loss job #44034745020](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44034745020) completed successfully, **four out of four assessor unit tests** and actual synthetic process report:

```json
{"classification":"NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED","originalExit":0,"wireWrites":1,"replayCount":0,"fixtureApplied":true,"externalVerified":true,"observedErrors":1}
```

The published JavaScript driver emitted **one real WRITE_VAR** after the positive upstream ACK had been omitted from the client. An error callback was observed. This is a materially different narrow replay result than the previously established Rust 1.4.0 **duplicate write** in the same broad applied-write/ACK-loss fault family, but *not* an equivalence proof of all timing and user-API semantics: this JavaScript probe watches for 11 seconds while the prior Rust parity test used a shorter post-fault observation; neither observation constitutes Siemens CPU qualification. The next step runs both original probes and the independent report binder inside a single CI job and adds an explicit scenario cell to the comparison index.
