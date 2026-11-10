#!/usr/bin/env python3
"""
Demo: plays a fake BassVision daily-pack run through HQ Live, using REAL clips from a
pack already public on live.bassvision.store. Nothing is rendered, published or billed.

It stops twice to wait for your tap in the Live tab:
  1. the loop gate flags a clip  -> redo / keep / drop
  2. the pack is ready            -> publish / hold

    python3 demo_pack.py            # needs ~/.config/hq-live.json or HQ_RELAY_URL/TOKEN
    python3 demo_pack.py --fast     # shorter pauses
"""
from __future__ import annotations

import json
import random
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hq_live import ask, event, item, job  # noqa: E402

BASE = "https://live.bassvision.store/content/"
BIZ = 3  # Visual packs (the daily Gumroad packs)
FAST = "--fast" in sys.argv
STAGES = ["Panels", "Kling", "Loop gate", "4K", "Publish"]


def nap(s: float) -> None:
    time.sleep(s / 2.5 if FAST else s)


def pick_pack() -> tuple[str, list[dict]]:
    with urllib.request.urlopen(f"{BASE}packs.json", timeout=10) as r:
        packs = [p for p in json.load(r)["packs"] if len([c for c in p["clips"] if c["kind"] == "loop"]) >= 4]
    p = random.choice(packs)
    loops = [c for c in p["clips"] if c["kind"] == "loop"][:6]
    return p["name"], loops


def main() -> None:
    name, clips = pick_pack()
    jid = f"demo-pack-{date.today()}-{random.randint(100, 999)}"
    files = ["outreach/panels.py", "bassvision_k4_render.py", "bassvision_loop.py", "upscale/esrgan.py",
             "bassvision_finalize.py", "gumroad_api.py"]

    job(jid, title=f"Daily pack (DEMO): {name}", biz=BIZ, stages=STAGES, stage=0, status="running",
        note="Demo run, real clips, nothing is billed",
        items=[{"id": f"c{i+1}", "label": f"Clip {i+1}", "status": "queued"} for i in range(len(clips))])
    event(f"Pack started: {name}", biz=BIZ, job=jid)

    # Panels
    event("Building 6 panels from the cover art", biz=BIZ, job=jid, kind="tool")
    event("edit", biz=BIZ, job=jid, kind="file", path=files[0])
    nap(3)

    # Kling: clips land one by one
    job(jid, stage=1)
    for i, c in enumerate(clips):
        iid = f"c{i+1}"
        item(jid, iid, status="running", note="Kling 4.0 rendering")
        event(f"Kling: clip {i+1} of {len(clips)}", biz=BIZ, job=jid, kind="tool")
        event("run", biz=BIZ, job=jid, kind="file", path=files[1])
        nap(2.2)
        item(jid, iid, status="done", thumb=BASE + c["thumb"], media=BASE + c["file"], note="")

    # Loop gate: one clip fails, Einar decides
    job(jid, stage=2)
    event("Loop gate: checking seams", biz=BIZ, job=jid, kind="tool")
    event("run", biz=BIZ, job=jid, kind="file", path=files[2])
    nap(2)
    bad = min(3, len(clips) - 1)
    bad_clip = clips[bad]
    item(jid, f"c{bad+1}", status="waiting", note="seam jump at 0:05")
    job(jid, status="waiting", note="Waiting for you: clip " + str(bad + 1))
    choice = ask(f"Clip {bad+1}: loop seam at 0:05", ["redo", "keep", "drop"], biz=BIZ, job=jid,
                 detail="The gate saw a jump where the loop restarts. Redo costs ~32 cr.",
                 media=BASE + bad_clip["file"], thumb=BASE + bad_clip["thumb"], timeout=3600, default="keep")
    event(f"You chose: {choice}", biz=BIZ, job=jid)
    job(jid, status="running", note="Demo run, real clips, nothing is billed")
    if choice == "redo":
        item(jid, f"c{bad+1}", status="running", note="re-rendering (demo)")
        nap(4)
        item(jid, f"c{bad+1}", status="done", note="redone")
    elif choice == "drop":
        item(jid, f"c{bad+1}", status="failed", note="dropped")
    else:
        item(jid, f"c{bad+1}", status="done", note="kept as is")

    # 4K
    job(jid, stage=3)
    event("ESRGAN 2x to 3840x2160", biz=BIZ, job=jid, kind="tool")
    event("run", biz=BIZ, job=jid, kind="file", path=files[3])
    nap(4)

    # Publish: second decision
    job(jid, stage=4)
    event("finalize", biz=BIZ, job=jid, kind="file", path=files[4])
    choice = ask(f"Publish {name} to Gumroad?", ["publish", "hold"], biz=BIZ, job=jid,
                 detail="Demo only: nothing will really be published.",
                 thumb=BASE + clips[0]["thumb"], media=BASE + clips[0]["file"], timeout=3600, default="hold")
    if choice == "publish":
        event("upload", biz=BIZ, job=jid, kind="file", path=files[5])
        nap(2)
        job(jid, status="done", stage=len(STAGES), note="Published (demo)")
    else:
        job(jid, status="done", stage=len(STAGES) - 1, note="Held for later (demo)")
    event(f"Pack finished: {name} ({choice})", biz=BIZ, job=jid)
    print(f"demo finished: {choice}")


if __name__ == "__main__":
    main()
