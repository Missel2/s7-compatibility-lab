# Rust 1.4.0 source-linked contract evidence

The executable `scripts/export-rust-contract-evidence.cjs` runs **only after** the existing independent Node-RED/Rust characterization processes in `.github/workflows/rust-known-unsafe.yml`. It re-validates the original assessor's report data and expected process exit codes, checks that all reports and the baseline identify the exact same checkout, and computes SHA-256 of each exact JSON report file.

The resulting `test-reports/rust-known-unsafe-contract-index.json` is retained with the original report artifacts and maps three established unsafe behaviors:

- `S7-ERR-003`: ambiguous WRITE_VAR silently replayed after fixture-applied write and dropped ACK.
- `S7-ERR-004`: wrong S7 PDU reference accepted as fresh.
- `S7-ERR-005`: COTP reconnect attempts after explicit flow removal.

The healthy malformed-length rejection is a **separate positive control**, not a fourth reported defect. Failures in report provenance, original assertions, source SHA, candidate process exit codes, or expected classifications fail the characterization job.

**Important evidence boundary:** `reportSha256` hashes the JSON report bytes, **not** a raw TCP packet capture. The original reports contain the independent wire-proxy observations; this index does not independently establish their authenticity beyond execution and validation in the same trusted CI job. Every mapped contract has `classification=KNOWN_UNSAFE` and `candidatePass=false`. No corrected-candidate qualification or Siemens hardware proof is implied.

The registry status `MERGED_BASELINE_UNSAFE` means this characterization is now present on the merged source branch, rather than remaining only in a draft PR. The actual CI report must still be inspected for the exact version, run, source commit and result.
