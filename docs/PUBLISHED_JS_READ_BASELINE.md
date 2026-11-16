# Published JavaScript malformed READ_VAR characterization

This independent probe runs **real published** `@oriolrius/node-red-contrib-s7@4.4.1` and its npm-resolved `@oriolrius/nodes7` against a pinned python-snap7 3.3.1 **disposable IPv4 loopback** server and the existing unmodified Node-RED 5.0.9 host.

The harness starts with a healthy READ_VAR/teardown positive control, then in separate processes executes three one-shot malformed reply mutations: `inconsistent_data_length`, `wrong_pdu_reference`, and `short_s7_reply`. The **original strict candidate program exits 1** if it accepts a deliberately altered reply as fresh based on independent relay observations. A separate assessor verifies the process exit, exact original error, original and delivered wire metadata, successful fixture teardown, source revision and candidate version. It refuses to treat crashes, missing files, wrong reports or timeouts as an expected unsafe baseline.

A successful **characterization** workflow can report `KNOWN_UNSAFE` when a genuine candidate safety assertion has failed; it never asserts `candidatePass=true`, and always says `NOT_QUALIFIED` or a narrower observed classification. A genuine corrected-driver release gate must make the unsafe result **red**.

**Important version distinction:** The historic `S7-ERR-001/002` findings concerned an `@missel2/node-red-contrib-s7 + nodes7` alpha build (`0.1.0-alpha.2`). This initial probe tests different, published `@oriolrius` version 4.4.1. Its outcomes **cannot** settle the historic alpha findings. Multi-item BYTE write regression S7-ERR-001 also remains untested here. A full transitive npm lockfile is not yet committed. Linux/x64 only. All Siemens hardware gates remain `PENDING_HARDWARE`.
