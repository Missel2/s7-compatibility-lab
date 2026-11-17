# Apache PLC4X 1.0.0: real S7Comm read and malformed post-disconnect bytes

**Status:** review-stage candidate, not a driver qualification, not a green end-to-end healthy connection. S7Comm only, GitHub-hosted 127.0.0.1 synthetic 2048-byte DB1, no industrial CPU.

## Actual independent read and transport

The original Java 21 program uses unmodified published `org.apache.plc4x:plc4j-driver-s7:1.0.0`, exact verified Maven Central driver JAR SHA-256
`907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7`.
It connects via real COTP to `s7://127.0.0.1:<ephemeral>` with `controller-type=S7_1200`, reads three concrete tags `%DB1.DBD0:REAL`, `%DB1.DBW4:INT`, `%DB1.DBD8:REAL`, checks `12.5, -123, 3.25`, emits its original source-commit-bound JSON and exits **0**. The local independent relay sees **one READ_VAR, zero WRITE_VAR**, and a real **11-byte TPKT-framed COTP Disconnect Request**.

## Newly detected, repeatable negative result

After the valid COTP disconnect, the original PLC4X Java process sends **21 unframed zero bytes** in the client-to-fixture direction. This is not a valid TPKT v3 frame. The independent observer rejects the byte sequence instead of silently ignoring it, so the **original strict candidate test exits 1**, even though Java read the values correctly.

Exact observed fingerprint:

- `direction=client-to-fixture`, `session=1`
- `afterCotpDisconnect=true`, `byteCount=21`, `allZero=true`
- `prefixHex=000000000000000000000000000000000000000000`
- `raw SHA256=c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2`
- `cotpDisconnectRequests=1`, `readRequests=1`, `writeRequests=0`, `closedSessions=1`, `activeSessions=0`
- Java process exit `0`; independent **original strict assessor exit `1`**.
- Raw proof: [real original failing CI #44044757144](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44044757144) and [original raw report/TPKT chain artifact](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44044757144/artifacts/14310199659).

This proves a **version-/fixture-specific protocol-close defect signature**, not a general guarantee that it affects a real Siemens CPU. It is not equivalent to a failed DB1 read or a performance regression.

## Exact known-unsafe baseline characterization

`scripts/characterize-plc4x-java-disconnect.cjs` is a **separate strict verification** against the *unaltered* original failing process report. It requires the real Java exit0 and exact readback, the original strict red exit1, pinned driver/JDK source, valid wire frame digest chain, the correctly framed disconnect, and the precise 21-zero-byte SHA256 anomaly. Any unrelated crash, changed fault signature, fixture failure, missing wire proof or changed version must fail the characterization workflow. The original safety contract is **never bypassed or reclassified as PASS**.

The [PR #21](https://github.com/Missel2/s7-compatibility-lab/pull/21) remains unmerged until all required checks/reviews are resolved; the standalone characterization CI must independently prove this exact original negative result.

## Follow-up work

1. Confirm the malformed trailer with an independent packet capture / minimal COTP peer and a distinct fixture implementation to rule out interaction artifacts.
2. Investigate PLC4X 1.0.0 closing handshake/Netty buffer write path; reproduce in a minimal documented unit test before proposing an upstream fix. Do **not** modify or vendor published Apache driver code in the lab.
3. Use an actually corrected published future PLC4X release against the same strict oracle; require red-on-current/green-on-fixed without suppressing old evidence.
4. Add further Java data reads/writes, error injection, boundary tests **only after** platform/fixture compatibility and clear error classification, with the existing non-TPKT trailer kept as a separate failing lifecycle contract.
