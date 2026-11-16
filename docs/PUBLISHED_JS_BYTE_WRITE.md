# Published JavaScript 4.4.1 dispersed BYTE write characterization

This stage executes the original historical three-disjoint-BYTE-write contract through real, unmodified `@oriolrius/node-red-contrib-s7@4.4.1` and its pinned npm-resolved `@oriolrius/nodes7` transport, under Node-RED 5.0.9. Only the disposable `python-snap7==3.3.1` local server at `127.0.0.1` is written.

The previous GPL-3.0-or-later source case `test/comparison/historical-s7-regressions.cjs` (reference `e94bb29490f8ecfd22fdc7f6cf4e6e012e784393`) was independently transferred here. It uses three dispersed BYTE tags at DB1 offsets 1801, 1803 and 1805. It first proves that a **single** BYTE write to the same actual endpoint works, then requests the three-byte write with expected values `15,29,43`, reads all three back from the server, counts actual `WRITE_VAR` frames and records the observer's hashed original TPKT frames.

The separate assessor distinguishes three statuses:

- `COMPLETE_WRITE_OBSERVED`: all three bytes read back as requested; scoped healthy behavior, not a release qualification
- `PARTIAL_WRITE_KNOWN_UNSAFE`: *some but not all* requested bytes changed, supported by at least one observed wire write and the genuine strict candidate assertion failing
- `NO_WRITE_APPLIED_OR_REJECTED`: no requested bytes applied; this **cannot** by itself prove unsafe partial writing, because a complete rejection may be correct

Probe crash, timeout, inconclusive readback, missing positive controls, missing wire evidence and cleanup errors must fail the assessment rather than be mislabeled as an expected unsafe baseline. The original candidate exit code must match the independent verdict.

**Version boundary:** The historical `S7-ERR-001` concerns an earlier `@missel2/node-red-contrib-s7@0.1.0-alpha.2` build. This **different** `@oriolrius` version 4.4.1 is initially assessed as a new observed candidate and does not retroactively prove or disprove the alpha result. Contract registry S7-ERR-001 stays `HISTORICAL_ONLY` until exact historical build execution has its own result.

Linux x64 software-only; HIL remains `PENDING_HARDWARE`. The observed TCP hashes belong to the local relay; they are not signed or hardware-verified.
