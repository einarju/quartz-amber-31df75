#!/usr/bin/env python3
"""
Build-mode light test: listens for prompts typed or spoken in the Live tab and plays a
SCRIPTED build for each one. No Claude session starts, no file is written, nothing
deploys. It only shows what building from the page would feel like:

  understanding card (scope chips you can switch off)  ->  plan (steps you can skip)
  ->  files + live wireframe growing, a frame per change  ->  one A/B question
  ->  checks  ->  result card (before/after slider)

The words you type pick the shape: pricing, dashboard, landing/page/site, else a generic tool.
What you switch off really changes what gets "built".

    python3 demo_build.py           # keeps listening, Ctrl-C to stop
    python3 demo_build.py --once    # one prompt, then exit
    python3 demo_build.py --fast
"""
from __future__ import annotations

import random
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hq_live import ask, ask_full, event, job, next_prompt, prompt_status  # noqa: E402

FAST = "--fast" in sys.argv
TTL = 1800
NAMES = {1: "BassVision Live", 2: "Cover Visualizer", 3: "Visual packs", 4: "MIDI + sample packs", 5: "Techno label",
         6: "CDMX techno", 7: "Memecoin bots", 8: "Tattoo booking", 9: "Digital products", 10: "Ambient YouTube",
         11: "Type beats"}


def nap(s: float) -> None:
    time.sleep(s / 2.5 if FAST else s)


# Each shape: scope chips -> the wireframe blocks they add, plus files and a plan.
SHAPES = {
    "pricing": {
        "thing": "a pricing page",
        "scope": {"Plan cards, middle one highlighted": [{"t": "price", "n": 3, "hi": 1}],
                  "Monthly / yearly toggle": [{"t": "toggle"}],
                  "FAQ under the plans": [{"t": "faq", "n": 4}],
                  "Big call to action": [{"t": "cta"}]},
        "head": [{"t": "nav"}, {"t": "hero"}],
        "files": ["pricing/index.html", "pricing/pricing.css", "assets/plans.json", "partials/nav.html", "tests/pricing.spec.ts"],
    },
    "dashboard": {
        "thing": "a dashboard",
        "scope": {"Four number tiles on top": [{"t": "cards", "n": 4}],
                  "A big chart": [{"t": "cards", "n": 1}],
                  "Recent activity list": [{"t": "faq", "n": 5}],
                  "Filters": [{"t": "toggle"}]},
        "head": [{"t": "nav"}],
        "files": ["dashboard/index.html", "dashboard/charts.ts", "dashboard/data.ts", "dashboard/dashboard.css", "tests/dashboard.spec.ts"],
    },
    "landing": {
        "thing": "a landing page",
        "scope": {"Hero with one clear headline": [{"t": "hero"}],
                  "Three feature cards": [{"t": "cards", "n": 3}],
                  "Short story section": [{"t": "text", "n": 3}],
                  "Sign-up call to action": [{"t": "cta"}]},
        "head": [{"t": "nav"}],
        "files": ["index.html", "styles/landing.css", "sections/features.html", "sections/story.html", "tests/landing.spec.ts"],
    },
    "tool": {
        "thing": "a small tool",
        "scope": {"One input form": [{"t": "text", "n": 2}, {"t": "cta"}],
                  "Results list": [{"t": "faq", "n": 4}],
                  "Settings toggle": [{"t": "toggle"}],
                  "Help text": [{"t": "text", "n": 1}]},
        "head": [{"t": "nav"}, {"t": "hero"}],
        "files": ["tool/index.html", "tool/app.ts", "tool/store.ts", "tool/tool.css", "tests/tool.spec.ts"],
    },
}
OLD_PAGE = [{"t": "nav"}, {"t": "text", "n": 3}, {"t": "text", "n": 2}]


def shape_for(text: str) -> str:
    t = text.lower()
    if re.search(r"pric|plan|tier|checkout", t):
        return "pricing"
    if re.search(r"dashboard|stats|metric|report|analytics", t):
        return "dashboard"
    if re.search(r"landing|page|site|home|website", t):
        return "landing"
    return "tool"


def guess_biz(text: str) -> int | None:
    """No business picked in the bar: look for one of the 11 named in the prompt itself."""
    t = text.lower()
    for n, name in sorted(NAMES.items(), key=lambda kv: -len(kv[1])):
        if name.lower() in t:
            return n
    m = re.search(r"#(\d{1,2})\b", t)
    return int(m.group(1)) if m and int(m.group(1)) in NAMES else None


def play(p: dict) -> None:
    text = p["text"]
    biz = p.get("biz") or guess_biz(text)
    shape = SHAPES[shape_for(text)]
    who = f" for {NAMES[biz]}" if biz in NAMES else ""
    jid = f"build-{p['id']}"
    stages = ["Understand", "Plan", "Build", "Check", "Result"]
    files: list[dict] = []
    preview: list[dict] = []
    shots: list[list[dict]] = []
    tests = {"total": 12, "passed": 0, "failed": 0}
    title = text if len(text) < 60 else text[:57] + "..."

    def push(**kw):
        job(jid, data={"files": files, "tests": tests, "preview": preview, "shots": shots,
                       "previewLabel": kw.pop("label", "")}, **kw)

    prompt_status(p["id"], "working", jid)
    job(jid, title=f"{title} (DEMO)", biz=biz, view="build", stages=stages, stage=0,
        note="Scripted build, nothing is written or deployed")
    push()
    event(f"Reading your prompt: {title}", biz=biz, job=jid, kind="tool")
    nap(2.5)

    # 1. understanding card
    job(jid, status="waiting", note="Checking I understood you")
    r = ask_full(f"Build {shape['thing']}{who}?", ["build it", "start over"], biz=biz, job=jid, kind="brief",
                 detail="Tap a chip to leave it out.", timeout=TTL, default="build it",
                 card={"goal": f"You said: “{text}”. I read that as {shape['thing']}{who}.",
                       "scope": list(shape["scope"]),
                       "assumptions": ["Uses the style the site already has", "Nothing goes live until you say so"]})
    if r["choice"] == "start over":
        job(jid, status="done", note="You asked to start over (demo)")
        prompt_status(p["id"], "done", jid)
        return
    off = set((r.get("extra") or {}).get("off") or [])
    keep = [k for k in shape["scope"] if k not in off]
    event(f"Scope: {len(keep)} parts in, {len(off)} left out", biz=biz, job=jid)

    # 2. plan
    steps = [{"label": "Match the site's header and styles", "est": "~2 min"},
             {"label": f"Lay out {shape['thing']}", "est": "~5 min"},
             {"label": "Wire the buttons and links", "est": "~3 min"},
             {"label": "Check it on desktop and phone", "est": "~2 min"},
             {"label": "Put it on the preview site", "risk": "touches a live link", "est": "~1 min"}]
    job(jid, stage=1, status="waiting", note="Plan ready")
    r = ask_full("Approve the plan?", ["approve", "rethink"], biz=biz, job=jid, kind="plan",
                 detail="Skip any step you do not want.", timeout=TTL, default="approve", card={"steps": steps})
    skipped = set((r.get("extra") or {}).get("off") or [])
    if r["choice"] == "rethink":
        event("You asked for a different plan; a real session would ask what to change", biz=biz, job=jid)

    # 3. build: files light up, the wireframe grows, every change leaves a frame
    job(jid, stage=2, status="running", note=f"Building {len(keep)} parts")
    blocks = list(shape["head"]) + [b for k in keep for b in shape["scope"][k]]
    for i, f in enumerate(shape["files"]):
        for row in files:
            if row["state"] == "active":
                row["state"] = "edit"
        files.append({"path": f, "state": "active"})
        if i < len(blocks):
            preview.append(blocks[i])
            shots.append(list(preview))
        push(label="draft")
        event("edit", biz=biz, job=jid, kind="file", path=f)
        nap(2.2)
    for b in blocks[len(shape["files"]):]:
        preview.append(b)
        shots.append(list(preview))
        push(label="draft")
        nap(1.4)
    files[-1]["state"] = "new"

    # one question mid-way, the way a real build would ask
    job(jid, status="waiting", note="One question before I finish")
    loud = [{"t": "nav"}, {"t": "hero"}] + blocks[len(shape["head"]):]
    calm = [{"t": "nav"}, {"t": "text", "n": 2}] + blocks[len(shape["head"]):]
    look = ask("Which top of the page?", ["Big headline", "Quiet intro"], biz=biz, job=jid, kind="ab",
               detail="Same content below, only the top changes.",
               variants=[{"label": "Big headline", "spec": loud, "note": "bold"}, {"label": "Quiet intro", "spec": calm, "note": "calm"}],
               timeout=TTL, default="Big headline")
    preview[:] = loud if look == "Big headline" else calm
    shots.append(list(preview))
    job(jid, status="running", note=f"{look} chosen")
    push(label=look)
    nap(1.5)

    # 4. checks
    if "Check it on desktop and phone" not in skipped:
        job(jid, stage=3)
        for k in range(tests["total"]):
            tests["passed"] += 1
            push(label=look)
            nap(0.4)
        event("All 12 checks pass on desktop and phone", biz=biz, job=jid)
    else:
        event("Checks skipped, as you asked", biz=biz, job=jid)

    # 5. result
    job(jid, stage=4, status="waiting", note="Done, have a look")
    lines = [f"{shape['thing'].capitalize()} with {len(keep)} parts" + (f", left out: {', '.join(sorted(off))}" if off else ""),
             f"Top of the page: {look.lower()}",
             "Not published: demo" if "Put it on the preview site" in skipped else "Would be on the preview site now (demo, it is not)"]
    c = ask("Here it is. Happy with it?", ["looks good", "change something"], biz=biz, job=jid, kind="result",
            detail="Drag across the picture to compare.", timeout=TTL, default="looks good",
            card={"before": OLD_PAGE, "after": list(preview), "lines": lines})
    job(jid, status="done", stage=5, note=f"You said: {c} (demo)")
    event(f"Build finished: {title} ({c})", biz=biz, job=jid)
    prompt_status(p["id"], "done", jid)


def main() -> None:
    print("Listening for prompts from the Live tab. Ctrl-C to stop.", flush=True)
    while True:
        p = next_prompt(25)
        if not p:
            continue
        print(f"prompt: {p['text']}", flush=True)
        try:
            play(p)
        except Exception as e:  # noqa: BLE001 - one bad run must not kill the listener
            print(f"demo run failed: {e}", flush=True)
            prompt_status(p["id"], "failed")
        if "--once" in sys.argv:
            return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
