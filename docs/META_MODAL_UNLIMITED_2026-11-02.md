# Meta and Modal: local budget caps removed

Owner instruction, 2 November 2026: remove local budget limitations for manual testing, demo use, and automatic CLI batteries.

Default runtime behavior:

- Meta shared and local journals record estimates without enforcing the historical USD 65/100 ceilings, cumulative request caps or per-run budget arguments.
- Modal does not enforce the USD 35 campaign allocation, daily spending/start counts, per-request cost acknowledgement, or require cost environment variables. Its persistent job journal still prevents duplicate submissions.
- Sound Lab and whole-show preparation accept the server's `budgetLimitsDisabled: true` status. Unknown cost estimates remain `null`, including reviewed asset provenance and saved projects; existing numeric estimates remain compatible.
- Seminar, systematic, agent, Modal pilot, latency and additional EUR 60 battery no longer stop because of local monetary budgets. Existing `--budget-usd` arguments remain parseable for compatibility and are informational. Selected case counts, duration/token bounds and explicit live flags remain.
- Historical cap fields in saved ledgers are retained as history. No ledger is reset. Legacy `enforceBudget: true` / `budgetLimitsDisabled: false` injection is retained for historical regression tests only; no normal application or CLI path enables it.

Restart the local Node server and reload the browser to use the changes. No new flag or budget increase is needed. Provider account balances, service quotas and availability are outside this repository.

Work started on `feat/runq-ai-campaign-100-2026-10-31`, HEAD `6325e77c98ab4b072e8219028529a877110d545e`, tracking the same origin branch. Existing uncommitted work was preserved. The remote `fix/manual-meta-modal-unlimited-2026-11-02` only changed one Meta route; it was not merged because this task also covers other routes, Modal and CLI batteries. No PR or CI run was created.

Tests use temporary journals and simulated providers. The additional one-command battery belongs to Assistant Expert V3 and still needs `src/qa/assistantV3Evaluation.mjs` and `src/core/agentExpertContext.mjs`, absent from this checkout; its source and bundled copy can be syntax-checked here, but its complete execution cannot be verified here. No paid requests were made.

Verification completed:

- `node --test test/unlimitedProviderBudget.test.mjs`: initially reproduced the old shared, daily and seminar budget blocks; now covered in the complete passing suite. Tests exercise over-cap monetary and request history, the actual Meta transport with a fake provider, and the actual local Modal route without cost configuration.
- `npm test`: 817 passed, 0 failed, all offline; rerun on the tagged commit after packaging to pin the result to the published source.
- `npm run check:syntax`: passed.
- `node tools/sfx-lab-browser-e2e.mjs`: passed in headless Chrome, using missing cost estimates and disabled budget limits; provider calls intercepted. Generation, review/import and local transport smoke checks passed. This does not establish live provider availability or audible hardware output.
- `git diff --check`: passed.
- Existing battery overlay ZIP: integrity verified and updated; original saved privately in `artifacts/budget-unlimited/original-ai-battery-overlay.zip`.

Implementation files changed for this task: `src/qa/globalSpendLedger.mjs`, `campaignPolicy.mjs`; `src/core/sfxJobStore.mjs`, `sfxImportCandidate.mjs`, `projectPersistence.mjs`, `showPreparation.mjs`; `tools/agentLiveBudget.mjs`, `metaBudgetLedger.mjs`, `metaSeminarEval.mjs`, `run-meta-seminar-eval.mjs`, `runq-agent-live-eval.mjs`, `runq-systematic-lab.mjs`, `runq-modal-live-batch.mjs`, `sfx-latency-lab.mjs`, `sfxRoutes.mjs`, `runq-sfx-doctor.mjs`, `runq-quality-campaign.mjs`, `runq-ai-battery.mjs`; budget-related UI text and status handling in Sound Lab, preparation, assistant and voice screens. Relevant regression tests, owner instructions, documentation and the existing battery launcher/overlay were updated. Unrelated pre-existing edits were not reverted.
