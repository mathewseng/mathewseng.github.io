from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class DatasetItem:
    item_id: str
    source_type: str
    audio_path: str | None = None
    raw_midi_path: str | None = None
    normalized_midi_path: str | None = None
    split: str | None = None
    tempo_bpm_est: float | None = None
    time_signature: str | None = "4/4"
    swing_ratio_est: float | None = None
    style_tags: list[str] = field(default_factory=list)
    piano_prominence: float | None = None
    human_corrected: bool = False
    quality_tier: int = 3
    duration_sec: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "DatasetItem":
        known_fields = {
            "item_id",
            "source_type",
            "audio_path",
            "raw_midi_path",
            "normalized_midi_path",
            "split",
            "tempo_bpm_est",
            "time_signature",
            "swing_ratio_est",
            "style_tags",
            "piano_prominence",
            "human_corrected",
            "quality_tier",
            "duration_sec",
            "extra",
        }
        data = dict(payload)
        extra = data.get("extra", {})
        for key in list(data.keys()):
            if key not in known_fields:
                extra[key] = data.pop(key)
        data["extra"] = extra
        return cls(**data)


def derive_item_id(path: str | Path) -> str:
    return Path(path).stem.replace(" ", "_")
