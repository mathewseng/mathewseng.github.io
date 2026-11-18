"""Resolve the local media, generated artifacts and calibration dependencies."""
from pathlib import Path
import os


def local_path(variable: str, default: Path) -> Path:
    return Path(os.environ.get(variable, str(default))).expanduser().resolve()


ARTIFACT_DIR = local_path(
    "OFFICE3_ARTIFACT_DIR", Path.home() / "Downloads" / "office-3-backgammon-20261117"
)
RECORDING_DIR = local_path(
    "OFFICE3_RECORDING_DIR", ARTIFACT_DIR.parent / "office-3-wide-20261117-185027"
)
CALIBRATION_REPO = local_path(
    "OFFICE3_CALIBRATION_REPO", Path.home() / "Documents/GitHub/gigarepo"
)

REPLAY_DIR = local_path("OFFICE3_REPLAY_DIR", ARTIFACT_DIR / "v4-4ply")
