# mathewseng.github.io

## Jazz piano ML pipeline

This repository now includes a self-contained Python package for an end-to-end MVP
workflow that supports:

- dataset manifest creation for jazz audio and MIDI corpora
- piano MIDI normalization and validation
- event-based tokenization for symbolic training data
- pluggable transcription backends, including optional Basic Pitch integration
- a trainable decoder-only transformer for symbolic jazz piano generation
- CLI commands for ingestion, normalization, transcription, training, and sampling

## Package layout

The ML code lives under `jazz_piano_ml/` and is isolated from the existing web
game code in this repository.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Optional transcription backend:

```bash
pip install -e ".[transcription]"
```

## CLI examples

Build an audio manifest:

```bash
jazz-piano-ml ingest-audio --input-dir /path/to/audio --output manifests/audio.jsonl
```

Normalize a MIDI file:

```bash
jazz-piano-ml normalize-midi --input piece.mid --output normalized/piece.mid
```

Tokenize a MIDI file:

```bash
jazz-piano-ml tokenize-midi --input normalized/piece.mid --output-json tokens.json
```

Train a generator from normalized MIDI files:

```bash
jazz-piano-ml train-generator --midi-dir normalized --output-dir outputs/run1 --epochs 5
```

Sample from a trained checkpoint:

```bash
jazz-piano-ml sample-generator \
  --checkpoint outputs/run1/model.pt \
  --output-midi outputs/run1/sample.mid \
  --max-new-tokens 256
```

Transcribe audio with an optional backend:

```bash
jazz-piano-ml transcribe \
  --audio /path/to/audio.wav \
  --output-midi draft.mid \
  --backend basic-pitch
```

## Implemented MVP scope

This codebase is an engineering foundation, not a pre-trained SOTA model dump.
It gives you a working project structure and the core tooling needed to:

1. curate and split transcription datasets
2. normalize MIDI into a clean symbolic representation
3. train a symbolic transformer baseline
4. plug in and evaluate transcription backends

The expected next step after setup is to point the CLI at your own datasets,
fine-tune a transcription backend, and iterate on generated samples.
