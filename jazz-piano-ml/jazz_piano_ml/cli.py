from __future__ import annotations

import argparse
import json
from pathlib import Path

from .generation import TransformerConfig, load_model, sample_tokens, train_generator
from .manifests import (
    read_manifest_jsonl,
    scan_audio_directory,
    scan_midi_directory,
    split_manifest,
    write_manifest_jsonl,
    write_split_manifests,
)
from .midi import MidiNormalizationConfig, normalize_midi_file, validate_midi_file
from .tokenizer import JazzMidiTokenizer
from .transcription import available_backends, transcribe_audio_file


def _resolve_midi_paths(midi_dir: str | Path | None, manifest_path: str | Path | None) -> list[Path]:
    if midi_dir:
        root = Path(midi_dir)
        return sorted(path for path in root.rglob("*") if path.suffix.lower() in {".mid", ".midi"})
    if manifest_path:
        items = read_manifest_jsonl(manifest_path)
        paths: list[Path] = []
        for item in items:
            midi_path = item.normalized_midi_path or item.raw_midi_path
            if midi_path:
                paths.append(Path(midi_path))
        return sorted(paths)
    raise ValueError("Provide either --midi-dir or --manifest.")


def cmd_ingest_audio(args: argparse.Namespace) -> None:
    items = scan_audio_directory(args.input_dir, source_type=args.source_type)
    write_manifest_jsonl(items, args.output)
    print(f"Wrote {len(items)} audio items to {args.output}")


def cmd_ingest_midi(args: argparse.Namespace) -> None:
    items = scan_midi_directory(args.input_dir, source_type=args.source_type)
    write_manifest_jsonl(items, args.output)
    print(f"Wrote {len(items)} MIDI items to {args.output}")


def cmd_split_manifest(args: argparse.Namespace) -> None:
    items = read_manifest_jsonl(args.input)
    splits = split_manifest(items, train_ratio=args.train_ratio, val_ratio=args.val_ratio, seed=args.seed)
    write_split_manifests(splits, args.output_dir)
    print(f"Wrote splits to {args.output_dir}")


def cmd_normalize_midi(args: argparse.Namespace) -> None:
    stats = normalize_midi_file(
        args.input,
        args.output,
        config=MidiNormalizationConfig(min_duration_sec=args.min_duration_sec),
    )
    print(json.dumps(stats.to_dict(), indent=2))


def cmd_validate_midi(args: argparse.Namespace) -> None:
    print(json.dumps(validate_midi_file(args.input), indent=2))


def cmd_tokenize_midi(args: argparse.Namespace) -> None:
    tokenizer = JazzMidiTokenizer()
    tokens = tokenizer.tokenize_file(args.input)
    tokenizer.save_tokens(tokens, args.output_json)
    print(f"Wrote {len(tokens)} tokens to {args.output_json}")


def cmd_transcribe(args: argparse.Namespace) -> None:
    path = transcribe_audio_file(
        audio_path=args.audio,
        output_midi_path=args.output_midi,
        backend=args.backend,
        sidecar_midi=args.sidecar_midi,
    )
    print(f"Wrote transcription to {path}")


def cmd_train_generator(args: argparse.Namespace) -> None:
    tokenizer = JazzMidiTokenizer()
    midi_paths = _resolve_midi_paths(args.midi_dir, args.manifest)
    checkpoint = train_generator(
        midi_paths=midi_paths,
        output_dir=args.output_dir,
        tokenizer=tokenizer,
        config=TransformerConfig(
            block_size=args.block_size,
            n_layers=args.n_layers,
            n_heads=args.n_heads,
            d_model=args.d_model,
            batch_size=args.batch_size,
            epochs=args.epochs,
            learning_rate=args.learning_rate,
        ),
    )
    print(f"Saved generator checkpoint to {checkpoint}")


def cmd_sample_generator(args: argparse.Namespace) -> None:
    model, tokenizer = load_model(args.checkpoint)
    prompt_ids = None
    if args.prompt_midi:
        prompt_ids = tokenizer.encode_tokens(tokenizer.tokenize_file(args.prompt_midi))
    token_ids = sample_tokens(
        model=model,
        tokenizer=tokenizer,
        prompt_ids=prompt_ids,
        max_new_tokens=args.max_new_tokens,
        temperature=args.temperature,
        top_k=args.top_k,
    )
    tokens = tokenizer.decode_ids(token_ids)
    midi = tokenizer.tokens_to_midi(tokens)
    output = Path(args.output_midi)
    output.parent.mkdir(parents=True, exist_ok=True)
    midi.write(str(output))
    print(f"Wrote sample MIDI to {output}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jazz piano ML project CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_audio = subparsers.add_parser("ingest-audio")
    ingest_audio.add_argument("--input-dir", required=True)
    ingest_audio.add_argument("--output", required=True)
    ingest_audio.add_argument("--source-type", default="unknown_audio")
    ingest_audio.set_defaults(func=cmd_ingest_audio)

    ingest_midi = subparsers.add_parser("ingest-midi")
    ingest_midi.add_argument("--input-dir", required=True)
    ingest_midi.add_argument("--output", required=True)
    ingest_midi.add_argument("--source-type", default="unknown_midi")
    ingest_midi.set_defaults(func=cmd_ingest_midi)

    split_cmd = subparsers.add_parser("split-manifest")
    split_cmd.add_argument("--input", required=True)
    split_cmd.add_argument("--output-dir", required=True)
    split_cmd.add_argument("--train-ratio", type=float, default=0.8)
    split_cmd.add_argument("--val-ratio", type=float, default=0.1)
    split_cmd.add_argument("--seed", type=int, default=42)
    split_cmd.set_defaults(func=cmd_split_manifest)

    normalize_cmd = subparsers.add_parser("normalize-midi")
    normalize_cmd.add_argument("--input", required=True)
    normalize_cmd.add_argument("--output", required=True)
    normalize_cmd.add_argument("--min-duration-sec", type=float, default=0.03)
    normalize_cmd.set_defaults(func=cmd_normalize_midi)

    validate_cmd = subparsers.add_parser("validate-midi")
    validate_cmd.add_argument("--input", required=True)
    validate_cmd.set_defaults(func=cmd_validate_midi)

    tokenize_cmd = subparsers.add_parser("tokenize-midi")
    tokenize_cmd.add_argument("--input", required=True)
    tokenize_cmd.add_argument("--output-json", required=True)
    tokenize_cmd.set_defaults(func=cmd_tokenize_midi)

    transcribe_cmd = subparsers.add_parser("transcribe")
    transcribe_cmd.add_argument("--audio", required=True)
    transcribe_cmd.add_argument("--output-midi", required=True)
    transcribe_cmd.add_argument("--backend", choices=available_backends(), default="passthrough")
    transcribe_cmd.add_argument("--sidecar-midi")
    transcribe_cmd.set_defaults(func=cmd_transcribe)

    train_cmd = subparsers.add_parser("train-generator")
    train_cmd.add_argument("--midi-dir")
    train_cmd.add_argument("--manifest")
    train_cmd.add_argument("--output-dir", required=True)
    train_cmd.add_argument("--block-size", type=int, default=256)
    train_cmd.add_argument("--n-layers", type=int, default=6)
    train_cmd.add_argument("--n-heads", type=int, default=8)
    train_cmd.add_argument("--d-model", type=int, default=256)
    train_cmd.add_argument("--batch-size", type=int, default=8)
    train_cmd.add_argument("--epochs", type=int, default=5)
    train_cmd.add_argument("--learning-rate", type=float, default=3e-4)
    train_cmd.set_defaults(func=cmd_train_generator)

    sample_cmd = subparsers.add_parser("sample-generator")
    sample_cmd.add_argument("--checkpoint", required=True)
    sample_cmd.add_argument("--output-midi", required=True)
    sample_cmd.add_argument("--prompt-midi")
    sample_cmd.add_argument("--max-new-tokens", type=int, default=256)
    sample_cmd.add_argument("--temperature", type=float, default=1.0)
    sample_cmd.add_argument("--top-k", type=int, default=12)
    sample_cmd.set_defaults(func=cmd_sample_generator)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
