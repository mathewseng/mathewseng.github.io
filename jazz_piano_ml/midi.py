from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import pretty_midi


@dataclass(slots=True)
class MidiNormalizationConfig:
    min_pitch: int = 21
    max_pitch: int = 108
    min_duration_sec: float = 0.03
    duplicate_tolerance_sec: float = 0.02
    merge_program_to_acoustic_piano: bool = True


@dataclass(slots=True)
class MidiStats:
    note_count_in: int
    note_count_out: int
    dropped_short_notes: int
    dropped_out_of_range_notes: int
    deduplicated_notes: int
    estimated_tempo: float

    def to_dict(self) -> dict[str, float | int]:
        return asdict(self)


def _collect_notes(midi: pretty_midi.PrettyMIDI) -> list[pretty_midi.Note]:
    notes: list[pretty_midi.Note] = []
    for instrument in midi.instruments:
        if instrument.is_drum:
            continue
        notes.extend(instrument.notes)
    return notes


def _dedupe_notes(
    notes: list[pretty_midi.Note],
    duplicate_tolerance_sec: float,
) -> tuple[list[pretty_midi.Note], int]:
    deduped: list[pretty_midi.Note] = []
    deduped_count = 0
    last_by_pitch: dict[int, pretty_midi.Note] = {}
    for note in notes:
        last = last_by_pitch.get(note.pitch)
        if last is not None:
            same_start = abs(last.start - note.start) <= duplicate_tolerance_sec
            same_end = abs(last.end - note.end) <= duplicate_tolerance_sec
            if same_start and same_end:
                if note.velocity > last.velocity:
                    last.velocity = note.velocity
                deduped_count += 1
                continue
            if note.start < last.end:
                last.end = min(last.end, note.start)
        new_note = pretty_midi.Note(
            velocity=int(note.velocity),
            pitch=int(note.pitch),
            start=float(note.start),
            end=float(max(note.end, note.start + 1e-3)),
        )
        deduped.append(new_note)
        last_by_pitch[note.pitch] = new_note
    return deduped, deduped_count


def normalize_pretty_midi(
    midi: pretty_midi.PrettyMIDI,
    config: MidiNormalizationConfig | None = None,
) -> tuple[pretty_midi.PrettyMIDI, MidiStats]:
    cfg = config or MidiNormalizationConfig()
    estimated_tempo = float(midi.estimate_tempo() or 120.0)
    raw_notes = sorted(_collect_notes(midi), key=lambda note: (note.start, note.pitch, note.end))

    filtered: list[pretty_midi.Note] = []
    dropped_short = 0
    dropped_out_of_range = 0
    for note in raw_notes:
        if note.pitch < cfg.min_pitch or note.pitch > cfg.max_pitch:
            dropped_out_of_range += 1
            continue
        duration = note.end - note.start
        if duration < cfg.min_duration_sec:
            dropped_short += 1
            continue
        filtered.append(
            pretty_midi.Note(
                velocity=max(1, min(127, int(note.velocity))),
                pitch=int(note.pitch),
                start=float(note.start),
                end=float(note.end),
            )
        )

    deduped, deduped_count = _dedupe_notes(filtered, cfg.duplicate_tolerance_sec)

    output_midi = pretty_midi.PrettyMIDI(initial_tempo=estimated_tempo)
    program = pretty_midi.instrument_name_to_program("Acoustic Grand Piano")
    instrument = pretty_midi.Instrument(program=program if cfg.merge_program_to_acoustic_piano else 0)
    instrument.notes = deduped
    output_midi.instruments.append(instrument)

    stats = MidiStats(
        note_count_in=len(raw_notes),
        note_count_out=len(deduped),
        dropped_short_notes=dropped_short,
        dropped_out_of_range_notes=dropped_out_of_range,
        deduplicated_notes=deduped_count,
        estimated_tempo=estimated_tempo,
    )
    return output_midi, stats


def normalize_midi_file(
    input_path: str | Path,
    output_path: str | Path,
    config: MidiNormalizationConfig | None = None,
) -> MidiStats:
    input_midi = pretty_midi.PrettyMIDI(str(input_path))
    normalized, stats = normalize_pretty_midi(input_midi, config)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    normalized.write(str(output))
    return stats


def validate_midi_file(path: str | Path) -> dict[str, float | int | bool]:
    midi = pretty_midi.PrettyMIDI(str(path))
    notes = _collect_notes(midi)
    overlapping = 0
    last_end_by_pitch: dict[int, float] = {}
    for note in sorted(notes, key=lambda item: (item.start, item.pitch)):
        last_end = last_end_by_pitch.get(note.pitch, -1.0)
        if note.start < last_end:
            overlapping += 1
        last_end_by_pitch[note.pitch] = max(last_end, note.end)

    return {
        "note_count": len(notes),
        "estimated_tempo": float(midi.estimate_tempo() or 120.0),
        "has_notes": bool(notes),
        "overlapping_same_pitch_notes": overlapping,
    }
