from __future__ import annotations

import json
import math
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from .tokenizer import JazzMidiTokenizer, TokenizerConfig


@dataclass(slots=True)
class TransformerConfig:
    block_size: int = 256
    n_layers: int = 6
    n_heads: int = 8
    d_model: int = 256
    dropout: float = 0.1
    learning_rate: float = 3e-4
    batch_size: int = 8
    epochs: int = 5
    seed: int = 42


class TokenWindowDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(self, sequences: list[list[int]], block_size: int) -> None:
        self.samples: list[tuple[list[int], list[int]]] = []
        for sequence in sequences:
            if len(sequence) < 2:
                continue
            if len(sequence) <= block_size:
                padded = sequence + [0] * (block_size + 1 - len(sequence))
                self.samples.append((padded[:-1], padded[1:]))
                continue
            for offset in range(0, len(sequence) - block_size, block_size):
                chunk = sequence[offset : offset + block_size + 1]
                if len(chunk) < block_size + 1:
                    break
                self.samples.append((chunk[:-1], chunk[1:]))
        if not self.samples:
            raise ValueError("No token windows were generated. Check MIDI inputs and block size.")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        x, y = self.samples[index]
        return torch.tensor(x, dtype=torch.long), torch.tensor(y, dtype=torch.long)


class DecoderOnlyTransformer(nn.Module):
    def __init__(self, vocab_size: int, config: TransformerConfig) -> None:
        super().__init__()
        self.config = config
        self.token_embedding = nn.Embedding(vocab_size, config.d_model)
        self.position_embedding = nn.Embedding(config.block_size, config.d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=config.d_model,
            nhead=config.n_heads,
            dim_feedforward=config.d_model * 4,
            dropout=config.dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=config.n_layers)
        self.norm = nn.LayerNorm(config.d_model)
        self.output = nn.Linear(config.d_model, vocab_size)

    def forward(self, input_ids: torch.Tensor) -> torch.Tensor:
        batch_size, sequence_length = input_ids.shape
        if sequence_length > self.config.block_size:
            raise ValueError("Input exceeds model block size.")

        positions = torch.arange(sequence_length, device=input_ids.device).unsqueeze(0).expand(batch_size, -1)
        hidden = self.token_embedding(input_ids) + self.position_embedding(positions)
        causal_mask = torch.triu(
            torch.full((sequence_length, sequence_length), float("-inf"), device=input_ids.device),
            diagonal=1,
        )
        hidden = self.transformer(hidden, mask=causal_mask)
        hidden = self.norm(hidden)
        return self.output(hidden)


def set_seed(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)


def load_token_sequences(midi_paths: list[Path], tokenizer: JazzMidiTokenizer) -> list[list[int]]:
    sequences: list[list[int]] = []
    for path in midi_paths:
        tokens = tokenizer.tokenize_file(path)
        sequences.append(tokenizer.encode_tokens(tokens))
    return sequences


def train_generator(
    midi_paths: list[Path],
    output_dir: str | Path,
    tokenizer: JazzMidiTokenizer,
    config: TransformerConfig | None = None,
    device: str | None = None,
) -> Path:
    cfg = config or TransformerConfig()
    set_seed(cfg.seed)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not midi_paths:
        raise ValueError("No MIDI files were supplied for generator training.")

    sequences = load_token_sequences(midi_paths, tokenizer)
    dataset = TokenWindowDataset(sequences, block_size=cfg.block_size)
    loader = DataLoader(dataset, batch_size=cfg.batch_size, shuffle=True)

    runtime_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = DecoderOnlyTransformer(vocab_size=len(tokenizer.vocab), config=cfg).to(runtime_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.learning_rate)
    criterion = nn.CrossEntropyLoss(ignore_index=0)

    history: list[dict[str, float | int]] = []
    model.train()
    for epoch in range(cfg.epochs):
        epoch_loss = 0.0
        batches = 0
        for batch_x, batch_y in loader:
            batch_x = batch_x.to(runtime_device)
            batch_y = batch_y.to(runtime_device)
            logits = model(batch_x)
            loss = criterion(logits.view(-1, logits.size(-1)), batch_y.view(-1))
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            epoch_loss += float(loss.item())
            batches += 1

        mean_loss = epoch_loss / max(1, batches)
        history.append(
            {
                "epoch": epoch + 1,
                "loss": mean_loss,
                "perplexity": math.exp(min(mean_loss, 20)),
            }
        )

    checkpoint_path = out_dir / "model.pt"
    torch.save(
        {
            "state_dict": model.state_dict(),
            "model_config": asdict(cfg),
            "tokenizer_config": asdict(tokenizer.config),
            "vocab": tokenizer.vocab,
            "history": history,
        },
        checkpoint_path,
    )
    with (out_dir / "training_history.json").open("w", encoding="utf-8") as handle:
        json.dump(history, handle, indent=2)
    return checkpoint_path


def load_model(checkpoint_path: str | Path, device: str | None = None) -> tuple[DecoderOnlyTransformer, JazzMidiTokenizer]:
    runtime_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    payload = torch.load(str(checkpoint_path), map_location=runtime_device)
    tokenizer_cfg = TokenizerConfig(**payload["tokenizer_config"])
    tokenizer = JazzMidiTokenizer(config=tokenizer_cfg)
    tokenizer.vocab = payload["vocab"]
    tokenizer.token_to_id = {token: idx for idx, token in enumerate(tokenizer.vocab)}
    tokenizer.id_to_token = {idx: token for token, idx in tokenizer.token_to_id.items()}
    cfg = TransformerConfig(**payload["model_config"])
    model = DecoderOnlyTransformer(vocab_size=len(tokenizer.vocab), config=cfg)
    model.load_state_dict(payload["state_dict"])
    model.to(runtime_device)
    model.eval()
    return model, tokenizer


@torch.no_grad()
def sample_tokens(
    model: DecoderOnlyTransformer,
    tokenizer: JazzMidiTokenizer,
    prompt_ids: list[int] | None = None,
    max_new_tokens: int = 256,
    temperature: float = 1.0,
    top_k: int = 12,
    device: str | None = None,
) -> list[int]:
    runtime_device = device or next(model.parameters()).device
    tokens = list(prompt_ids or [tokenizer.token_to_id["<BOS>"], tokenizer.token_to_id["TIME_4/4"], tokenizer.token_to_id["TEMPO_120"], tokenizer.token_to_id["BAR"]])
    model.eval()

    for _ in range(max_new_tokens):
        x = torch.tensor([tokens[-model.config.block_size :]], dtype=torch.long, device=runtime_device)
        logits = model(x)[0, -1] / max(temperature, 1e-5)
        if top_k > 0:
            values, indices = torch.topk(logits, k=min(top_k, logits.shape[-1]))
            probs = torch.softmax(values, dim=-1)
            next_token = int(indices[torch.multinomial(probs, num_samples=1)])
        else:
            probs = torch.softmax(logits, dim=-1)
            next_token = int(torch.multinomial(probs, num_samples=1))
        tokens.append(next_token)
        if tokenizer.id_to_token[next_token] == "<EOS>":
            break
    return tokens
