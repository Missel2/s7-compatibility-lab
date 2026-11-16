# Roadmap — independent S7 compatibility lab

## Phase 1 — bootstrap (this PR)
- [x] Dedicated public repository and standalone source/license provenance
- [x] Synthetic loopback fixture, independent wire observer and observer self-tests **implemented**
- [ ] Exact-head GitHub CI proving all tests run and pass
- [ ] Protected default branch and explicit human review rules

## Phase 2 — independent S7Comm adapters
- [~] Install real JavaScript/Node-RED and Rust/Node-RED candidates by exact published package versions and integrity pins: Rust 1.4.0 characterization implemented, JS adapter and a committed fully reproducible lock still pending
- [ ] Migrate original READ_VAR malformed-reply tests, multi-item write padding, lost ACK and teardown fault scenarios from [source PR #58](https://github.com/Missel2/node-red-contrib-s7/pull/58)
- [ ] Keep candidate actual RED failures in reports; a new candidate's safety gate fails hard
- [ ] Include positive controls, source SHAs, wire references, readbacks, artifacts, and all original provenance

## Phase 3 — historical issue coverage
- [ ] Transfer 293-issue *metadata* inventory and 22-case risk manifest with explicit PENDING states (not 293 executable tests)
- [ ] Implement remaining highest-priority checks: 24-bit S7ANY address bounds, multi-PDU writes, late/incorrect response reference, concurrency, half-open/reconnect/ECONNRESET, stress and datatypes
- [ ] Reuse fuzzer mutation strategies from Rust projects with independent oracle, bounded runtime and crash inputs
- [ ] Introduce optional Linux glibc/musl and Node-RED 4/5 matrix; unsupported platforms are N/A

## Phase 4 — upstream fixes and governance
- [ ] Open isolated source-fix PRs to Rust and/or other maintained implementations: no ambiguous write replay, enforce PDU reference, bounded COTP teardown
- [ ] Add hardware-verification debt and explicit human authorization gates for an isolated test PLC; no public PR code on a hardware-accessible runner
- [ ] Only discuss archiving legacy JavaScript repositories after complete lab migration, evidence preservation and explicit approval

Current external evidence: [CURRENT_EVIDENCE.md](CURRENT_EVIDENCE.md).
