from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Iterable

from .schemas import DatasetItem, derive_item_id

AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff", ".m4a"}
MIDI_EXTENSIONS = {".mid", ".midi"}


def _iter_files(root: Path, extensions: set[str]) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in extensions:
            yield path


def scan_audio_directory(root: str | Path, source_type: str = "unknown_audio") -> list[DatasetItem]:
    root_path = Path(root)
    return [
        DatasetItem(
            item_id=derive_item_id(path),
            source_type=source_type,
            audio_path=str(path.resolve()),
        )
        for path in _iter_files(root_path, AUDIO_EXTENSIONS)
    ]


def scan_midi_directory(root: str | Path, source_type: str = "unknown_midi") -> list[DatasetItem]:
    root_path = Path(root)
    return [
        DatasetItem(
            item_id=derive_item_id(path),
            source_type=source_type,
            raw_midi_path=str(path.resolve()),
        )
        for path in _iter_files(root_path, MIDI_EXTENSIONS)
    ]


def write_manifest_jsonl(items: Iterable[DatasetItem], output_path: str | Path) -> Path:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(item.to_dict(), sort_keys=True) + "\n")
    return output


def read_manifest_jsonl(path: str | Path) -> list[DatasetItem]:
    manifest_path = Path(path)
    items: list[DatasetItem] = []
    with manifest_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            items.append(DatasetItem.from_dict(json.loads(line)))
    return items


def split_manifest(
    items: list[DatasetItem],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    seed: int = 42,
) -> dict[str, list[DatasetItem]]:
    if train_ratio <= 0 or val_ratio <= 0 or train_ratio + val_ratio >= 1:
        raise ValueError("train_ratio and val_ratio must be positive and leave room for test split.")

    shuffled = list(items)
    random.Random(seed).shuffle(shuffled)
    total = len(shuffled)
    train_cutoff = int(total * train_ratio)
    val_cutoff = train_cutoff + int(total * val_ratio)

    splits = {
        "train": shuffled[:train_cutoff],
        "val": shuffled[train_cutoff:val_cutoff],
        "test": shuffled[val_cutoff:],
    }
    for split_name, split_items in splits.items():
        for item in split_items:
            item.split = split_name
    return splits


def write_split_manifests(splits: dict[str, list[DatasetItem]], output_dir: str | Path) -> dict[str, Path]:
    output_root = Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for split_name, split_items in splits.items():
        path = output_root / f"{split_name}.jsonl"
        written[split_name] = write_manifest_jsonl(split_items, path)
    return written
