# One three-BYTE write oracle for published JavaScript and native Rust

This stage eliminates a critical S7 comparison blind spot: the [current same-run matrix](COMPARISON_ARCHITECTURE.md) previously measured three disjoint one-byte write variables only on the published `@oriolrius` JavaScript implementation. Rust was `NOT_TESTED` on this exact scenario, despite historic third-party tests reporting a pass.

The **exact same source test** (`test/candidates/published-js-three-byte-write.cjs`) now selects the implementation only using a fixed `S7_WRITE_ENGINE=js|rust` value. The test uses unmodified installed Node-RED 5.0.9 and either the published `@oriolrius/node-red-contrib-s7@4.4.1` plus `@oriolrius/nodes7@1.1.5` or the published native `node-red-contrib-s7-rust@1.4.0`. No fake runtime or driver source is substituted.

| Invariant | Real measurement / strict requirement |
| --- | --- |
| Scenario identity | `byte-write-1801-1803-1805-15-29-43-v1` for both engines |
| Fixture | `python-snap7==3.3.1`, ephemeral `127.0.0.1`, synthetic DB1 only |
| Positive control | Single BYTE write of `99` accepted on same endpoint; exactly one observed `WRITE_VAR` |
| Tested operation | One user-level command to write three separated BYTE addresses: DB1 offsets 1801, 1803, 1805 |
| Expected independent readback | Exactly `[15,29,43]` from the real fixture through the installed candidate's client |
| Packet observer | Real observed upstream `WRITE_VAR` count and hash-chain for full actual TPKT frames |
| Interpretation | `COMPLETE_WRITE_OBSERVED` / `PARTIAL_WRITE_KNOWN_UNSAFE` / `NO_WRITE_APPLIED_OR_REJECTED` / genuinely red harness failure |
| Output | Each version has its **own original strict candidate JSON**, assessor JSON, native exit code, version and source SHA |
| Failure handling | Crash, missing readback, wrong source SHA, absent wire frames, stale/missing report or mismatched Oracle ID: red |

The new native assessor `scripts/assess-published-rust-write.cjs` calls the **same** `verifyWrite(..., 'rust')` independent evaluator as JavaScript, then requires a genuine complete write and original strict exit `0`. A real partial-write failure remains a hard red error for Rust. The live cross-engine collator refuses to award the Rust `WRITE_THREE_DISJOINT_BYTES` cell without that validated original process and hashes **nine** actual raw JSON reports. It cannot substitute the historical Rust result from the source PR.

### Limits

This scenario proves byte accuracy in a bounded software fixture, not transactional all-or-nothing S7 multi-item semantics for failures in the middle of execution. A single user-level command may map to one or more real physical `WRITE_VAR` frames; the exact measured count is preserved rather than inferred. This operation also does **not** test large array/payload splitting, write ACK ambiguity, S7CommPlus, ARM/Windows support, physical PLC firmware or long-run performance.

The historical `@missel2` Alpha2 regression lives in independent open PR #13. A green Rust write scenario cannot erase its old partial write, nor can either healthy multi-BYTE write excuse a separate Rust lost-ACK replay or JavaScript invalid AckData length.
