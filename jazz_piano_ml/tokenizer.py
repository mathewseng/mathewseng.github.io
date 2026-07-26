from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pretty_midi


@dataclass(slots=True)
class TokenizerConfig:
    beats_per_bar: int = 4
    positions_per_beat: int = 12
    velocity_bins: int = 16
    min_pitch: int = 21
    max_pitch: int = 108
    max_duration_steps: int = 96
    tempo_min: int = 30
    tempo_max: int = 240


class JazzMidiTokenizer:
    def __init__(self, config: TokenizerConfig | None = None) -> None:
        self.config = config or TokenizerConfig()
        self.vocab = self._build_vocab()
        self.token_to_id = {token: idx for idx, token in enumerate(self.vocab)}
        self.id_to_token = {idx: token for token, idx in self.token_to_id.items()}

    def _build_vocab(self) -> list[str]:
        cfg = self.config
        positions_per_bar = cfg.beats_per_bar * cfg.positions_per_beat
        vocab = ["<PAD>", "<BOS>", "<EOS>", "BAR"]
        vocab.extend(f"TIME_{signature}" for signature in ["3/4", "4/4", "5/4", "6/8"])
        vocab.extend(f"TEMPO_{tempo}" for tempo in range(cfg.tempo_min, cfg.tempo_max + 1))
        vocab.extend(f"POS_{idx}" for idx in range(positions_per_bar))
        vocab.extend(f"PITCH_{pitch}" for pitch in range(cfg.min_pitch, cfg.max_pitch + 1))
        vocab.extend(f"VEL_{velocity}" for velocity in range(cfg.velocity_bins))
        vocab.extend(f"DUR_{duration}" for duration in range(1, cfg.max_duration_steps + 1))
        return vocab

    def _tempo_token(self, midi: pretty_midi.PrettyMIDI) -> str:
        tempo = int(round(midi.estimate_tempo() or 120))
        tempo = min(self.config.tempo_max, max(self.config.tempo_min, tempo))
        return f"TEMPO_{tempo}"

    def _time_signature_token(self, midi: pretty_midi.PrettyMIDI) -> str:
        if midi.time_signature_changes:
            signature = midi.time_signature_changes[0]
            candidate = f"{signature.numerator}/{signature.denominator}"
            token = f"TIME_{candidate}"
            if token in self.token_to_id:
                return token
        return "TIME_4/4"

    def midi_to_tokens(self, midi: pretty_midi.PrettyMIDI) -> list[str]:
        cfg = self.config
        tempo = int(self._tempo_token(midi).split("_", maxsplit=1)[1])
        beat_duration = 60.0 / tempo
        bar_duration = beat_duration * cfg.beats_per_bar
        positions_per_bar = cfg.beats_per_bar * cfg.positions_per_beat

        notes = []
        for instrument in midi.instruments:
            if instrument.is_drum:
                continue
            notes.extend(instrument.notes)
        notes.sort(key=lambda note: (note.start, note.pitch, note.end))

        tokens = ["<BOS>", self._time_signature_token(midi), f"TEMPO_{tempo}"]
        current_bar = -1
        for note in notes:
            if note.pitch < cfg.min_pitch or note.pitch > cfg.max_pitch:
                continue
            bar_index = int(note.start // bar_duration) if bar_duration > 0 else 0
            while current_bar < bar_index:
                tokens.append("BAR")
                current_bar += 1

            start_in_bar = note.start - (bar_index * bar_duration)
            position = int(round((start_in_bar / bar_duration) * positions_per_bar)) if bar_duration > 0 else 0
            position = min(positions_per_bar - 1, max(0, position))
            velocity_bin = min(cfg.velocity_bins - 1, max(0, int(note.velocity * cfg.velocity_bins / 128)))
            duration_steps = int(round(((note.end - note.start) / beat_duration) * cfg.positions_per_beat)) if beat_duration > 0 else 1
            duration_steps = min(cfg.max_duration_steps, max(1, duration_steps))

            tokens.extend(
                [
                    f"POS_{position}",
                    f"PITCH_{note.pitch}",
                    f"VEL_{velocity_bin}",
                    f"DUR_{duration_steps}",
                ]
            )

        tokens.append("<EOS>")
        return tokens

    def tokenize_file(self, path: str | Path) -> list[str]:
        midi = pretty_midi.PrettyMIDI(str(path))
        return self.midi_to_tokens(midi)

    def encode_tokens(self, tokens: list[str]) -> list[int]:
        missing = [token for token in tokens if token not in self.token_to_id]
        if missing:
            raise KeyError(f"Unknown tokens encountered: {missing[:5]}")
        return [self.token_to_id[token] for token in tokens]

    def decode_ids(self, token_ids: list[int]) -> list[str]:
        return [self.id_to_token[token_id] for token_id in token_ids]

    def tokens_to_midi(self, tokens: list[str]) -> pretty_midi.PrettyMIDI:
        cfg = self.config
        tempo = 120
        time_signature = (4, 4)
        current_bar = -1
        current_position = 0
        beat_duration = 60.0 / tempo
        bar_duration = beat_duration * cfg.beats_per_bar
        positions_per_bar = cfg.beats_per_bar * cfg.positions_per_beat

        midi = pretty_midi.PrettyMIDI(initial_tempo=tempo)
        instrument = pretty_midi.Instrument(program=pretty_midi.instrument_name_to_program("Acoustic Grand Piano"))
        pending_pitch: int | None = None
        pending_velocity_bin: int | None = None

        for token in tokens:
            if token in {"<PAD>", "<BOS>", "<EOS>"}:
                continue
            if token == "BAR":
                current_bar += 1
                current_position = 0
                continue
            if token.startswith("TIME_"):
                numerator, denominator = token.split("_", maxsplit=1)[1].split("/")
                time_signature = (int(numerator), int(denominator))
                continue
            if token.startswith("TEMPO_"):
                tempo = int(token.split("_", maxsplit=1)[1])
                beat_duration = 60.0 / tempo
                bar_duration = beat_duration * cfg.beats_per_bar
                continue
            if token.startswith("POS_"):
                current_position = int(token.split("_", maxsplit=1)[1])
                continue
            if token.startswith("PITCH_"):
                pending_pitch = int(token.split("_", maxsplit=1)[1])
                continue
            if token.startswith("VEL_"):
                pending_velocity_bin = int(token.split("_", maxsplit=1)[1])
                continue
            if token.startswith("DUR_") and pending_pitch is not None and pending_velocity_bin is not None:
                duration_steps = int(token.split("_", maxsplit=1)[1])
                velocity = int((pending_velocity_bin + 0.5) * 128 / cfg.velocity_bins)
                if current_bar < 0:
                    current_bar = 0
                start = (current_bar * bar_duration) + (current_position / positions_per_bar) * bar_duration
                duration = (duration_steps / cfg.positions_per_beat) * beat_duration
                end = start + max(duration, 0.03)
                instrument.notes.append(
                    pretty_midi.Note(
                        velocity=max(1, min(127, velocity)),
                        pitch=pending_pitch,
                        start=float(start),
                        end=float(end),
                    )
                )
                pending_pitch = None
                pending_velocity_bin = None

        midi.instruments.append(instrument)
        midi.time_signature_changes.append(
            pretty_midi.TimeSignature(time_signature[0], time_signature[1], 0.0)
        )
        return midi

    def save_tokens(self, tokens: list[str], output_path: str | Path) -> Path:
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "config": asdict(self.config),
            "tokens": tokens,
            "token_ids": self.encode_tokens(tokens),
        }
        with output.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        return output
