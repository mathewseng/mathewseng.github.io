"""Make one MP4 from Office-3 wide clips and timestamped Board WAVs."""

from bisect import bisect_right
from dataclasses import dataclass
import json
from pathlib import Path
import select
import shutil
from statistics import median
import subprocess
from tempfile import TemporaryDirectory
import time
import wave


RATE = 48_000
CHANNELS = 2
WIDTH = 3
FRAME_BYTES = CHANNELS * WIDTH


@dataclass
class WideClip:
    path: Path
    start: float
    duration: float
    frames: int
    has_audio: bool
    packet_start: float


@dataclass
class BoardClip:
    path: Path
    start: int
    end: int


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,start_time,duration,nb_frames", "-of", "json", str(path),
    ]))["streams"]


def align_wide_clips(folder):
    clips = []
    for path in sorted(folder.glob("office-3-wide_*.mp4")):
        streams = probe(path)
        video = next(stream for stream in streams if stream["codec_type"] == "video")
        clips.append(WideClip(path, path.stat().st_birthtime, float(video["duration"]),
                              int(video["nb_frames"]), any(s["codec_type"] == "audio" for s in streams),
                              float(video.get("start_time", 0))))
    if not clips:
        raise RuntimeError("No completed wide video clips were found")

    # Each FFmpeg connection has its own packet clock. Use the copied video
    # durations inside it, and the file births to anchor it to the Mac clock.
    # Re-anchor after a restart or a visible jump in the arrival clock.
    groups = []
    for clip in clips:
        attempt, index = clip.path.stem.rsplit("_", 1)
        if groups:
            previous, previous_offset = groups[-1][-1]
            previous_attempt, previous_index = previous.path.stem.rsplit("_", 1)
            if (attempt == previous_attempt and int(index) == int(previous_index) + 1
                    and abs(clip.start - previous.start - previous.duration) < 0.5):
                groups[-1].append((clip, previous_offset + previous.duration))
                continue
        groups.append([(clip, 0.0)])
    max_residual = 0.0
    for group in groups:
        base = median(clip.start - offset for clip, offset in group)
        for clip, offset in group:
            max_residual = max(max_residual, abs(clip.start - (base + offset)))
            clip.start = base + offset
    return clips, max_residual


def board_clips(folder):
    clips = []
    for path in sorted((folder / "board-audio").glob("board_*.json")):
        data = json.loads(path.read_text())
        start = round(data["startedAtUs"] * RATE / 1_000_000)
        if clips and abs(start - clips[-1].end) <= RATE // 200:
            start = clips[-1].end
        if clips and start < clips[-1].start:
            raise RuntimeError(f"Board audio is out of order at {path.name}")
        wav = path.with_suffix(".wav")
        with wave.open(str(wav), "rb") as recording:
            if (recording.getframerate(), recording.getnchannels(), recording.getsampwidth(),
                    recording.getnframes()) != (RATE, CHANNELS, WIDTH, data["samples"]):
                raise RuntimeError(f"Board WAV does not match its receipt at {wav.name}")
        clips.append(BoardClip(wav, start, start + data["samples"]))
    if not clips:
        raise RuntimeError("No completed Board audio receipts were found")
    return clips


def measure_clock(ssh_host):
    # Keep one SSH connection open so a handshake isn't part of the timing
    # uncertainty. Each server reading is bounded by the two Mac readings.
    command = "python3 -u -c 'import sys,time\nfor _ in sys.stdin: print(time.time_ns())'"
    with subprocess.Popen([
        "ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5",
        ssh_host, command,
    ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True) as remote:
        bounds = []
        try:
            for _ in range(12):
                start = time.time_ns()
                remote.stdin.write("\n")
                remote.stdin.flush()
                if not select.select([remote.stdout], [], [], 8)[0]:
                    raise RuntimeError("Office-3 did not answer the clock probe")
                raw = remote.stdout.readline()
                end = time.time_ns()
                if not raw.strip().isdigit():
                    raise RuntimeError("Office-3 did not return a clock reading")
                server = int(raw)
                bounds.append(((server - end) / 1e9, (server - start) / 1e9))
        finally:
            remote.terminate()
        low = max(pair[0] for pair in bounds)
        high = min(pair[1] for pair in bounds)
        if low > high:
            raise RuntimeError("Office-3's clock changed during the timing check")
        return {"serverMinusMacSeconds": (low + high) / 2,
                "uncertaintySeconds": (high - low) / 2,
                "measuredAtUnixSeconds": time.time()}


def read_clock(folder, ssh_host):
    path = folder / "board-audio" / "clock-calibration.json"
    try:
        reading = measure_clock(ssh_host)
    except (OSError, RuntimeError):
        if not path.exists():
            raise
        reading = json.loads(path.read_text())
        return {**reading, "reused": True}
    staging = path.with_suffix(".tmp")
    staging.write_text(json.dumps(reading, indent=2) + "\n")
    staging.replace(path)
    return reading


def board_spans(clips, starts, begin, samples):
    end = begin + samples
    cursor = begin
    for clip in clips[max(0, bisect_right(starts, begin) - 1):]:
        if clip.start >= end:
            break
        first = max(clip.start, cursor)
        last = min(clip.end, end)
        if first < last:
            yield clip.path, first - clip.start, first - begin, last - first
            cursor = last


def wide_audio(clip, samples):
    length = samples * FRAME_BYTES
    if not clip.has_audio:
        return bytearray(length)
    audio = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(clip.path), "-map", "0:a:0",
        "-af", "aresample=48000:async=1:first_pts=0,apad", "-t", f"{samples / RATE:.9f}",
        "-ar", str(RATE), "-ac", str(CHANNELS), "-f", "s24le", "pipe:1",
    ])
    return bytearray(audio[:length].ljust(length, b"\0"))


def clip_audio(clip, samples, spans):
    covered = sum(span[3] for span in spans)
    audio = bytearray(samples * FRAME_BYTES) if covered == samples else wide_audio(clip, samples)
    for path, source, destination, count in spans:
        with wave.open(str(path), "rb") as recording:
            recording.setpos(source)
            data = recording.readframes(count)
        if len(data) != count * FRAME_BYTES:
            raise RuntimeError(f"Board WAV ended early at {path.name}")
        audio[destination * FRAME_BYTES:(destination + count) * FRAME_BYTES] = data
    return audio


def verify_output(path, frames, duration):
    streams = probe(path)
    picture = next(stream for stream in streams if stream["codec_type"] == "video")
    sound = next(stream for stream in streams if stream["codec_type"] == "audio")
    if (int(picture["nb_frames"]) != frames
            or abs(float(picture["duration"]) - duration) > 0.05
            or abs(float(sound["duration"]) - duration) > 0.05):
        raise RuntimeError("Export did not preserve the wide frame count and paired audio duration")


def combine(folder, ssh_host):
    output = folder / "wide-with-board-audio.mp4"
    report = folder / "wide-with-board-audio.sync.json"
    if output.exists() and report.exists():
        return output
    if output.exists():
        raise RuntimeError(f"{output.name} already exists without a sync report")

    clips, jitter = align_wide_clips(folder)
    board = board_clips(folder)
    clocks = read_clock(folder, ssh_host)
    board_starts = [clip.start for clip in board]
    plans = []
    duration = 0.0
    copied_samples = 0
    for clip in clips:
        previous = duration
        duration += clip.duration
        samples = round(duration * RATE) - round(previous * RATE)
        begin = round((clip.start + clocks["serverMinusMacSeconds"]) * RATE)
        spans = list(board_spans(board, board_starts, begin, samples))
        copied_samples += sum(span[3] for span in spans)
        plans.append((clip, samples, spans))
    if not copied_samples:
        raise RuntimeError("No overlap between the Board audio and wide video clocks")
    needed = sum(clip.path.stat().st_size for clip in clips) + 256 * 1024**2
    if shutil.disk_usage(folder).free < needed:
        raise RuntimeError("Insufficient space to export a second copy of the wide video")

    frames = sum(clip.frames for clip in clips)
    with TemporaryDirectory(prefix=".board-export-", dir=folder) as scratch:
        playlist = Path(scratch) / "wide.ffconcat"
        temp_video = Path(scratch) / "combined.mp4"
        temp_report = Path(scratch) / "sync.json"
        # Relative paths avoid escaping the user-supplied folder name.
        playlist.write_text("ffconcat version 1.0\n" + "".join(
            f"file '../{c.path.name}'\ninpoint {c.packet_start:.9f}\nduration {c.duration:.9f}\n"
            for c in clips
        ))
        encoder = subprocess.Popen([
            "ffmpeg", "-nostdin", "-v", "error", "-xerror",
            "-f", "concat", "-safe", "0", "-i", str(playlist),
            "-f", "s24le", "-ar", str(RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-metadata:s:a:0", "title=Board microphone with wide audio fallback",
            "-movflags", "+faststart", str(temp_video),
        ], stdin=subprocess.PIPE)
        try:
            for clip, samples, spans in plans:
                encoder.stdin.write(clip_audio(clip, samples, spans))
        finally:
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError("FFmpeg could not finish the combined MP4")
        verify_output(temp_video, frames, duration)
        temp_report.write_text(json.dumps({
            "alignment": "Wide file birth clocks and frame durations, Board receiver sample timestamps",
            "physicalSyncVerified": False,
            "clock": clocks,
            "maxWideClockResidualSeconds": jitter,
            "videoFrames": frames,
            "videoSeconds": duration,
            "boardAudioSeconds": copied_samples / RATE,
            "wideAudioFallbackSeconds": (round(duration * RATE) - copied_samples) / RATE,
            "clips": [
                {"file": clip.path.name, "macStartUnixSeconds": clip.start, "samples": samples,
                 "boardRanges": [{"startSample": offset, "samples": count} for _, _, offset, count in spans]}
                for clip, samples, spans in plans
            ],
        }, indent=2) + "\n")
        temp_report.replace(report)
        temp_video.rename(output)
    return output
