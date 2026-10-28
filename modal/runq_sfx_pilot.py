"""
RunQ SFX experiment: authenticated Modal ASGI facade and one short GPU job.

NO deployment on import. Deploy manually after checking licensing/credits:
    modal deploy modal/runq_sfx_pilot.py
No test, Node startup, or browser action invokes this module.
Only SFX / ENVIRONMENT; voiceover and music are intentionally NOT implemented.
"""
import hashlib
import io
import re
import wave

import modal

APP_NAME = "runq-sfx-pilot"
MODEL_ID = "stabilityai/stable-audio-3-small-sfx"
MAX_SECONDS = 12
MAX_WAV_BYTES = 4 * 1024 * 1024
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$")

app = modal.App(APP_NAME)

# Deliberately a pilot, not an optimized production image. The upstream
# stable-audio-3 commit is pinned (never a moving branch) and GPU load/VRAM
# must still be benchmarked before any production deployment.
UPSTREAM_COMMIT = "77e0398c26f7d22d801ec1bb036307e8b231f741"
worker_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libsndfile1")
    .pip_install(
        "torch==2.7.1", "torchaudio==2.7.1", "soundfile>=0.13.1",
        "git+https://github.com/Stability-AI/stable-audio-3.git@" + UPSTREAM_COMMIT,
    )
)
api_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi>=0.115,<1", "modal>=1.6,<2"
)


# HF_TOKEN is injected from the Modal secret "huggingface-secret" (workspace
# audiomaclet, environment main). It exists only inside Modal volumes/secrets,
# never in this repository or logs. The weights are gated on Hugging Face and
# the operator account must have accepted stabilityai/stable-audio-3-small-sfx
# terms before the token can download them.
# Keep the model resident across calls handled by the SAME warm GPU worker.
# A cache declared inside generate_sfx was recreated on every request, causing
# avoidable model initialization. New containers still load once on first use.
from functools import lru_cache


@lru_cache(maxsize=1)
def get_model():
    from stable_audio_3 import StableAudioModel
    return StableAudioModel.from_pretrained("small-sfx", device="cuda")


@app.function(
    # Fallback improves scheduling when L4 is temporarily unavailable.
    # Both L4 and A10 have 24 GiB VRAM; validate performance on A10 before demo.
    # Stay scale-to-zero: no permanent idle GPU billing.
    image=worker_image, gpu=["L4", "A10"], timeout=180, retries=0,
    min_containers=0, max_containers=1, scaledown_window=120,
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
def generate_sfx(prompt: str, duration_seconds: int, seed: int) -> bytes:
    """One short audio generation. FunctionCall result is never linked to cues."""
    import soundfile as sf

    if not 1 <= duration_seconds <= MAX_SECONDS or not 0 <= seed <= 2147483647:
        raise ValueError("Out of pilot bounds")
    if not isinstance(prompt, str) or not 0 < len(prompt.strip()) <= 1000:
        raise ValueError("Invalid prompt")

    audio = get_model().generate(
        prompt=prompt, duration=duration_seconds, seed=seed,
        steps=8, batch_size=1,
    )
    if audio.ndim == 3:
        audio = audio[0]
    if audio.ndim != 2 or audio.shape[0] not in (1, 2):
        raise ValueError("Unexpected model waveform shape")

    pcm = audio.detach().float().cpu().clamp(-1.0, 1.0)
    wav_io = io.BytesIO()
    sf.write(wav_io, pcm.transpose(0, 1).numpy(), 44100,
             format="WAV", subtype="PCM_16")
    wav = wav_io.getvalue()
    if not 44 <= len(wav) <= MAX_WAV_BYTES:
        raise ValueError("Generated audio exceeds the 12-second pilot envelope")
    return wav


def wav_info(data: bytes) -> dict:
    if not isinstance(data, bytes) or len(data) > MAX_WAV_BYTES:
        raise ValueError("Invalid WAV bytes")
    with wave.open(io.BytesIO(data), "rb") as fh:
        if fh.getcomptype() != "NONE" or fh.getsampwidth() != 2:
            raise ValueError("Only PCM16 WAV supported")
        channels, rate, frames = fh.getnchannels(), fh.getframerate(), fh.getnframes()
    if channels not in (1, 2) or rate < 16000 or rate > 96000:
        raise ValueError("Unsupported WAV metadata")
    duration = frames / rate
    if not 0 < duration <= 13:
        raise ValueError("Invalid WAV duration")
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "durationSeconds": duration, "channels": channels,
        "sampleRateHz": rate, "byteLength": len(data),
    }


@app.function(image=api_image, timeout=60, min_containers=0, max_containers=1)
@modal.asgi_app(requires_proxy_auth=True)
def web():
    """Modal proxy auth protects the entire endpoint BEFORE FastAPI."""
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import Response
    from pydantic import BaseModel, Field

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    class JobRequest(BaseModel):
        requestId: str
        authorizationId: str
        sourceLineId: str | None = None
        kind: str
        modelCandidate: str
        prompt: str = Field(min_length=1, max_length=1000)
        durationSeconds: int = Field(ge=1, le=MAX_SECONDS)
        seed: int = Field(ge=0, le=2147483647)

    def valid_job_id(job_id: str):
        if not SAFE_ID.fullmatch(job_id):
            raise HTTPException(status_code=400, detail="Invalid job identifier")

    def get_result(job_id: str):
        valid_job_id(job_id)
        try:
            call = modal.FunctionCall.from_id(job_id)
            result = call.get(timeout=0)
        except TimeoutError:
            return None
        except Exception:
            raise HTTPException(status_code=409, detail="Job failed or unavailable")
        if not isinstance(result, bytes):
            raise HTTPException(status_code=502, detail="Invalid model result")
        return result

    @api.post("/jobs", status_code=202)
    def start_job(data: JobRequest):
        for field in (data.requestId, data.authorizationId):
            if not SAFE_ID.fullmatch(field):
                raise HTTPException(status_code=422, detail="Invalid request identifier")
        if data.sourceLineId is not None and not SAFE_ID.fullmatch(data.sourceLineId):
            raise HTTPException(status_code=422, detail="Invalid script reference")
        if data.kind not in ("SFX", "ENVIRONMENT") or data.modelCandidate != MODEL_ID:
            raise HTTPException(status_code=422, detail="Unsupported pilot model or kind")
        if re.search(r"(?:https?|data|file):", data.prompt, flags=re.I):
            raise HTTPException(status_code=422, detail="URLs are not allowed in prompts")

        # IMPORTANT: this endpoint is for a single trusted development operator.
        # Durable idempotency/spend ledger is required before allowing multi-user use.
        call = generate_sfx.spawn(
            data.prompt.strip(), data.durationSeconds, data.seed
        )
        return {"jobId": call.object_id, "status": "QUEUED"}

    @api.get("/jobs/{job_id}")
    def job_status(job_id: str):
        result = get_result(job_id)
        if result is None:
            return {"jobId": job_id, "status": "RUNNING"}
        try:
            info = wav_info(result)
        except Exception:
            raise HTTPException(status_code=502, detail="Invalid WAV result")
        return {"jobId": job_id, "status": "COMPLETED", "wav": info}

    @api.get("/jobs/{job_id}/audio")
    def job_audio(job_id: str):
        result = get_result(job_id)
        if result is None:
            raise HTTPException(status_code=409, detail="Job not completed")
        try:
            wav_info(result)
        except Exception:
            raise HTTPException(status_code=502, detail="Invalid WAV result")
        return Response(result, media_type="audio/wav",
                        headers={"Cache-Control": "no-store"})

    @api.post("/jobs/{job_id}/cancel")
    def cancel_job(job_id: str):
        valid_job_id(job_id)
        try:
            modal.FunctionCall.from_id(job_id).cancel()
        except Exception:
            raise HTTPException(status_code=409, detail="Cancellation unavailable")
        # Acknowledges the request; the client must verify final state separately.
        return {"jobId": job_id, "status": "CANCEL_REQUESTED"}

    return api
