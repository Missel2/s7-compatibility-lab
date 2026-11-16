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
