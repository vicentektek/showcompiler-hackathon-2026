# RUNQ — Third-party dependencies and media clearance

**State: inventory complete only to the extent of currently identified source paths; licenses and distribution rights have NOT been independently cleared.** This is a submission preparation checklist, not legal advice.

## Direct Node dependencies (from frozen `package.json`)

| Package | Recorded version | Function | Distribution verification |
| --- | --- | --- | --- |
| `libarchive.js` | `2.0.2` | Read supported compressed audio archives | Check package and bundled WASM licence/attribution before repackaging |
| `mammoth` | `1.12.3` | DOCX text extraction | Check package licence and notices |
| `pdfjs-dist` | `6.5.438` | Text-based PDF import | Check package licence and notices |

Development-only browser automation can install `playwright-core` explicitly for CI; it is not listed as a frozen runtime dependency. See `.github/workflows/core-tests.yml` for the actual CI install. Use `package.json` and the current lockfile as source of truth. Do not imply this table proves a legal audit.

## Media and bundled assets requiring owner review

| Path / group | Intended role | Publication check |
| --- | --- | --- |
| `assets/runq-backstage.png`, `assets/runq-logo-full.png`, `assets/runq-q.png`, `assets/runq-wordmark.png` | RUNQ identity / imagery | Confirm original authorship or usage rights |
| `demo/RUNQ_ENSAYO_ES.showcompiler.zip` | Demo show archive | Open ZIP; verify all embedded scripts and audio are owned or appropriately licensed |
| `demo/SHOWCOMPILER_SHOW_DEMO.showcompiler.zip` | Generated full-show archive (may be ignored/untracked) | Verify generated output and rights before upload |
| `docs/design-references/RUNQ_referencias_visuales_A-H.zip` | Archived visual references | **Do not distribute blindly**. Inspect ownership, included files and licenses |
| `fixtures/`, `examples/` | Synthetic or test scripts | Check no real private theatrical/customer script is embedded |
| Screen recordings, music, voice-over, SFX | Video submission | Retain provenance and platform rights; ensure no private credentials or copyrighted material appear |

The repository's historical documentation describes some test media as original/rights-clear; this file does not independently validate that claim.

## Audio provider / model provenance

- **Meta Muse Spark:** optional inference in final product; attribute usage accurately and comply with current API terms.
- **Modal + Stable Audio:** historical research/pilot, **no new Modal generation in frozen demo**. Avoid advertising as a live submission feature. Historical outputs included in media must still have clear rights.
- **Baseten/Fireworks:** previous integration/evaluation research, not automatic evidence of participation or use in the final run.
- **Future Meta audio:** hypothetical compatibility path; not a verified currently integrated or available endpoint.

## Decision required before sharing

1. Decide what repository contents will actually be accessible to judges.
2. Inspect every ZIP/image/audio to be included in that snapshot.
3. Validate third-party dependency licenses/notices from installed packages and their upstream terms.
4. Check whether a root source-code license is required by the authenticated portal. Do **not** assign MIT or any other license without owner instruction.
5. Run secret scan from [release security audit](RELEASE_SECURITY_AUDIT_2026-11-03.md) before public exposure.
6. Record final rights approval and distribution scope in the release checklist.

No asset, source history or old experiment was deleted during this documentation audit.
