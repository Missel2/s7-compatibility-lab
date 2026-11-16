# Reused source and license provenance

Snapshot date: 2026-11-16. Original public repository: [Missel2/node-red-contrib-s7](https://github.com/Missel2/node-red-contrib-s7) (a GPL-3.0-or-later fork of [st-one-io/node-red-contrib-s7](https://github.com/st-one-io/node-red-contrib-s7)). Source ref: [e94bb29490f8ecfd22fdc7f6cf4e6e012e784393](https://github.com/Missel2/node-red-contrib-s7/tree/e94bb29490f8ecfd22fdc7f6cf4e6e012e784393).

| Current file | Exact source in reference | Adaptation |
| --- | --- | --- |
| `lib/wire-peer.cjs` | `test/runtime-lab/wire-peer.cjs` | Location only; no functional edits |
| `fixtures/s7_server.py` | `test/protocol/fixture_server.py` | Location only; no functional edits |
| `test/wire-peer-header.test.cjs` | `test/comparison/wire-proxy-header-safety.test.cjs` | Adjust relative import path only |
| `requirements/python-snap7.txt` | `test/runtime-lab/requirements.txt` | Location only; original exact version and SHA-256 |
| `LICENSE` | `LICENSE` | Copy GPL version 3 full license text; the original package declares GPL-3.0-or-later |

Other files in this bootstrap were written for this lab. We retain the source authors' copyright and license notices. The GPL-3.0-or-later license of the imported source continues to apply; the copyright and license of independent third-party dependencies are **not** changed. The library `python-snap7` is installed separately from PyPI; it is not part of the published lab source.

The prior [comparison PR #58](https://github.com/Missel2/node-red-contrib-s7/pull/58) includes additional tests and historical records. Those are **not all copied** in this first stage; any later migration must update this provenance table and re-verify the CI semantics.

## Phase 2 — external candidate harness transfers (2026-11-16)

Both GPL-3.0-or-later candidate test files are adapted from the same [exact former reference commit](https://github.com/Missel2/node-red-contrib-s7/tree/e94bb29490f8ecfd22fdc7f6cf4e6e012e784393); their source retains its original copyright/license. Adapted imports and fixture path only.

| New file | Original location | Change |
| --- | --- | --- |
| `test/candidates/rust-malformed-read.cjs` | `test/comparison/malformed-read.cjs` | independent proxy and server paths |
| `test/candidates/rust-fault-parity.cjs` | `test/comparison/rust-ci-parity.cjs` | independent proxy and server paths |

`scripts/assess-rust-v1.4.0.cjs`, assessment tests and standalone workflow are new; they do not incorporate native Rust source. Published Rust is installed separately from npm, unmodified, under its own LGPL-3.0-only license. The repo itself stays GPL-3.0-or-later.
