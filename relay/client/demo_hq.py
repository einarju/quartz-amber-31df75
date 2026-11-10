#!/usr/bin/env python3
"""
Full HQ Live test: five businesses working at once, each drawn by a different view,
with five taps spread over ~4 minutes. EVERYTHING IS FAKE: nothing is rendered,
billed, sent, traded or published. Clips/thumbnails are real public pack files.

  #7 Memecoin bots     metric  a paper-trading number + chart ticking the whole time
  #2 Cover Visualizer  build   a pricing page being built: files, checks, live wireframe -> A/B tap
  #3 Visual packs      media   a daily pack, clips landing -> loop-seam tap
  #5 Techno label      leads   labels found and scored, a DM drafted -> approve-text tap
  #10 Ambient YouTube  doc     a description being written -> schedule tap

    python3 demo_hq.py          # ~4 min
    python3 demo_hq.py --fast   # ~1.5 min
"""
from __future__ import annotations

import json
import random
import sys
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from hq_live import ask, event, item, job  # noqa: E402

FAST = "--fast" in sys.argv
TTL = 1800  # cards wait 30 min, then take their default
BASE = "https://live.bassvision.store/content/"
RUN = str(random.randint(100, 999))
stop = threading.Event()
BOT_ASK: list[threading.Thread] = []  # the bots card, so the demo waits for that tap too


def nap(s: float) -> None:
    time.sleep(s / 2.5 if FAST else s)


def packs() -> list[dict]:
    with urllib.request.urlopen(f"{BASE}packs.json", timeout=10) as r:
        return [p for p in json.load(r)["packs"] if len([c for c in p["clips"] if c["kind"] == "loop"]) >= 4]


# ------------------------------------------------------------------ #7 bots

def bots() -> None:
    jid = f"demo-bots-{RUN}"
    bal, series, trades, wins = 1000.0, [1000.0], 0, 0
    job(jid, title="Paper run, day 9 (DEMO)", biz=7, view="metric", stages=["Watch", "Trade", "Report"], stage=1,
        note="8 strategy variants on paper money")
    event("Bots: paper run tick started", biz=7, job=jid)
    asked = False
    while not stop.is_set():
        step = random.gauss(0.6, 6)
        bal = max(600, bal + step)
        series.append(round(bal, 2))
        trades += 1
        wins += step > 0
        job(jid, data={
            "label": "Paper balance", "value": f"{bal:,.0f}", "unit": " USD",
            "delta": round((bal / 1000 - 1) * 100, 1), "series": series[-90:],
            "stats": [{"label": "Trades", "value": str(trades)}, {"label": "Win rate", "value": f"{wins / trades:.0%}"},
                      {"label": "Best variant", "value": "v5 momentum"}, {"label": "Worst", "value": "v3 dip-buy"}]})
        if trades == 45 and not asked:
            asked = True
            ask_thread = threading.Thread(target=bots_ask, args=(jid,), daemon=True)
            BOT_ASK.append(ask_thread)
            ask_thread.start()
        nap(2)
    job(jid, status="done", stage=2, note="Paper run paused for the night (demo)")


def bots_ask(jid: str) -> None:
    job(jid, status="waiting")
    c = ask("Variant v3 is down 18% this hour", ["pause v3", "keep running"], biz=7, job=jid,
            detail="Paper money only. Pausing stops its trades until you turn it back on.", timeout=TTL, default="keep running")
    event(f"Bots: you chose {c}", biz=7, job=jid)
    job(jid, status="running", note=f"8 strategy variants on paper money, v3 {'paused' if c == 'pause v3' else 'running'}")


# --------------------------------------------------------------- #2 build

FILES = ["site/pricing/index.html", "site/pricing/pricing.css", "site/assets/plans.json",
         "site/partials/nav.html", "tests/pricing.spec.ts", "tests/checkout.spec.ts"]
LAYOUT_A = [{"t": "nav"}, {"t": "hero"}, {"t": "price", "n": 3, "hi": 1}, {"t": "text", "n": 2}, {"t": "cta"}]
LAYOUT_B = [{"t": "nav"}, {"t": "hero"}, {"t": "toggle"}, {"t": "price", "n": 2, "hi": 0}, {"t": "faq", "n": 4}, {"t": "cta"}]


def build() -> None:
    nap(4)
    jid = f"demo-build-{RUN}"
    stages = ["Plan", "Code", "Checks", "Preview", "Ship"]
    files: list[dict] = []
    tests = {"total": 14, "passed": 0, "failed": 0}
    preview: list[dict] = []

    def push(**kw):
        job(jid, data={"files": files, "tests": tests, "preview": preview, "previewLabel": kw.pop("label", "")}, **kw)

    job(jid, title="Pricing page (DEMO)", biz=2, view="build", stages=stages, stage=0, note="Free / $19 / $49 / $129 / $349 ladder")
    push()
    event("Build: planning the pricing page", biz=2, job=jid, kind="tool")
    nap(3)
    job(jid, stage=1)
    for i, f in enumerate(FILES):
        for row in files:
            row["state"] = "edit" if row["state"] in ("active", "edit") else row["state"]
        files.append({"path": f, "state": "active"})
        if i < len(LAYOUT_A):
            preview.append(LAYOUT_A[i])
        push(label="draft")
        event("edit", biz=2, job=jid, kind="file", path=f"cover-visualizer/{f}")
        nap(2.4)
    files[-1]["state"] = "new"
    job(jid, stage=2)
    for k in range(tests["total"]):
        if k == 9:
            tests["failed"] = 1
        else:
            tests["passed"] += 1
        push(label="draft")
        nap(0.6)
    event("Checks: 13 pass, 1 failing (checkout link)", biz=2, job=jid, kind="error")
    nap(1.5)
    tests.update(passed=14, failed=0)
    files[5]["state"] = "active"
    push(label="draft")
    event("Fixed the checkout link, all 14 checks pass", biz=2, job=jid)
    nap(1.5)
    job(jid, stage=3, status="waiting", note="Two layouts ready, waiting for you")
    choice = ask("Which pricing layout?", ["Layout A", "Layout B"], biz=2, job=jid, kind="ab",
                 detail="A: three plans side by side, middle one highlighted. B: monthly/yearly toggle, two big plans and an FAQ.",
                 variants=[{"label": "Layout A", "spec": LAYOUT_A, "note": "3 plans"},
                           {"label": "Layout B", "spec": LAYOUT_B, "note": "toggle + FAQ"}],
                 timeout=TTL, default="Layout A")
    preview[:] = LAYOUT_A if choice == "Layout A" else LAYOUT_B
    for row in files:
        row["state"] = "edit"
    job(jid, status="running", stage=4, note=f"{choice} chosen, shipping to the preview site (demo)")
    push(label=choice)
    event(f"Build: you picked {choice}", biz=2, job=jid)
    nap(4)
    job(jid, status="done", stage=5, note=f"On the preview site with {choice} (demo)")
    push(label=choice)


# ---------------------------------------------------------------- #3 pack

def pack() -> None:
    nap(12)
    p = random.choice(packs())
    clips = [c for c in p["clips"] if c["kind"] == "loop"][:6]
    jid = f"demo-pack-{RUN}"
    job(jid, title=f"Daily pack (DEMO): {p['name']}", biz=3, view="media",
        stages=["Panels", "Kling", "Loop gate", "4K", "Publish"], stage=0, note="Real public clips, nothing is billed",
        items=[{"id": f"c{i+1}", "label": f"Clip {i+1}", "status": "queued"} for i in range(len(clips))])
    event(f"Pack started: {p['name']}", biz=3, job=jid)
    nap(3)
    job(jid, stage=1)
    for i, c in enumerate(clips):
        item(jid, f"c{i+1}", status="running", note="Kling 4.0 rendering")
        nap(3)
        item(jid, f"c{i+1}", status="done", thumb=BASE + c["thumb"], media=BASE + c["file"], note="")
    job(jid, stage=2)
    event("Loop gate: checking seams", biz=3, job=jid, kind="tool")
    nap(2)
    bad = min(3, len(clips) - 1)
    item(jid, f"c{bad+1}", status="waiting", note="seam jump at 0:05")
    job(jid, status="waiting", note=f"Clip {bad+1} failed the loop gate")
    c = ask(f"Clip {bad+1}: loop seam at 0:05", ["redo", "keep", "drop"], biz=3, job=jid,
            detail="The gate saw a jump where the loop restarts. Redo costs ~32 cr (not in a demo).",
            media=BASE + clips[bad]["file"], thumb=BASE + clips[bad]["thumb"], timeout=TTL, default="keep")
    job(jid, status="running", note="Real public clips, nothing is billed")
    if c == "redo":
        item(jid, f"c{bad+1}", status="running", note="re-rendering (demo)")
        nap(4)
        item(jid, f"c{bad+1}", status="done", note="redone")
    else:
        item(jid, f"c{bad+1}", status="done" if c == "keep" else "failed", note="kept" if c == "keep" else "dropped")
    job(jid, stage=3)
    nap(4)
    job(jid, stage=4)
    nap(3)
    job(jid, status="done", stage=5, note="Published (demo, nothing went to Gumroad)")
    event(f"Pack finished: {p['name']}", biz=3, job=jid)


# --------------------------------------------------------------- #5 leads

LEADS = [("Grey Room Records", "Berlin · hard techno"), ("Low Hum Audio", "Madrid · hypnotic"),
         ("Concrete Bloom", "CDMX · industrial"), ("Night Ferry", "Rotterdam · peak time"),
         ("Iron Lung Tapes", "Leeds · raw"), ("Sodium Lights", "Lisbon · melodic"),
         ("Deep Shelf", "Detroit · dub techno"), ("Cold Static", "Oslo · ambient techno")]


def leads() -> None:
    nap(25)
    jid = f"demo-leads-{RUN}"
    rows: list[dict] = []
    job(jid, title="Label outreach (DEMO)", biz=5, view="leads", stages=["Find", "Score", "Draft", "Send"], stage=0,
        note="Invented labels, nothing is sent")
    for name, meta in LEADS:
        rows.append({"name": name, "meta": meta, "status": "found"})
        job(jid, data={"leads": rows})
        event(f"Found {name}", biz=5, job=jid, kind="tool")
        nap(2)
    job(jid, stage=1)
    for r in rows:
        r["score"] = random.randint(35, 95)
        job(jid, data={"leads": rows})
        nap(0.5)
    best = max(rows, key=lambda r: r["score"])
    job(jid, stage=2)
    best["status"] = "drafted"
    job(jid, data={"leads": rows}, status="waiting", note=f"Draft ready for {best['name']}")
    dm = (f"Hi {best['name']} team, I turned the cover of your latest release into a 10 second "
          "audio-reactive loop. Happy to send it over, free, no strings. If you like it, I do these "
          "for every release. Einar, BassVision")
    c = ask(f"Send this DM to {best['name']}?", ["send", "edit first", "skip"], biz=5, job=jid, kind="text", text=dm,
            detail="Demo: nothing will be sent anywhere.", timeout=TTL, default="skip")
    best["status"] = "sent" if c == "send" else "skipped" if c == "skip" else "drafted"
    job(jid, stage=3, status="running", data={"leads": rows}, note=f"You chose: {c} (demo)")
    event(f"Outreach: {c} for {best['name']}", biz=5, job=jid)
    nap(3)
    job(jid, status="done", stage=4, note=f"1 DM {c} (demo)")


# ------------------------------------------------------------------ #10 doc

DESC = ("Slow, deep space drift for focus and sleep. Two hours of evolving pads recorded in one take, "
        "no loops, no ads in the middle. Best with headphones at low volume. Chapters below if you want "
        "to jump to the darker second half.")


def doc() -> None:
    nap(45)
    jid = f"demo-doc-{RUN}"
    job(jid, title="Ambient upload, title + description (DEMO)", biz=10, view="doc",
        stages=["Script", "Title", "Thumbnail", "Schedule"], stage=1, note="Nothing is uploaded")
    title = "Nebula Drift · 2 hours of deep space ambient"
    paras: list[str] = [f"Title: {title}"]
    job(jid, data={"heading": "YouTube upload", "paragraphs": paras, "typing": True})
    nap(2)
    words, cur = DESC.split(), []
    paras.append("")
    for w in words:
        cur.append(w)
        paras[-1] = " ".join(cur)
        job(jid, data={"heading": "YouTube upload", "paragraphs": paras, "typing": True})
        nap(0.35)
    job(jid, stage=2, data={"heading": "YouTube upload", "paragraphs": paras, "typing": False,
                            "tags": ["ambient", "space", "sleep", "focus", "2 hours"]})
    nap(2)
    p = random.choice(packs())
    job(jid, stage=3, status="waiting", note="Ready to schedule")
    c = ask("Schedule for Friday 18:00?", ["schedule", "hold"], biz=10, job=jid,
            detail="Demo: nothing is uploaded to YouTube.", thumb=BASE + p["thumb"], timeout=TTL, default="hold")
    job(jid, status="done", stage=4, note=f"{'Scheduled Fri 18:00' if c == 'schedule' else 'Held'} (demo)")
    event(f"YouTube: {c}", biz=10, job=jid)


def main() -> None:
    threads = [threading.Thread(target=f, daemon=True) for f in (build, pack, leads, doc)]
    bot = threading.Thread(target=bots, daemon=True)
    bot.start()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    while not BOT_ASK:
        time.sleep(1)  # the bots card opens after ~45 ticks; wait for it to exist
    for t in BOT_ASK:
        t.join()  # do not end while the bots card is still open
    nap(20)  # let the chart tick a little after the last tap
    stop.set()
    bot.join(timeout=10)
    print("full demo finished")


if __name__ == "__main__":
    main()
