# Core demonstration — hackathon-only increment

Run from the repository root with Node.js 22:

```sh
node --test test/*.test.mjs
node tools/review-demo.mjs
```

The terminal example loads `examples/escena-prueba.txt`, simulates ONE proposal, validates the line reference, and requests an explicit keyboard decision: type `APROBAR` to produce a cue in `DRAFT` status, or another answer to reject it.

**Limitations:** this example is not Meta AI inference, has no audio asset or playback, and provides no GUI. `mock-intro.wav` is only an illustrative asset identifier. Do not describe it as real AI integration or a functional live show.

The review function revalidates AI data against the current script and asset index, never invokes playback, and returns only data. The eventual UI must derive `operatorConfirmed` from an actual user event, never from AI output.

The test suite covers the three isolated core modules and the integrated manual-review flow. Keep changes on this feature branch until CI and review pass.
