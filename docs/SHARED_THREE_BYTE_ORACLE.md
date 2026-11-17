# One three-BYTE write oracle for published JavaScript and native Rust

This stage eliminates a critical S7 comparison blind spot: the [current same-run matrix](COMPARISON_ARCHITECTURE.md) previously measured three disjoint one-byte write variables only on the published `@oriolrius` JavaScript implementation. Rust was `NOT_TESTED` on this exact scenario, despite historic third-party tests reporting a pass.

The **exact same source test** (`test/candidates/published-js-three-byte-write.cjs`) now selects the implementation only using a fixed `S7_WRITE_ENGINE=js|rust` value. The test uses unmodified installed Node-RED 5.0.9 and either the published `@oriolrius/node-red-contrib-s7@4.4.1` plus `@oriolrius/nodes7@1.1.5` or the published native `node-red-contrib-s7-rust@1.4.0`. No fake runtime or driver source is substituted.

| Invariant | Real measurement / strict requirement |
| --- | --- |
| Scenario identity | `byte-write-1801-1803-1805-15-29-43-v1` for both engines |
| Fixture | `python-snap7==3.3.1`, ephemeral `127.0.0.1`, synthetic DB1 only |
| Positive control | Single BYTE write of `99` accepted on same endpoint; exactly one observed `WRITE_VAR` |
| Tested operation | One user-level command to write three separated BYTE addresses: DB1 offsets 1801, 1803, 1805 |
| Candidate readback | Exactly `[15,29,43]` from the real fixture through each installed candidate |
| Separate S7Comm witness | Independent, read-only `python-snap7==3.3.1` client reconnects to `127.0.0.1` on the fixture, reads DB1 bytes 1801–1805, requires three target bytes and unchanged spacer bytes `[10,12]`; exact 5-byte span SHA-256 is verified by Node |
| Packet observer | Real observed upstream `WRITE_VAR` count and hash-chain for full actual TPKT frames |
| Interpretation | `COMPLETE_WRITE_OBSERVED` / `PARTIAL_WRITE_KNOWN_UNSAFE` / `NO_WRITE_APPLIED_OR_REJECTED` / genuinely red harness failure |
| Output | Each version has its **own original strict candidate JSON**, assessor JSON, native exit code, version and source SHA |
| Failure handling | Crash, missing readback, wrong source SHA, absent wire frames, stale/missing report or mismatched Oracle ID: red |

The new native assessor `scripts/assess-published-rust-write.cjs` calls the **same** `verifyWrite(..., 'rust')` independent evaluator as JavaScript, then requires a genuine complete write and original strict exit `0`. A real partial-write failure remains a hard red error for Rust. The live cross-engine collator refuses to award the Rust `WRITE_THREE_DISJOINT_BYTES` cell without that validated original process and hashes **nine** actual raw JSON reports. It cannot substitute the historical Rust result from the source PR.

### Limits

This scenario proves byte accuracy in a bounded software fixture, not transactional all-or-nothing S7 multi-item semantics for failures in the middle of execution. A single user-level command may map to one or more real physical `WRITE_VAR` frames; the exact measured count is preserved rather than inferred. This operation also does **not** test large array/payload splitting, write ACK ambiguity, S7CommPlus, ARM/Windows support, physical PLC firmware or long-run performance.

The historical `@missel2` Alpha2 regression lives in independent open PR #13. A green Rust write scenario cannot erase its old partial write, nor can either healthy multi-BYTE write excuse a separate Rust lost-ACK replay or JavaScript invalid AckData length.

## First actual same-run result — 17 November 2026

[GitHub Actions #44030185876](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030185876), from stacked PR #16 against open PR #14, executed unmodified published JS and native Rust in the same job:

```json
{"javascript":{"classification":"COMPLETE_WRITE_OBSERVED","candidateExit":0,"appliedBytes":3,"observedWrites":1,"readback":[15,29,43]},"rust":{"classification":"COMPLETE_WRITE_OBSERVED","candidateExit":0,"appliedBytes":3,"observedWrites":1,"readback":[15,29,43]}}
```

The collator reported **11 source-commit-bound scenario results**, including the new Rust write result, and **four separate known-unsafe outcomes** that remain unsafe. All **13** JS/Rust shared-assessor and collator unit tests passed in this run. Its output is archived in [the same-run artifact](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030185876/artifacts/14304374501).

The CI job ran at GitHub's PR merge-test source SHA `f0ba3f4027ee41db0b95b723c3cebbdbc0d3211a`, not the branch-head SHA. The historical comparison catalog records this as `PR_OPEN` evidence, so a complete *reviewed/merged* three-candidate matrix must still remain incomplete.

## Stronger second-client proof — 17 November 2026

A subsequent CI enhancement removed the remaining candidate read-cache ambiguity. The script `scripts/s7_external_db1_readback.py` creates a **different** real S7Comm TCP client session directly to the disposable local fixture, after the Node-RED flow has been unloaded. The client reads the complete five-byte range `DB1.B1801..1805`, checks that the intervening bytes `DB1.B1802=10` and `DB1.B1804=12` were not overwritten, reports all three target values and a SHA-256 of the five raw bytes. The independent JavaScript assessor verifies the readback, 5-byte hex and SHA-256, and the native assessor reuses exactly that verification.

[GitHub Actions #44030890856](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030890856) is green and proves, on its **same-run checked-out test-merge commit** `b477b68164bc3c8dd1929d5dbd7f7da69c5efbf5`:

```json
{"javascript":{"classification":"COMPLETE_WRITE_OBSERVED","candidateExit":0,"appliedBytes":3,"externalVerified":true,"observedWrites":1,"readback":[15,29,43]},"rust":{"classification":"COMPLETE_WRITE_OBSERVED","candidateExit":0,"appliedBytes":3,"externalVerified":true,"observedWrites":1,"readback":[15,29,43]}}
```

All **13** adversarial assessor/collator tests passed, and the same-run collator produced **11** scenario cells without suppressing **four** confirmed known-unsafe observations. All **seven** GitHub Actions workflows passed on the corresponding feature-branch commit. The unchanged original candidate reports, nine original raw JSON SHA-256 digests and summary report are retained in [the CI artifact](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44030890856/artifacts/14305551353).

This is an independent *software* read-only witness of DB1 state, not proof of physical Siemens PLC behavior, all-or-nothing transaction semantics or optimized S7CommPlus addresses.
