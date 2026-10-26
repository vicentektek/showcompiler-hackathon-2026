# Proposal review core — hackathon-only implementation

Branch: `feat/hackathon-script-core` (not merged).

## Scope

The review module is a **pure domain function**. It never invokes audio, network, a model, or hardware.

`reviewCueProposal({ proposal, decision, scriptLines, assetIds, existingCues, cueId, operatorConfirmed })`

- `decision` must be `APPROVE` or `REJECT`.
- Only a proposal with `status: 'PENDING'` can be reviewed.
- Source references and assets are validated again at the review boundary.
- `APPROVE` requires `operatorConfirmed: true` supplied **only by a genuine UI interaction**.
- Successful approval creates a `DRAFT` cue; it is NOT armed, loaded, scheduled, or played.
- `REJECT` returns no cue.
- Duplicate cue IDs, proposal references, malformed cue lists and numbering overflow are blocked.
- This function does not modify the inputs; the calling application must persist the result.

## Known limitations / future controls

- A boolean does not authenticate a human. The future UI must ensure only a direct user click produces approval; model output and tool calls must not control this flag.
- No durable ledger of decisions exists yet. UI persistence must prevent repeated approval/rejection, including after a reload or between devices.
- Proposal validation currently permits only PLAY actions. STOP and FADE require separate, typed validation with runtime targeting rules.
- This module does not implement a preflight, transport, sample clock, audio output or live mode.
- The source-code tests run in a copied isolated Node.js environment; GitHub CI and a full application build are pending.

## Repeatable local test

With Node.js 20+ installed:

```sh
npm test
```

No install step or paid service is required.
