#!/usr/bin/env python3
"""
CMU FBX Animation Downloader for AURA
Downloads motion capture clips from gbionics/cmu-fbx (HuggingFace)
into assets/animations/cmu/ for use by the AURA avatar system.

Usage:  python3 download_cmu_animations.py

Attribution:
  Data from mocap.cs.cmu.edu — funded by NSF EIA-0196217
"""

import os
import urllib.request

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "assets", "animations", "cmu")

# Files are stored flat: animations/SS_MM.fbx
HF_BASE = "https://huggingface.co/datasets/gbionics/cmu-fbx/resolve/main/animations"

# { "aura_animation_name": ("source_file.fbx", "description") }
CLIPS = {
    # ── IDLE / STANDING ──────────────────────────────────────────────────
    "cmu_stand_idle":    ("09_01.fbx",  "Standing idle pose"),
    "cmu_stand_idle2":   ("09_02.fbx",  "Standing idle variant 2"),

    # ── WALKING ──────────────────────────────────────────────────────────
    "cmu_walk":          ("09_12.fbx",  "Walk forward/backward/sideways"),
    "cmu_walk_normal":   ("08_01.fbx",  "Normal walk cycle"),
    "cmu_walk_slow":     ("08_02.fbx",  "Slow walk"),
    "cmu_walk3":         ("08_03.fbx",  "Walk variant 3"),
    "cmu_loco1":         ("10_01.fbx",  "Locomotion 1"),
    "cmu_loco2":         ("10_03.fbx",  "Locomotion 3"),

    # ── WAVING / GESTURES ────────────────────────────────────────────────
    "cmu_wave":          ("13_26.fbx",  "Wave / direct traffic"),
    "cmu_wave2":         ("13_27.fbx",  "Wave and point"),
    "cmu_wave3":         ("13_28.fbx",  "Wave and point variant"),
    "cmu_gesture":       ("13_04.fbx",  "Everyday gesture 4"),
    "cmu_gesture2":      ("13_06.fbx",  "Everyday gesture 6"),
    "cmu_sit":           ("13_01.fbx",  "Sit on stool / stand up"),
    "cmu_sit2":          ("13_02.fbx",  "Sit on stool variant"),

    # ── ATHLETIC / JUMP ──────────────────────────────────────────────────
    "cmu_jump":          ("86_01.fbx",  "Jumps, kicks and punches"),
    "cmu_run":           ("86_03.fbx",  "Walk, run, stretch, jump"),

    # ── DANCE ────────────────────────────────────────────────────────────
    "cmu_dance3":        ("60_01.fbx",  "Dance 1"),
    "cmu_dance4":        ("60_09.fbx",  "Dance 9"),

    # ── GENERAL VARIETY (Subject 102) ────────────────────────────────────
    "cmu_variety1":      ("102_01.fbx", "Variety 1"),
    "cmu_variety2":      ("102_06.fbx", "Variety 6 (waving)"),
    "cmu_variety3":      ("102_11.fbx", "Variety 11"),
    "cmu_variety4":      ("102_20.fbx", "Variety 20"),

    # ── EXPRESSIVE (Subject 111) ─────────────────────────────────────────
    "cmu_expressive1":   ("111_01.fbx", "Expressive 1"),
    "cmu_expressive2":   ("111_05.fbx", "Expressive 5"),
    "cmu_expressive3":   ("111_07.fbx", "Expressive 7"),
    "cmu_expressive4":   ("111_12.fbx", "Expressive 12"),
    "cmu_expressive5":   ("111_21.fbx", "Expressive 21"),
}


def download_clip(aura_name, filename, description):
    url = f"{HF_BASE}/{filename}"
    out_path = os.path.join(OUTPUT_DIR, f"{aura_name}.fbx")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 10_000:
        print(f"  ✓  SKIP  {aura_name}.fbx ({os.path.getsize(out_path):,} B) — exists")
        return True

    print(f"  ↓  {aura_name}.fbx  ← {filename}  [{description}]")
    try:
        urllib.request.urlretrieve(url, out_path)
        size = os.path.getsize(out_path)
        if size < 1000:
            print(f"  ⚠️  Too small ({size}B) — removing")
            os.remove(out_path)
            return False
        print(f"  ✅  {size:,} bytes")
        return True
    except Exception as e:
        print(f"  ❌  {e}")
        if os.path.exists(out_path):
            os.remove(out_path)
        return False


def main():
    print("=" * 60)
    print("  AURA — CMU FBX Animation Downloader")
    print("=" * 60)
    print(f"\n  Output → {OUTPUT_DIR}\n")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    total, success, failed = len(CLIPS), 0, []
    for i, (name, (fname, desc)) in enumerate(CLIPS.items(), 1):
        print(f"\n[{i}/{total}]", end=" ")
        if download_clip(name, fname, desc):
            success += 1
        else:
            failed.append(name)

    print("\n" + "=" * 60)
    print(f"  Done! {success}/{total} downloaded successfully.")
    if failed:
        print(f"  Failed ({len(failed)}): {', '.join(failed)}")
    print("  Attribution: mocap.cs.cmu.edu — NSF EIA-0196217")
    print("=" * 60)


if __name__ == "__main__":
    main()
