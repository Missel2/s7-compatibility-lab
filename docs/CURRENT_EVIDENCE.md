# Starting evidence and test limitations (2026-11-16)

## External baseline before this repository existed
Source reference [Missel2/node-red-contrib-s7 PR #58](https://github.com/Missel2/node-red-contrib-s7/pull/58) at commit `e94bb29490f8ecfd22fdc7f6cf4e6e012e784393`. [Exact-run source CI](https://github.com/Missel2/node-red-contrib-s7/actions/runs/43869072608) has 31 successful and three intentionally red checks. The three failing jobs contain five distinct cross-engine behavior failures, not one-to-one job failures. The 293 issue inventory is source metadata (seven repositories), with 22 risk contracts, 14 executable test definitions and eight pending gaps.

Known *software-only* behavior findings at the pinned installed versions (JavaScript wrapper and nodes7 `0.1.0-alpha.2`, Rust `1.4.0`):

| Violation | Candidate | Prior issue |
| --- | --- | --- |
| Partial three-item BYTE write, subsequent bytes not applied | JS | [nodes7#38](https://github.com/Missel2/nodes7/issues/38) |
| Accepts invalid S7 AckData declared length as fresh | JS | [nodes7#39](https://github.com/Missel2/nodes7/issues/39) |
| Silent WRITE_VAR replay after fixture applied write, ACK removed | Rust | [comparison#56](https://github.com/Missel2/node-red-contrib-s7/issues/56) |
| Accepts wrong 16-bit PDU reference with otherwise valid data | Rust | [comparison#59](https://github.com/Missel2/node-red-contrib-s7/issues/59) |
| Attempts additional COTP handshakes after Node-RED flow removal | Rust | [comparison#56](https://github.com/Missel2/node-red-contrib-s7/issues/56) |

These are **historic external artifacts**, not test outcomes produced by the new repository. None proves real Siemens hardware behavior or a fully qualified production-safe PLC connection.

## Proof required for this repo
Phase 1 accepts only a healthy synthetic instrument baseline: pinned published python-snap7, real TCP/COTP/S7Comm over IPv4 loopback, exact initial DB data, one explicit write and readback; no fake implementation or physical controller. New test execution must be linked to the new repository's CI commit before being claimed green. Phase 2 imports the cross-engine candidate contract test suite and exact original-red observations.

## First independently verified lab run (2026-11-16)

**Exact CI head:** `e11bc37f73b1c89413755dd6751d466acf36b38f`.
**Actions proof:** [S7 lab harness self-validation #43881403943](https://github.com/Missel2/s7-compatibility-lab/actions/runs/43881403943) — **SUCCESS: 8 tests, 8 passed, 0 failed** on GitHub-hosted Ubuntu 24.04 / Node 22 / Python 3.12.

The disposable `python-snap7==3.3.1` fixture exposed only loopback COTP/S7Comm and synthetic DB1. The source-independent TCP peer observed **one COTP handshake, two READ_VAR requests and one WRITE_VAR request**. The Python S7 client confirmed `REAL0=12.5`, `INT4=-123`, `REAL8=3.25`, then an explicit disposable DB1 write/readback of `REAL8=19.75`.

Independent proxy controls on the same commit:

- Full forwarding of a fragmented TPKT request and an observable COTP handshake.
- One-shot drop of a successfully acknowledged synthetic WRITE_VAR response, after upstream ACK was seen.
- Mutation of an S7 `READ_VAR` response to a wrong PDU reference, with a trace of original and delivered references.
- Actual 12-byte truncated-response injection without an observer crash.
- Three separate guard tests for truncated PDU reference / length reading.

**Scope:** PASS for the instrument, **NOT_TESTED** for the real published JS/Rust candidate packages, **PENDING_HARDWARE** for CPU/firmware tests. A handcrafted TCP response is not evidence of any vendor CPU behavior. Historical five red client findings remain red only in [the original comparison run](https://github.com/Missel2/node-red-contrib-s7/actions/runs/43869072608); they have **not** yet been re-executed by this repository. This entry is historical evidence tied to the named exact SHA; subsequent commits need their own checks.

## Second independently implemented S7 server vs genuine PLC4X 1.0.0 (2026-11-17)

New [real GitHub Actions CI #44050053619](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619) executes the pinned published real Apache PLC4X 1.0.0 Java21 program directly against a newly authored **Node `net` ISO-on-TCP/COTP/S7Comm peer**. The new fixture neither uses python-snap7 nor the original TCP relay. It returns the exact `DB1[0:12]` raw values for PLC4X's real **one-item** READ_VAR request. Java exits 0 and data is correct, but **both** a silent-COTP-close peer and an explicitly confirming-COTP-close peer independently capture the same 21 unframed trailing zero bytes, SHA256 `c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2`. The strict read+clean-close candidate remains **red**. [Original raw reports](https://github.com/Missel2/s7-compatibility-lab/actions/runs/44050053619/artifacts/14313550909) include the exact source SHA and full S7 request/response hex history. This is a second-fixture corroboration of the existing `KNOWN_UNSAFE` PLC4X 1.0.0 scenario, **not** evidence for a new driver, real PLC hardware, or any other released version. [PR #23](https://github.com/Missel2/s7-compatibility-lab/pull/23) remains unmerged pending checks/review.
