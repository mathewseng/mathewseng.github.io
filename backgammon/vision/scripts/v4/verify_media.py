"""Verify the five rendered videos preserve the camera frames and soundtrack."""
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR, REPLAY_DIR

OUT = REPLAY_DIR


def audio_hash(path, frames):
    return subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-t", f"{frames / 25:.2f}", "-i", str(path),
        "-map", "0:a:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-",
    ], text=True).strip()


def verify(number):
    name = f"game-{number:02}-analysis.mp4"
    state = json.loads((OUT / f"game-{number:02}-game.json").read_text())
    video = OUT / "games" / name
    baseline = ARTIFACT_DIR / "v2/games" / name
    streams = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration", "-of", "json", str(video),
    ]))["streams"]
    pictures = next(stream for stream in streams if stream["codec_type"] == "video")
    sound = next(stream for stream in streams if stream["codec_type"] == "audio")
    assert (pictures["codec_name"], pictures["width"], pictures["height"]) == ("h264", 1920, 1080)
    assert pictures["r_frame_rate"] == "25/1"
    expected = state["frames"]
    assert int(pictures["nb_frames"]) == expected, (number, pictures["nb_frames"], expected)
    assert sound["codec_name"] == "aac" and float(sound["duration"]) >= state["frames"] / 25 - .05
    actual_hash = audio_hash(video, state["frames"])
    assert actual_hash == audio_hash(baseline, state["frames"]), f"Game {number} soundtrack differs"
    sample_times = [0, state["frames"] / 50, (state["frames"] - 10) / 25]
    for time in sample_times:
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-ss", str(time),
                        "-i", str(video), "-t", "0.3", "-f", "null", "-"], check=True)
    return {"game": number, "cameraFrames": state["frames"], "videoFrames": expected,
            "soundtrackHash": actual_hash, "bytes": video.stat().st_size}


if __name__ == "__main__":
    result = [verify(game) for game in range(1, 6)]
    (OUT / "video-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
