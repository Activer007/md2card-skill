# Local quality gate: FAIL

Mode: **fast**. Commit: `0ce7e161b20d2bad1dd789150dd16acd98b00c2f`.
Started: 2026-10-26T11:32:47.717Z. Finished: 2026-10-26T11:38:15.300Z.

Human visual acceptance: **not-performed**. PASS applies only to the selected scope.

| Check | Status | Seconds | Reason / logs |
| --- | --- | ---: | --- |
| static | PASS | 0.1 | Exit 0 [stdout](logs/004-static.stdout.log) · [stderr](logs/004-static.stderr.log) |
| unit | FAIL | 321.9 | Exit 1 [stdout](logs/008-unit.stdout.log) · [stderr](logs/008-unit.stderr.log) |
| doctor | NOT-RUN | 0.0 | Outside selected mode/target  |
| browser | NOT-RUN | 0.0 | Outside selected mode/target  |
| pdf-rasterizer | NOT-RUN | 0.0 | Outside selected mode/target  |
| test | NOT-RUN | 0.0 | Outside selected mode/target  |
| integration | NOT-RUN | 0.0 | Outside selected mode/target  |
| gallery-check | NOT-RUN | 0.0 | Outside selected mode/target  |
| evidence | NOT-RUN | 0.0 | Outside selected mode/target  |
| baseline-screenshot-stage | NOT-RUN | 0.0 | Outside selected mode/target  |
| screenshot-stage | NOT-RUN | 0.0 | Outside selected mode/target  |
| baseline-photo-cover | NOT-RUN | 0.0 | Outside selected mode/target  |
| photo-cover | NOT-RUN | 0.0 | Outside selected mode/target  |
| baseline-visual-audit | NOT-RUN | 0.0 | Outside selected mode/target  |
| visual-audit | NOT-RUN | 0.0 | Outside selected mode/target  |
| baseline-wechat-covers | NOT-RUN | 0.0 | Outside selected mode/target  |
| wechat-covers | NOT-RUN | 0.0 | Outside selected mode/target  |
| gallery | NOT-RUN | 0.0 | Outside selected mode/target  |
| source-unchanged | PASS | 2.4 |   |

Full commands, exit codes, environment, test counts, baseline identities and hashes: [report.json](report.json).

Artifact inventory: [artifacts.json](artifacts.json). Reports are authenticated by [receipt.json](receipt.json); the receipt is not a signature.
