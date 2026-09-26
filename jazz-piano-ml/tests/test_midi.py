from pathlib import Path

import pretty_midi

from jazz_piano_ml.midi import MidiNormalizationConfig, normalize_midi_file, validate_midi_file


def _make_test_midi(path: Path) -> None:
    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    instrument = pretty_midi.Instrument(program=0)
    instrument.notes.extend(
        [
            pretty_midi.Note(velocity=80, pitch=60, start=0.0, end=0.5),
            pretty_midi.Note(velocity=100, pitch=60, start=0.0, end=0.5),
            pretty_midi.Note(velocity=90, pitch=10, start=1.0, end=1.5),
            pretty_midi.Note(velocity=70, pitch=64, start=2.0, end=2.01),
        ]
    )
    midi.instruments.append(instrument)
    midi.write(str(path))


def test_normalize_midi_file(tmp_path: Path) -> None:
    source = tmp_path / "source.mid"
    output = tmp_path / "normalized.mid"
    _make_test_midi(source)

    stats = normalize_midi_file(
        source,
        output,
        config=MidiNormalizationConfig(min_duration_sec=0.05),
    )

    assert output.exists()
    assert stats.note_count_in == 4
    assert stats.note_count_out == 1
    assert stats.deduplicated_notes == 1
    assert stats.dropped_out_of_range_notes == 1
    assert stats.dropped_short_notes == 1


def test_validate_midi_file(tmp_path: Path) -> None:
    source = tmp_path / "source.mid"
    _make_test_midi(source)
    summary = validate_midi_file(source)
    assert summary["has_notes"] is True
    assert summary["note_count"] == 4
