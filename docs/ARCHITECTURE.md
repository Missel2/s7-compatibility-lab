# Architecture — implementation-independent evidence

```text
Node.js test runner (GitHub-hosted Ubuntu, Node 22)
    |
    +-- python scripts/s7_probe.py (hardcoded 127.0.0.1, no host argument)
    |       | TCP/COTP/S7Comm
    |       v
    +-- lib/wire-peer.cjs (loopback TCP observer, optional fault injection)
            | TCP/COTP/S7Comm
            v
        fixtures/s7_server.py (python-snap7==3.3.1, ephemeral port)
            +-- DB1: 2048 disposable synthetic bytes
```

## Stage 1 — instrument validation
The probe checks REAL0 12.5, INT4 -123 and REAL8 3.25, writes REAL8 19.75 and checks the exact readback and unrelated fields. The proxy independently counts COTP handshakes, READ_VAR, WRITE_VAR and packet observer errors. A local negative-control suite checks observation of truncated frames without out-of-bounds access.

## Stage 2 — candidate adapters
Run *unmodified released binaries* and a source-pinned candidate under a genuine, unmodified Node-RED host. Do not use fake Rust NAPI libraries in external comparison tests. Keep the lab's health status green even when an installed candidate correctly fails its separate behavioral gate; never report an unsafe candidate as release-qualified.

## Non-goals
Hardware qualification, generic PLC tooling, source code of third-party S7 drivers, production certificates, industrial logs, network access to physical controllers and release/publish automation. Performance metrics require their own repeatable measurements and cannot be inferred from smoke tests.

## Stage 3 — external client adapter under review

A separate **real CPython 3.12 process** executes published `python-snap7==3.3.1` (wheel SHA-256 pinned), with only `--port` accepted. The localhost relay captures original complete TCP/COTP/S7Comm frames. Node checks exact DB1[0..11], zero writes, read request and graceful TCP session closure, plus original JSON SHA-256 and checked-out CI head.

The same GitHub Actions commit then runs JavaScript and native Rust processes in Node-RED against equivalent synthetic fixture semantics. A strict collator binds all original report bytes, outputs scoped case results and preserves intentionally red original candidate-safety assertions. `comparisons/candidate-capabilities.v1.json` distinguishes observed from NOT_TESTED/HIL. The Python client and synthetic server share their python-snap7 implementation in *separate* processes, so the end-to-end stack is not independently implemented at both ends.

## Stage 4 — real Apache PLC4X Java client (PR #21)

Maven resolves the unmodified Apache PLC4X 1.0.0 S7 driver with a pinned `plc4j-driver-s7-1.0.0.jar` SHA256 under Java21. It is **not** a JNI/Node-RED client or mock: the Java process connects to the same 127.0.0.1 synthetic S7Comm fixture via the independent TCP relay and reads exact DB1 tags. The relay verifies original complete TPKT frame chain, counts genuine `READ_VAR=1`, `WRITE_VAR=0`, and independently detects 21 **unframed zero bytes sent by the Java client after a valid COTP Disconnect Request**. The original strict assessment exits 1. Only a separate, exactly bound negative-case characterization may succeed; the Java client is `KNOWN_UNSAFE`, not qualified. [Evidence](PLC4X_JAVA_DISCONNECT.md).
