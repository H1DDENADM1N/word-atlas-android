#!/usr/bin/env python3
"""Fetch the offline text-to-speech engine used by the Android build.

Two pieces are vendored, both pinned to an exact release and verified by SHA-256:

* **sherpa-onnx** (Apache-2.0) — the on-device inference runtime. Version
  ``1.13.8`` is deliberate: from v2.0.0 on, sherpa-onnx dropped the bundled
  espeak-ng phonemiser, and both voice packs below still rely on it.
* **A voice** — either
    * ``kokoro`` (default) — Kokoro-82M (Apache-2.0), 24 kHz, 11 English
      voices in one 330 MB model. The quality option.
    * ``piper`` — two Piper VITS voices (CC BY 4.0), 16 kHz, 60 MB each, one
      British and one American. The compact option.

Nothing is downloaded at build time unless the vendor folder is empty, and the
APK never touches the network: the model files end up inside ``assets/tts``.

    python3 scripts/android/fetch_tts.py
    python3 scripts/android/fetch_tts.py --voice piper
    python3 scripts/android/fetch_tts.py --force
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "tts"
VENDOR = ROOT / "android" / "vendor" / "tts"

SHERPA = {
    "version": "1.13.8",
    "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-android.tar.bz2",
    "sha256": "2ff63469a71cb6009aa2e3ed5f4a670f8abdcbe4bb9ffd23776afc792a6b4f44",
    # Only the JNI bridge and the ONNX Runtime are needed; the C/C++ API
    # libraries in the same tarball are for other apps.
    "libs": ("libsherpa-onnx-jni.so", "libonnxruntime.so"),
}

VOICES = {
    "kokoro": {
        "pack": "kokoro-en-v0_19",
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2",
        "sha256": "912804855a04745fa77a30be545b3f9a5d15c4d66db00b88cbcd4921df605ac7",
        # file inside the archive -> file inside assets/tts/kokoro
        "files": {
            "model.onnx": "model.onnx",
            "voices.bin": "voices.bin",
            "tokens.txt": "tokens.txt",
        },
    },
    "piper": {
        "pack": None,
        "url": None,
        "sha256": None,
        "files": {},
    },
}

# Piper is two archives, one per accent.
PIPER = {
    "gb": {
        "pack": "vits-piper-en_GB-alan-low",
        "model": "en_GB-alan-low.onnx",
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_GB-alan-low.tar.bz2",
        "sha256": "1308e730b7a12c3b64b669d65daa0138fcb83b1a086edee92fa9fa68cb0290dd",
    },
    "us": {
        "pack": "vits-piper-en_US-ryan-low",
        "model": "en_US-ryan-low.onnx",
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ryan-low.tar.bz2",
        "sha256": "08d0522884652402b32d6995d9df776e85c7451a333fabe97e9e4635faf568ac",
    },
}

DEFAULT_ABIS = ("arm64-v8a", "x86_64")
ALL_ABIS = ("arm64-v8a", "armeabi-v7a", "x86_64", "x86")


def log(message: str) -> None:
    print(f"[tts] {message}", flush=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, target: Path, want: str) -> Path:
    """Download once into .cache/tts, reusing a file that already matches."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if sha256(target) == want:
            log(f"cached {target.name}")
            return target
        log(f"checksum mismatch, re-downloading {target.name}")
        target.unlink()
    log(f"downloading {target.name}")
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(url, timeout=180) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out, 1 << 20)
    got = sha256(partial)
    if got != want:
        partial.unlink()
        raise SystemExit(f"checksum mismatch for {target.name}\n  want {want}\n  got  {got}")
    partial.replace(target)
    return target


def unpack(archive: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with tarfile.open(archive, "r:bz2") as tar:
        try:
            tar.extractall(dest, filter="data")
        except TypeError:  # Python < 3.12
            tar.extractall(dest)


def fetch_runtime(abis: tuple[str, ...]) -> None:
    archive = download(SHERPA["url"], CACHE / f"sherpa-onnx-{SHERPA['version']}.tar.bz2", SHERPA["sha256"])
    work = CACHE / "sherpa"
    unpack(archive, work)
    for abi in abis:
        source = work / "jniLibs" / abi
        if not source.is_dir():
            raise SystemExit(f"sherpa-onnx has no {abi} build")
        target = VENDOR / "libs" / abi
        target.mkdir(parents=True, exist_ok=True)
        for name in SHERPA["libs"]:
            shutil.copy2(source / name, target / name)
    log(f"runtime · {len(SHERPA['libs'])} libraries · {', '.join(abis)}")


def fetch_kokoro() -> None:
    voice = VOICES["kokoro"]
    archive = download(voice["url"], CACHE / f"{voice['pack']}.tar.bz2", voice["sha256"])
    work = CACHE / voice["pack"]
    unpack(archive, work)
    source = work / voice["pack"]
    target = VENDOR / "assets" / "tts" / "kokoro"
    target.mkdir(parents=True, exist_ok=True)
    for src, dst in voice["files"].items():
        shutil.copy2(source / src, target / dst)
    shutil.copytree(source / "espeak-ng-data", VENDOR / "assets" / "tts" / "espeak-ng-data")
    log(f"voice kokoro · {voice['pack']} · {len(voice['files'])} files + espeak data")


def fetch_piper() -> None:
    for key, voice in PIPER.items():
        archive = download(voice["url"], CACHE / f"{voice['pack']}.tar.bz2", voice["sha256"])
        work = CACHE / voice["pack"]
        unpack(archive, work)
        source = work / voice["pack"]
        target = VENDOR / "assets" / "tts" / key
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / voice["model"], target / "model.onnx")
        shutil.copy2(source / "tokens.txt", target / "tokens.txt")
        # espeak-ng-data is byte-identical for every Piper voice; keep one copy
        # and let both models point at it.
        espeak = VENDOR / "assets" / "tts" / "espeak-ng-data"
        if not espeak.exists():
            shutil.copytree(source / "espeak-ng-data", espeak)
        log(f"voice {key} · {voice['pack']}")


def fetch(voice: str, abis: tuple[str, ...], force: bool) -> None:
    if VENDOR.exists() and not force:
        log(f"already present: {VENDOR.relative_to(ROOT)} (use --force to replace)")
        return

    if VENDOR.exists():
        shutil.rmtree(VENDOR)
    (VENDOR / "assets").mkdir(parents=True)

    fetch_runtime(abis)
    if voice == "kokoro":
        fetch_kokoro()
    else:
        fetch_piper()

    size = sum(p.stat().st_size for p in VENDOR.rglob("*") if p.is_file())
    log(f"done · {size / 1048576:.0f} MB in {VENDOR.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Vendor the offline TTS engine")
    parser.add_argument("--force", action="store_true", help="re-extract even if present")
    parser.add_argument(
        "--voice",
        default="kokoro",
        choices=("kokoro", "piper"),
        help="kokoro = best quality (330 MB), piper = compact (120 MB)",
    )
    parser.add_argument(
        "--abis",
        default=",".join(DEFAULT_ABIS),
        help=f"comma separated ABI list (default: {','.join(DEFAULT_ABIS)})",
    )
    args = parser.parse_args()
    abis = tuple(a.strip() for a in args.abis.split(",") if a.strip())
    for abi in abis:
        if abi not in ALL_ABIS:
            raise SystemExit(f"unknown ABI: {abi}")
    fetch(args.voice, abis, args.force)


if __name__ == "__main__":
    sys.exit(main())
