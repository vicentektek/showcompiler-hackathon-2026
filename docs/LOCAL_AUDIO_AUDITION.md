# Local audio audition — SHOWCOMPILER

The asset library has an **Audition** control for each audio file decoded in the current browser session. Audition is a manual operator action and does not change the prepared cue, proposal approval or current script position. It starts audio at reduced gain through the **same output device as GO**.

**Important:** this is not a private headphone bus, an independent monitor channel or professional pre-fade-listen routing. If the workstation is connected to front-of-house loudspeakers, the audience could hear it. The interface displays this limitation and requests speaker/routing confirmation before the first audition in a session.

## Workflow

1. Load a supported WAV/MP3 or another supported local file into the project, either from the library or directly from a cue.
2. Press **Audition** next to the loaded asset. The browser plays that asset at a reduced level; no cue runs GO.
3. Press **Stop audition**, or **STOP ALL** in the top toolbar, to silence it. The audio stops automatically at file end.
4. To run a cue, stop audition first. The GO buttons are unavailable during an audition, and audition cannot begin while show cues are playing or GO is pending.
5. After reloading a project JSON, load the original audio files again. No decoded sound or audition state is stored inside JSON.

## Boundary and manual acceptance

Audition never contacts an AI model or uploads file contents. It uses Web Audio and has no professional latency, routing, calibration or redundancy guarantee. This control is intended for local development and private rehearsal, not as a substitute for an isolated monitor bus.

Check playback on a low-volume device. Confirm Stop audition and STOP ALL both silence playback, a running cue blocks audition, a running audition blocks GO, reopening JSON clears decoded files, and audition does not advance the prepared-cue sequence.
