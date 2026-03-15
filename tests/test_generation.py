from pathlib import Path

import pretty_midi
import torch

from jazz_piano_ml.generation import DecoderOnlyTransformer, TransformerConfig, train_generator
from jazz_piano_ml.tokenizer import JazzMidiTokenizer


def _make_training_midi(path: Path, root_pitch: int) -> None:
    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    instrument = pretty_midi.Instrument(program=0)
    instrument.notes.extend(
        [
            pretty_midi.Note(velocity=90, pitch=root_pitch, start=0.0, end=0.5),
            pretty_midi.Note(velocity=90, pitch=root_pitch + 4, start=0.5, end=1.0),
            pretty_midi.Note(velocity=90, pitch=root_pitch + 7, start=1.0, end=1.5),
        ]
    )
    midi.instruments.append(instrument)
    midi.write(str(path))


def test_decoder_only_transformer_forward() -> None:
    cfg = TransformerConfig(block_size=16, n_layers=2, n_heads=2, d_model=32)
    model = DecoderOnlyTransformer(vocab_size=128, config=cfg)
    x = torch.randint(0, 128, (2, 16))
    logits = model(x)
    assert logits.shape == (2, 16, 128)


def test_train_generator_smoke(tmp_path: Path) -> None:
    midi_a = tmp_path / "a.mid"
    midi_b = tmp_path / "b.mid"
    _make_training_midi(midi_a, 60)
    _make_training_midi(midi_b, 62)
    tokenizer = JazzMidiTokenizer()

    checkpoint = train_generator(
        midi_paths=[midi_a, midi_b],
        output_dir=tmp_path / "run",
        tokenizer=tokenizer,
        config=TransformerConfig(
            block_size=32,
            n_layers=2,
            n_heads=2,
            d_model=32,
            batch_size=2,
            epochs=1,
        ),
        device="cpu",
    )

    assert checkpoint.exists()
