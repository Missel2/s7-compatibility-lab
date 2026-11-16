# S7 Compatibility Lab — engineering and governance contract

## Purpose
Independent evidence for S7Comm/S7CommPlus implementation behavior. **Never** turn the lab into a competing production S7 driver. Prefer improvements to established upstream implementations. Preserve provenance and make negative controls fail meaningfully when a fault is injected.

## Environment and safety
- Public CI may run **only** on GitHub-hosted software runners with disposable IPv4 loopback TCP fixtures. No self-hosted runner or remote PLC/network discovery. No real PLC credentials, routes, IPs, or hardware instructions in this repository.
- Tests that write are permitted **only** against the disposable DB1 of the local fixture. Python and Node probes must hardcode loopback; a user-supplied target host/IP must not be supported.
- Never touch production OT, publish npm packages, push release tags, automatically merge PRs, archive old repos or operate a physical PLC from this project. Require independent human approval and an isolated hardware plan for future HIL.
- Public CI checks must be bounded and shall have meaningful positive and negative controls; distinguish harness crash from candidate crash, and deterministic protocol observation from in-process stubs.

## Engineering standards
- Read README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/CURRENT_EVIDENCE.md and docs/PROVENANCE.md before changing code. Real GitHub CI and exact commit SHA outrank documentation.
- **Do not suppress real red candidate safety results.** Separate required harness health from candidate behavior. Known red results are not an implicit expected-success allowance for a new candidate.
- Record: candidate version, source digest, fixture revision, actual wire packets/ACK drops, expected vs observed bytes, exit code, cleanup and artifact URL. Never assert all 293 historical issue reports are proven defects or tests.
- No direct push to main; use a small feature branch, tests, review and explicit human merge approval. The repository is new: configure protections/rulesets before relying on them.
- No shadow modification or override of a Node-RED host's transitive dependencies. Keep host-owned advisories separate from driver-owned defects. Explicitly label platform gaps such as Rust Linux x64 vs JS Windows/ARM.
- Versioned dependency pins are necessary but insufficient. Check package integrity and licenses before including them; avoid unchecked install-time scripts and runtime downloads.
- All contributed source must have license and author attribution. Imported code provenance: docs/PROVENANCE.md; reuse remains GPL-3.0-or-later. No vendoring of Rust LGPL code or private industrial data.

## Test traceability
- HIL-S7-001..007 are **PENDING_HARDWARE**. This initial self-validation is HIL: not applicable to vendor hardware because it intentionally tests only the observation infrastructure on synthetic loopback.
- External historic source inventory and contract manifest are in our source reference PR #58. Transfer them only with their precise NOT_TESTED/PENDING semantics, after adapting their paths and origin metadata.
- Never merge a failing required check by ignoring the fault. If the harness self-test itself fails, repair the detector before interpreting candidate results.
