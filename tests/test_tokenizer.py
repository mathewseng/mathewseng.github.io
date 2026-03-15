from pathlib import Path

import pretty_midi

from jazz_piano_ml.tokenizer import JazzMidiTokenizer


def _make_phrase(path: Path) -> None:
    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    instrument = pretty_midi.Instrument(program=0)
    instrument.notes.extend(
        [
            pretty_midi.Note(velocity=90, pitch=60, start=0.0, end=0.5),
            pretty_midi.Note(velocity=100, pitch=64, start=0.5, end=1.0),
            pretty_midi.Note(velocity=95, pitch=67, start=1.0, end=1.75),
        ]
    )
    midi.instruments.append(instrument)
    midi.write(str(path))


def test_tokenizer_roundtrip_preserves_note_count(tmp_path: Path) -> None:
    source = tmp_path / "phrase.mid"
    _make_phrase(source)

    tokenizer = JazzMidiTokenizer()
    tokens = tokenizer.tokenize_file(source)
    reconstructed = tokenizer.tokens_to_midi(tokens)

    assert tokens[0] == "<BOS>"
    assert tokens[-1] == "<EOS>"
    assert len(reconstructed.instruments[0].notes) == 3
