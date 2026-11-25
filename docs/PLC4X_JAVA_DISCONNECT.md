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

1. Replay the exact read and disconnect contract against the preceding release and the first release containing an upstream correction. Preserve the original 1.0.0 strict exit and raw evidence.
2. Apply the same strict peer contract to the corrected driver's actual TCP output and clean FIN before recording a version-specific result.

## Falsification against a separate server implementation (PR #23)

[Actual independent Java CI #44050053619](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619) independently re-ran the unchanged `org.apache.plc4x:plc4j-driver-s7:1.0.0` Java client against **`fixtures/independent-cotp-s7-server.cjs`**, a new, deliberately tiny Node.js-only RFC1006/COTP/S7Comm fixture. Neither python-snap7 nor the earlier TCP proxy is in the experiment. The Node server independently produces CC, S7 setup, and the one genuine **12-byte, single-item S7ANY READ_VAR**, with exact DB1 raw response `41480000ff85060740500000`.

Actual independent results were identical in both COTP close policies:

| Second independent server behavior | Read | COTP DR | TCP trailer after DR | Outcome |
| --- | --- | --- | --- | --- |
| No explicit DC response | Correct 12 bytes | Seen | 21 unframed zero bytes | `KNOWN_UNSAFE` |
| Valid explicit COTP DC response | Correct 12 bytes | Seen | 21 unframed zero bytes | `KNOWN_UNSAFE` |

For each case, published Java exits 0, the malformed tail violates the strict read+close contract, and the actual payload digest is `c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2`. [Original raw Java process reports, actual COTP/S7 requests/responses and SHA evidence](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619/artifacts/14313550909) retain the exact test-merge source SHA. Additional false-byte, unsupported WRITE_VAR, extra/fake-packet and TCP-fragmentation controls must fail. No new comparison-matrix PASS is generated: this tests a *second server*, not a sixth client or new S7Comm operation.

Both fixtures observe the same client-side behavior. The release source and serializer experiment below identify the concrete cause for 1.0.0. [Issue #22](https://github.com/Missel2/s7-compatibility-lab/issues/22)


## Measured strict verdict on the independent peer

For each peer policy the runner records the Java stdout and stderr, then waits for the client FIN, closes the fixture listener and archives the complete session capture. A separate Node process runs `scripts/check-plc4x-node-peer.cjs` against those files. It exits **0** for a clean close, **1** for validated unframed client bytes after the DR, and **2** for invalid or incomplete evidence. The baseline characterization accepts only the actual child exit **1**, empty strict stderr, an input-bound strict JSON verdict and the exact 21-zero-byte fingerprint.

The artifact contains the original Java output, both strict output streams, measured process status and signal, raw framed packets and complete raw trailer bytes. SHA-256 binds the strict verdict to the exact capture and Java output. The short-lived fixture must observe a clean FIN, one TCP session, one read, zero writes and the expected DR/DC sequence. The earlier independent run above captured the same raw wire defect before this separate strict process was introduced. The original Python-fixture candidate check remains red.

## Source-to-wire proof on PLC4X 1.0.0

`CotpTransportInstance.close()` serializes an 11-byte TPKT Disconnect Request into a zero-initialized 32-byte buffer and hands the whole array to the TCP transport. `TcpTransportInstance.write()` wraps that array in a `ByteBuffer` and drains it directly to a Java NIO `SocketChannel`. Buffer sizing in COTP accounts for all 21 extra bytes. [Released COTP source](https://github.com/apache/plc4x/blob/ea229918f5d07700e04d7d69ab1645da679cb700/plc4j/transports/cotp/src/main/java/org/apache/plc4x/java/transport/cotp/CotpTransportInstance.java) · [Released TCP source](https://github.com/apache/plc4x/blob/ea229918f5d07700e04d7d69ab1645da679cb700/plc4j/transports/tcp/src/main/java/org/apache/plc4x/java/transport/tcp/TcpTransportInstance.java)

The Java reproducer calls the released serializer twice with the same Disconnect Request. It uses the original 32-byte allocation and then allocates `getLengthInBytes()` as a correction control. The verifier pins the runtime S7 driver, COTP, TCP and byte buffer JARs. It matches the complete 32 bytes against the framed DR and raw TCP tail in both independently captured sessions. The 11-byte control must match both captured DRs byte for byte. The experiment runs released libraries and evaluates the proposed change at the serialization boundary. Validation of a corrected driver still requires a full TCP session with that build.

Reproduce with Java 21, Maven and Node.js from the repository root.

```sh
(cd java/plc4x-readonly-client && mvn --batch-mode --no-transfer-progress package dependency:build-classpath -Dmdep.outputFile=target/classpath.txt)
node scripts/assess-plc4x-independent-node-peer.cjs
node scripts/verify-plc4x-disconnect-serializer.cjs
```

The original captures, measured strict results and serializer reports are written to `test-reports/`. Both strict 1.0.0 results remain exit 1 with `KNOWN_UNSAFE` characterization. Hardware coverage is `PENDING_HARDWARE`.

## Historical release comparison with the same Node peer

The pinned PLC4X 0.13.1 release requests three typed S7ANY items in one READ_VAR. PLC4X 1.0.0 requests the same DB1 data as one contiguous BYTE item. The peer now accepts both request layouts for the three fixed synthetic fields. It records the actual request, response, event hashes and TCP close in both cases.

| Release | DB1 values | COTP Disconnect Request | TCP FIN | Unframed bytes | Observation |
| --- | --- | --- | --- | --- | --- |
| 0.13.1 | 12.5, −123, 3.25 | 0 | Observed | 0 | `NOT_OBSERVED_UNSAFE` for the captured close |
| 1.0.0 | 12.5, −123, 3.25 | 1 | Observed | 21 | `KNOWN_UNSAFE`, strict exit 1 |

PLC4X 0.13.1 closes without a Disconnect Request in this run. It therefore does not exercise the COTP DR/DC exchange. The historical result does not qualify that exchange or enter the candidate qualification matrix. The 1.0.0 strict baseline and hardware scope are tracked independently in [Issue #22](https://github.com/Missel2/s7-compatibility-lab/issues/22).

```sh
(cd java/plc4x-0.13.1 && mvn --batch-mode --no-transfer-progress org.apache.maven.plugins:maven-dependency-plugin:3.9.0:build-classpath -Dmdep.outputFile=target/classpath.txt)
node scripts/assess-plc4x-historical-close.cjs
```

### Split READ_VAR reply

Each assessment includes an additional run in which the same valid READ_VAR response is sliced at offsets 2 and 26. The first boundary is inside the TPKT header and the second is inside the first DB1 REAL value. The Node peer submits the three writes with 35 ms between successive writes. The verifier checks the offsets, exact bytes, SHA-256 digests and measured delays against the complete response. The original Java values independently establish that the client consumed the response. The recorded boundaries describe fixture writes. TCP segment sizes and Java read boundaries are not measured here.

The split run preserves each release's own close contract. A correct split read from 1.0.0 still requires independent evidence of its known 21-byte close violation and strict exit 1 for this characterization. The historical run still requires FIN, no COTP DR and no unframed trailer. Neither result qualifies a release for hardware. Artifacts include `plc4x-node-peer-silence-split-*` and `plc4x-0131-split-*` alongside the intact-response controls.
