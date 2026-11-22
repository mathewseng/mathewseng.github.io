"""Stream Board camera audio from Office-3 into a recording folder.

The local half sends this whole file to Office-3 over SSH and calls
remote_main() there. The remote half runs the hand recorder's native NDI audio
receiver inside its container and streams each sealed WAV and receipt back.
"""

import base64
import fcntl
import json
import os
from pathlib import Path
import select
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time


CONTAINER = "rf-os-hand-recorder-1"
RECEIVER = "/app/hand-recorder-live-media"
SOURCE = {
    "id": "venue-audio", "name": "Board camera audio", "transport": "ndi_full",
    "uri": "ndi://HD CAMERA (NDI HB HX,192.168.100.194)", "codec": None,
    "sample_rate_hz": 48000, "channels": 2, "required_for_delivery": True, "always_on": True,
    "enabled": True, "muted": False, "volume_db": 0, "balance": 0, "sync_offset_ms": 0,
    "monitor_mode": "off",
}
DISCOVERY_IPS = "192.168.100.105,192.168.100.194,192.168.1.225,192.168.1.155"
CHUNK_SECONDS = 5
# The container's /dev/shm is 64 MiB and shared with the hand recorder.
MAX_BACKLOG = 6
MIN_SHM_FREE = 24 * 1024**2
STALL_SECONDS = 30
DRAIN_SECONDS = 12
RETRY_SECONDS = 10
MAX_META = 4096
MAX_WAV = 8_000_000


def log(message):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}", flush=True)


# Office-3 half. Runs as root and writes the receiver's logs to stderr.

def remote_main():
    def fail(message):
        print(f"office3-board-audio: {message}", file=sys.stderr, flush=True)
        sys.exit(3)

    inspect = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}} {{.State.Pid}}", CONTAINER],
                             capture_output=True, text=True)
    running, _, pid = inspect.stdout.strip().partition(" ")
    if inspect.returncode or running != "true":
        fail(f"{CONTAINER} is not running on Office-3")
    root = Path("/proc") / pid / "root"

    def interrupt(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGHUP, interrupt)
    signal.signal(signal.SIGTERM, interrupt)

    with tempfile.TemporaryDirectory(prefix="office3-board-audio-", dir=root / "dev/shm",
                                     ignore_cleanup_errors=True) as scratch:
        folder = Path(scratch)
        target = f"/dev/shm/{folder.name}"
        (folder / "receiver.json").write_text(json.dumps({
            "source": SOURCE, "rolling": {"folder": target, "chunkSeconds": CHUNK_SECONDS},
        }))
        receiver = subprocess.Popen([
            "chroot", str(root), "/usr/bin/env", "NDI_RUNTIME_DIR=/opt/ndi/advanced",
            f"VIDEO_OS_NDI_DISCOVERY_IPS={DISCOVERY_IPS}", "RUST_LOG=info",
            RECEIVER, "recorder-audio", f"{target}/receiver.json",
        ], stdin=subprocess.DEVNULL, stdout=sys.stderr, stderr=sys.stderr)
        problems = []

        def halt(problem=None):
            if problem and not problems:
                problems.append(problem)
            if receiver.poll() is None:
                receiver.send_signal(signal.SIGTERM)

        def guard():
            # Writes to the Mac can block, so watch the shared memory separately.
            while receiver.poll() is None:
                try:
                    pending = len(list(folder.glob("*.audio.json")))
                    free = shutil.disk_usage(folder).free
                except OSError:
                    return halt("The hand recorder container stopped")
                if pending > MAX_BACKLOG or free < MIN_SHM_FREE:
                    return halt("Board audio backed up in /dev/shm, so the receiver was stopped")
                time.sleep(1)

        def send_ready():
            sent = False
            for receipt in sorted(folder.glob("*.audio.json")):
                wav = receipt.with_suffix(".wav")
                if not wav.exists():
                    continue
                metadata = receipt.read_bytes()
                payload = wav.read_bytes()
                sys.stdout.buffer.write(struct.pack("!II", len(metadata), len(payload)))
                sys.stdout.buffer.write(metadata)
                sys.stdout.buffer.write(payload)
                sys.stdout.buffer.flush()
                receipt.unlink()
                wav.unlink()
                sent = True
            return sent

        threading.Thread(target=guard, daemon=True).start()
        stopping = None
        last = time.monotonic()
        try:
            while True:
                # The Mac closes stdin to ask for a clean stop.
                if stopping is None and select.select([sys.stdin], [], [], 0)[0]:
                    stopping = time.monotonic()
                    halt()
                if send_ready():
                    last = time.monotonic()
                if receiver.poll() is not None:
                    send_ready()
                    break
                now = time.monotonic()
                if stopping is None and now - last > STALL_SECONDS:
                    halt(f"No Board audio arrived for {STALL_SECONDS} seconds")
                halted = stopping if stopping is not None else last + STALL_SECONDS
                if now - halted > 8:
                    receiver.kill()
                time.sleep(0.2)
        except (BrokenPipeError, KeyboardInterrupt):
            halt("The Mac connection closed")
        finally:
            if receiver.poll() is None:
                try:
                    receiver.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    receiver.kill()
                    receiver.wait()
        if problems:
            fail(problems[0])
        if stopping is None:
            fail(f"The Board audio receiver exited with status {receiver.returncode}")


# Mac half.

def remote_command():
    code = base64.b64encode(Path(__file__).read_bytes()).decode()
    return f"sudo -n python3 -u -c 'import base64;exec(base64.b64decode(\"{code}\"));remote_main()'"


def save(output, metadata, wav):
    stamp = int(json.loads(metadata)["startedAtUs"])
    name = f"board_{stamp}"
    # The receipt lands last, so a reader that finds it can trust the WAV.
    for suffix, data in ((".wav", wav), (".json", metadata)):
        part = output / f".{name}{suffix}.part"
        part.write_bytes(data)
        part.replace(output / f"{name}{suffix}")
    log(f"Sealed {name}.wav ({len(wav)} bytes).")


def stream_once(output, ssh_host, should_stop):
    remote = subprocess.Popen([
        "ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ControlPath=none",
        "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=3", ssh_host, remote_command(),
    ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
    buffer = bytearray()
    stop_sent = None
    try:
        while True:
            if stop_sent is None and should_stop():
                remote.stdin.close()
                stop_sent = time.monotonic()
            if stop_sent is not None and time.monotonic() - stop_sent > DRAIN_SECONDS:
                log("Office-3 did not finish the last Board chunk in time.")
                break
            if not select.select([remote.stdout], [], [], 0.5)[0]:
                continue
            data = os.read(remote.stdout.fileno(), 1024 * 1024)
            if not data:
                break
            buffer.extend(data)
            while len(buffer) >= 8:
                meta_size, wav_size = struct.unpack("!II", buffer[:8])
                if not (0 < meta_size <= MAX_META and 44 <= wav_size <= MAX_WAV):
                    raise RuntimeError("Office-3 sent an invalid Board audio packet")
                end = 8 + meta_size + wav_size
                if len(buffer) < end:
                    break
                save(output, bytes(buffer[8:8 + meta_size]), bytes(buffer[8 + meta_size:end]))
                del buffer[:end]
    finally:
        if remote.poll() is None:
            remote.terminate()
            try:
                remote.wait(timeout=5)
            except subprocess.TimeoutExpired:
                remote.kill()
                remote.wait()
    return remote.returncode


def capture(folder, ssh_host, should_stop):
    """Record Board audio into folder/board-audio until should_stop() is true."""
    output = folder / "board-audio"
    output.mkdir(mode=0o700, exist_ok=True)
    with (output / ".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(f"Board audio is already recording in {folder}") from None
        attempt = 0
        while not should_stop():
            attempt += 1
            log(f"Starting Board audio attempt {attempt}.")
            try:
                status = stream_once(output, ssh_host, should_stop)
                log(f"Board audio connection ended with status {status}.")
            except (OSError, RuntimeError) as error:
                log(f"Board audio connection failed: {error}")
            deadline = time.monotonic() + RETRY_SECONDS
            while not should_stop() and time.monotonic() < deadline:
                time.sleep(0.5)
        log("Board audio stopped.")


def is_capturing(folder):
    lock_path = folder / "board-audio" / ".lock"
    if not lock_path.exists():
        return False
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
    return False
