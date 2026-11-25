# Apache PLC4X 1.0.0: real S7Comm read and malformed post-disconnect bytes

**Status:** version-specific negative evidence merged via PR #21; not a driver qualification, not a green end-to-end healthy connection. S7Comm only, GitHub-hosted 127.0.0.1 synthetic 2048-byte DB1, no industrial CPU.

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

[PR #21](https://github.com/Missel2/s7-compatibility-lab/pull/21) was squash-merged at `6792728b0987154cd27b03f71e69e31cf4dd7d79`. The original strict candidate failure and its exact-fingerprint characterization remain separately recorded.

## Follow-up work

1. Confirm the malformed trailer with an independent packet capture / minimal COTP peer and a distinct fixture implementation to rule out interaction artifacts.
2. Investigate PLC4X 1.0.0 closing handshake/Netty buffer write path; reproduce in a minimal documented unit test before proposing an upstream fix. Do **not** modify or vendor published Apache driver code in the lab.
3. Use an actually corrected published future PLC4X release against the same strict oracle; require red-on-current/green-on-fixed without suppressing old evidence.
4. Add further Java data reads/writes, error injection, boundary tests **only after** platform/fixture compatibility and clear error classification, with the existing non-TPKT trailer kept as a separate failing lifecycle contract.

## Falsification against a separate server implementation (PR #23)

[Actual independent Java CI #44050053619](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619) independently re-ran the unchanged `org.apache.plc4x:plc4j-driver-s7:1.0.0` Java client against **`fixtures/independent-cotp-s7-server.cjs`**, a new, deliberately tiny Node.js-only RFC1006/COTP/S7Comm fixture. Neither python-snap7 nor the earlier TCP proxy is in the experiment. The Node server independently produces CC, S7 setup, and the one genuine **12-byte, single-item S7ANY READ_VAR**, with exact DB1 raw response `41480000ff85060740500000`.

Actual independent results were identical in both COTP close policies:

| Second independent server behavior | Read | COTP DR | TCP trailer after DR | Outcome |
| --- | --- | --- | --- | --- |
| No explicit DC response | Correct 12 bytes | Seen | 21 unframed zero bytes | `KNOWN_UNSAFE` |
| Valid explicit COTP DC response | Correct 12 bytes | Seen | 21 unframed zero bytes | `KNOWN_UNSAFE` |

For each case, published Java exits 0, the malformed tail violates the strict read+close contract, and the actual payload digest is `c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2`. [Original raw Java process reports, actual COTP/S7 requests/responses and SHA evidence](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619/artifacts/14313550909) retain the exact test-merge source SHA. Additional false-byte, unsupported WRITE_VAR, extra/fake-packet and TCP-fragmentation controls must fail. No new comparison-matrix PASS is generated: this tests a *second server*, not a sixth client or new S7Comm operation.

**Interpretation:** a defect specific to the original Python Snap7 fixture or earlier Node relay is now much less plausible. A published PLC4X 1.0.0 teardown/serialization issue is supported for these software-only environments, but the actual root code defect, other PLC4X versions, and Siemens physical CPUs remain unverified. See [Issue #22](https://github.com/Missel2/s7-compatibility-lab/issues/22) and [PR #23](https://github.com/Missel2/s7-compatibility-lab/pull/23) (unmerged).


## Measured strict verdict on the independent peer

For each peer policy the runner records the Java stdout and stderr, then waits for the client FIN, closes the fixture listener and archives the complete session capture. A separate Node process runs `scripts/check-plc4x-node-peer.cjs` against those files. It exits **0** for a clean close, **1** for validated unframed client bytes after the DR, and **2** for invalid or incomplete evidence. The baseline characterization accepts only the actual child exit **1**, empty strict stderr, an input-bound strict JSON verdict and the exact 21-zero-byte fingerprint.

The artifact contains the original Java output, both strict output streams, measured process status and signal, raw framed packets and complete raw trailer bytes. SHA-256 binds the strict verdict to the exact capture and Java output. The short-lived fixture must observe a clean FIN, one TCP session, one read, zero writes and the expected DR/DC sequence. The earlier independent run above captured the same raw wire defect before this separate strict process was introduced. The original Python-fixture candidate check remains red.
