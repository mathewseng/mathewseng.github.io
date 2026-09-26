from __future__ import annotations

import shutil
from pathlib import Path


class TranscriptionError(RuntimeError):
    """Raised when a transcription backend cannot complete inference."""


def available_backends() -> list[str]:
    backends = ["passthrough"]
    try:
        import basic_pitch  # noqa: F401
    except ImportError:
        return backends
    return backends + ["basic-pitch"]


def transcribe_audio_file(
    audio_path: str | Path,
    output_midi_path: str | Path,
    backend: str = "passthrough",
    sidecar_midi: str | Path | None = None,
) -> Path:
    output = Path(output_midi_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    if backend == "passthrough":
        source = Path(sidecar_midi) if sidecar_midi else Path(audio_path).with_suffix(".mid")
        if not source.exists():
            raise TranscriptionError(
                "Passthrough backend expects a sidecar MIDI file. Supply --sidecar-midi or place a .mid next to the audio file."
            )
        shutil.copy2(source, output)
        return output

    if backend == "basic-pitch":
        try:
            from basic_pitch.inference import predict
        except ImportError as exc:
            raise TranscriptionError(
                "basic-pitch backend requested but the optional dependency is not installed. Run pip install -e '.[transcription]'."
            ) from exc

        _, midi_data, _ = predict(str(audio_path))
        midi_data.write(str(output))
        return output

    raise TranscriptionError(f"Unsupported transcription backend: {backend}")
