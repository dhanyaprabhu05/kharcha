#!/usr/bin/env python
"""Build (and optionally install) Kharcha for Android.

    python android/build.py              # build android/build/kharcha.apk
    python android/build.py --install    # build, then install on the phone over USB

No Gradle and no downloads: it drives the tools Android Studio already
installed (aapt2, d8, zipalign, apksigner, adb) plus the JDK directly. The app
is one Java file around the same web code the website runs, so a full Gradle
project would be all overhead.

The signing key is created on first build in android/signing/ and is never
committed. Keep it: Android only accepts an update signed with the same key,
so losing it means uninstalling (and restoring from a backup) to update.
"""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
BUILD = HERE / "build"
SIGNING = HERE / "signing"
KEYSTORE = SIGNING / "kharcha-release.p12"
KEYPASS_FILE = SIGNING / "keystore-password.txt"
KEY_ALIAS = "kharcha"

PACKAGE = "io.github.dhanyaprabhu05.kharcha"
MIN_SDK = 26          # Android 8.0
VERSION_NAME = "1.0"

#: The app itself: what the website serves, minus development-only files.
WEB_FILES = ["index.html", "app.css", "manifest.webmanifest"]
WEB_DIRS = ["js", "icons"]


def fail(message: str) -> None:
    print(f"\n  ✗ {message}\n")
    sys.exit(1)


def run(cmd: list, **kwargs) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    java_home = find_java_home()
    if java_home:
        # d8 and apksigner are .bat wrappers that start Java from JAVA_HOME.
        env["JAVA_HOME"] = str(java_home)
    result = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, env=env, **kwargs)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        fail(f"{Path(str(cmd[0])).name} failed")
    return result


def find_sdk() -> Path:
    candidates = [
        os.environ.get("ANDROID_HOME"),
        os.environ.get("ANDROID_SDK_ROOT"),
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android" / "Sdk"),
        str(Path.home() / "Library" / "Android" / "sdk"),
        str(Path.home() / "Android" / "Sdk"),
    ]
    for candidate in candidates:
        if candidate and (Path(candidate) / "build-tools").is_dir():
            return Path(candidate)
    fail("Android SDK not found. Install Android Studio, or set ANDROID_HOME.")


def newest(folder: Path) -> Path:
    def key(p: Path):
        parts = p.name.replace("android-", "").split(".")
        return tuple(int(x) if x.isdigit() else 0 for x in parts)
    entries = [p for p in folder.iterdir() if p.is_dir()]
    if not entries:
        fail(f"Nothing installed in {folder}")
    return max(entries, key=key)


def tool(build_tools: Path, name: str) -> Path:
    for suffix in ("", ".exe", ".bat"):
        path = build_tools / f"{name}{suffix}"
        if path.exists():
            return path
    fail(f"{name} not found in {build_tools}")


#: Java that ships inside Android Studio. The Android build tools are tested
#: against it; very new JDKs (such as 25) crash d8 from build-tools 34.
STUDIO_JBR = [
    Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Android" / "Android Studio" / "jbr",
    Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
    Path.home() / "android-studio" / "jbr",
]


def find_java_home() -> Path | None:
    for candidate in STUDIO_JBR:
        if (candidate / "bin").is_dir():
            return candidate
    env_home = os.environ.get("JAVA_HOME")
    return Path(env_home) if env_home else None


def jdk_tool(name: str) -> str:
    java_home = find_java_home()
    if java_home:
        for suffix in ("", ".exe"):
            path = java_home / "bin" / f"{name}{suffix}"
            if path.exists():
                return str(path)
    found = shutil.which(name)
    if not found:
        fail(f"{name} not found. Install a JDK (Android Studio includes one).")
    return found


def ensure_keystore() -> str:
    """Create the signing key on first build. Returns its password."""
    SIGNING.mkdir(parents=True, exist_ok=True)
    if KEYSTORE.exists() and KEYPASS_FILE.exists():
        return KEYPASS_FILE.read_text(encoding="utf-8").strip()

    password = secrets.token_urlsafe(18)
    run([
        jdk_tool("keytool"), "-genkeypair", "-noprompt",
        "-keystore", KEYSTORE, "-storetype", "PKCS12",
        "-storepass", password, "-keypass", password,
        "-alias", KEY_ALIAS, "-keyalg", "RSA", "-keysize", "3072",
        "-validity", "10000", "-dname", f"CN=Kharcha, O={getpass.getuser()}",
    ])
    KEYPASS_FILE.write_text(password, encoding="utf-8")
    print(f"  • Created a signing key in {SIGNING}")
    print("    Keep this folder safe: updates must be signed with the same key.")
    return password


def copy_web(assets: Path) -> None:
    www = assets / "www"
    if www.exists():
        shutil.rmtree(www)
    www.mkdir(parents=True)
    for name in WEB_FILES:
        shutil.copy2(REPO / name, www / name)
    for name in WEB_DIRS:
        shutil.copytree(REPO / name, www / name)


def make_resources(res: Path) -> None:
    """The launcher icon, reused from the web app."""
    if res.exists():
        shutil.rmtree(res)
    for density, source in (("mipmap-xhdpi", "icon-192.png"), ("mipmap-xxxhdpi", "icon-512.png")):
        folder = res / density
        folder.mkdir(parents=True)
        shutil.copy2(REPO / "icons" / source, folder / "ic_launcher.png")


def build() -> Path:
    sdk = find_sdk()
    build_tools = newest(sdk / "build-tools")
    platform = newest(sdk / "platforms")
    android_jar = platform / "android.jar"
    target_sdk = int(platform.name.split("-")[1])
    print(f"  • SDK {sdk}\n  • build-tools {build_tools.name}, platform {platform.name}")
    print(f"  • Java {find_java_home()}")

    if BUILD.exists():
        shutil.rmtree(BUILD)
    res, assets, gen, classes, dex = (BUILD / d for d in ("res", "assets", "gen", "classes", "dex"))
    for folder in (gen, classes, dex):
        folder.mkdir(parents=True)
    make_resources(res)
    copy_web(assets)

    # Minutes since 2020: always increasing, so every build can install over the last.
    version_code = int((time.time() - 1577836800) // 60)

    aapt2 = tool(build_tools, "aapt2")
    compiled = BUILD / "res.zip"
    run([aapt2, "compile", "--dir", res, "-o", compiled])
    base_apk = BUILD / "base.apk"
    run([
        aapt2, "link", "-o", base_apk, "-I", android_jar,
        "--manifest", HERE / "AndroidManifest.xml", "-A", assets,
        "--java", gen, "--min-sdk-version", MIN_SDK, "--target-sdk-version", target_sdk,
        "--version-code", version_code, "--version-name", VERSION_NAME, compiled,
    ])

    sources = [str(p) for p in (HERE / "src").rglob("*.java")] + [str(p) for p in gen.rglob("*.java")]
    run([jdk_tool("javac"), "--release", "11", "-classpath", android_jar,
         "-d", classes, "-encoding", "UTF-8", "-Xlint:-options", *sources])

    class_files = [str(p) for p in classes.rglob("*.class")]
    run([tool(build_tools, "d8"), "--release", "--min-api", MIN_SDK,
         "--lib", android_jar, "--output", dex, *class_files])

    unaligned = BUILD / "unaligned.apk"
    shutil.copy2(base_apk, unaligned)
    with zipfile.ZipFile(unaligned, "a", compression=zipfile.ZIP_DEFLATED) as apk:
        apk.write(dex / "classes.dex", "classes.dex")

    aligned = BUILD / "aligned.apk"
    run([tool(build_tools, "zipalign"), "-f", "-p", "4", unaligned, aligned])

    password = ensure_keystore()
    final = BUILD / "kharcha.apk"
    apksigner = tool(build_tools, "apksigner")
    run([apksigner, "sign", "--ks", KEYSTORE, "--ks-pass", f"pass:{password}",
         "--ks-key-alias", KEY_ALIAS, "--out", final, aligned])
    run([apksigner, "verify", final])

    size_kb = final.stat().st_size // 1024
    print(f"  ✓ Built {final}  ({size_kb} KB, version {VERSION_NAME} build {version_code})")
    return final


def install(apk: Path, serial: str | None) -> None:
    adb = find_sdk() / "platform-tools" / ("adb.exe" if os.name == "nt" else "adb")
    devices = [
        line.split("\t")[0]
        for line in run([adb, "devices"]).stdout.splitlines()[1:]
        if line.strip().endswith("\tdevice")
    ]
    if serial:
        devices = [d for d in devices if d == serial]
    if not devices:
        fail("No phone found. Connect it by USB, turn on USB debugging, and tap Allow on the phone.")
    if len(devices) > 1:
        fail(f"Several devices connected ({', '.join(devices)}). Pick one with --device.")
    run([adb, "-s", devices[0], "install", "-r", apk])
    print(f"  ✓ Installed on {devices[0]}")


def main() -> None:
    # Windows consoles default to cp1252, which cannot print the status marks.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Build Kharcha for Android.")
    parser.add_argument("--install", action="store_true", help="install over USB after building")
    parser.add_argument("--device", help="adb serial, if several devices are connected")
    args = parser.parse_args()

    print("\n  Kharcha for Android")
    apk = build()
    if args.install:
        install(apk, args.device)
    print()


if __name__ == "__main__":
    main()
