# Exact historical S7-ERR-001 regression: @missel2 alpha2

This test **reconstructs the published historical test pairing**, rather than substituting the modern, differently owned `@oriolrius` wrapper:

| Component | Pinned evidence |
| --- | --- |
| Wrapper source | `Missel2/node-red-contrib-s7@e94bb29490f8ecfd22fdc7f6cf4e6e012e784393` |
| Wrapper package | `@missel2/node-red-contrib-s7@0.1.0-alpha.2`, generated using `npm pack --ignore-scripts` in an isolated GitHub-hosted CI workspace |
| Wrapper tarball | SHA-256 `316d6769431fffb805b07c825a5f474e875174843f4e8e6b6da9bffca02f2c24`; exact match required against the original [red source CI #43869072608](https://github.com/Missel2/node-red-contrib-s7/actions/runs/43869072608) |
| Effective JS transport | npm alias `@st-one-io/nodes7` -> `@missel2/nodes7@0.1.0-alpha.2`, exact registry tarball and SRI `sha512-4Lmejz+WT5YOLHBXfdSForyHltgct5A9J1indi0Q/sxZKpGIY2omRrjSMRU6fKeW6YDAb+jwAjjEz7hQE/Z9pQ==` |
| Transport dependency | Historical wrapper source lock: `iso-on-tcp@0.1.0`, SHA-512 `ty4/0A...`; **current unmodified npm consumer** resolves `iso-on-tcp@0.1.1`, SHA-512 `DP/7lk...` (both versions/integrities independently documented). The historic original CI consumer lock's exact resolution is not established from available logs. |
| Host and synthetic server | Node 22.23.4; Node-RED 5.0.9; node-red-node-test-helper 0.3.6; python-snap7==3.3.1 verified by existing hash-required requirements |
| Native dependency used only for declared fixture identity | Published Rust 1.4.0; no fake NAPI addon |

The original independent test, adapted from [historical source at e94bb294](https://github.com/Missel2/node-red-contrib-s7/blob/e94bb29490f8ecfd22fdc7f6cf4e6e012e784393/test/comparison/historical-s7-regressions.cjs), first proves single BYTE write succeeds. It then sends three distinct BYTE values `[15,29,43]` to synthetic DB1 offsets `[1801,1803,1805]`, reads the three bytes back using the installed historical package, counts actual wire WRITE_VAR requests, and records SHA-256 of each actual TPKT frame observed at the relay.

The **original historical CI** returned readback `[15,11,13]` (one request, one byte written, then `NodeS7Error 0x07`). This lab's new independent assessor is **fail closed**: only a real strict candidate exit `1` with the matching three values, one observed write, positive single-byte control, valid wire transcript, correct source commit, clean teardown and measured partial application may be characterized as `PARTIAL_WRITE_KNOWN_UNSAFE`. It rejects crashes, missing evidence, unknown candidate versions, zero applied bytes, and incomplete reads.

The deliberately red original candidate process must **not** be disguised as a passing candidate. A green *characterization* workflow means the historical unsafe baseline was honestly measured; it is never a release qualification. The published `@oriolrius/node-red-contrib-s7@4.4.1` on the same fixture previously returned all three requested bytes, as [shown in the separate modern baseline](PUBLISHED_JS_BYTE_WRITE.md). That does **not** establish which commit fixed the historical bug; a genuine source-bisect and release gate are future work.

This lab is software-only, GitHub-hosted with 127.0.0.1 disposable fixture. It does not test any industrial Siemens PLC or authorize field use. No npm publishing or cluster changes.

## Provenance caveat for current npm resolution

The source repository's original `package-lock.json` pins `iso-on-tcp@0.1.0`, but the package manifest inherited by the packed wrapper specifies `^0.1.0`. Installing the same wrapper today without a locked consumer dependency tree resolved `iso-on-tcp@0.1.1` with registry SRI `sha512-DP/7lkUeOrTCmv6oveycd62lmfGI3I2qQo9hDRMKfpsrN27Z3FUqtd7NXMSJOw7P9+6AN8D/PRoSUQ/rzy+M4g==`. The original consumer used `npm install` without an explicitly locked consumer tree; the original runner's iso-on-tcp version cannot currently be certified from its logs. We **do not** override any host dependency or claim the full consumer tree is byte-for-byte identical. The wrapper tarball and effective `@missel2/nodes7` registry package are independently exact-hash verified. This is a version-specific reproduction with a fully recorded modern installation environment, not proof of an identical complete 2026 historical process image.
