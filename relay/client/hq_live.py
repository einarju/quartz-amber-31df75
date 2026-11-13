#!/usr/bin/env python3
"""
HQ Live client: one import (or one CLI call) that lets any job talk to the Live tab.

Config, first found wins:
  env HQ_RELAY_URL + HQ_RELAY_TOKEN
  ~/.config/hq-live.json   {"url": "https://...", "token": "..."}

Fire-and-forget calls (job, event) NEVER raise and give up after 3 s, so a dead relay
can't break a render. Only ask() blocks, because waiting for Einar is its whole point.

    from hq_live import job, event, ask
    job("pack-2026-11-09", biz=2, title="Daily pack", stages=["Panels", "Kling", "Gate", "4K", "Publish"], stage=1)
    event("clip 3 rendered", biz=2, job="pack-2026-11-09")
    choice = ask("Clip 4: seam at 0:05", ["redo", "keep", "drop"], biz=2, media="https://.../04.mp4")

CLI:
    hq_live.py event "text" [--biz 2] [--kind file --path app/x.ts]
    hq_live.py job ID --title T [--biz 2] [--stages a,b,c] [--stage 1] [--status running]
    hq_live.py ask "Title" redo,keep,drop [--biz 2] [--media URL] [--detail TEXT] [--timeout 3600]
"""
from __future__ import annotations

import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

def _machine() -> str:
    if os.environ.get("HQ_MACHINE"):
        return os.environ["HQ_MACHINE"]
    try:
        name = json.loads((Path.home() / ".config" / "hq-live.json").read_text()).get("machine")
    except (OSError, ValueError):
        name = None
    return name or socket.gethostname().split(".")[0]


MACHINE = _machine()


def _config() -> tuple[str, str] | None:
    url, token = os.environ.get("HQ_RELAY_URL"), os.environ.get("HQ_RELAY_TOKEN")
    if not (url and token):
        try:
            cfg = json.loads((Path.home() / ".config" / "hq-live.json").read_text())
            url, token = cfg.get("url"), cfg.get("token")
        except (OSError, ValueError):
            return None
    return (url.rstrip("/"), token) if url and token else None


def _call(method: str, path: str, body: dict | None = None, timeout: float = 3.0) -> dict | None:
    cfg = _config()
    if not cfg:
        return None
    url, token = cfg
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{url}{path}", data=data, method=method, headers={
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "user-agent": "hq-live-client/1",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def _quiet(method: str, path: str, body: dict) -> dict | None:
    try:
        return _call(method, path, body)
    except Exception:  # noqa: BLE001 - the relay must never break the job
        return None


def _drop_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def job(id: str, *, title: str | None = None, biz: int | None = None, stages: list[str] | None = None,
        stage: int | None = None, status: str | None = None, note: str | None = None,
        items: list[dict] | None = None, view: str | None = None, data: dict | None = None) -> dict | None:
    """Create or update a pipeline. Items merge by id: {id, label, status, media, thumb, note}.

    view picks how the tab draws it: media (clips), build (files + tests + preview),
    leads (cards), metric (big number + chart), doc (text being written). data is
    that view's payload and is replaced whole on each call."""
    return _quiet("POST", "/v1/job", _drop_none({
        "id": id, "title": title, "biz": biz, "stages": stages, "stage": stage, "status": status,
        "note": note, "items": items, "view": view, "data": data, "machine": MACHINE}))


def item(job_id: str, item_id: str, **fields) -> dict | None:
    """Shorthand: update one item of a job."""
    return job(job_id, items=[{"id": item_id, **fields}])


def event(text: str, *, biz: int | None = None, job: str | None = None, kind: str = "note",
          path: str | None = None) -> dict | None:
    return _quiet("POST", "/v1/event", _drop_none({
        "text": text, "biz": biz, "job": job, "kind": kind, "path": path, "machine": MACHINE}))


def ask(title: str, options: list[str], **kw) -> str | None:
    """Open a decision card and wait for the tap. Returns the choice, or `default` on timeout/no relay.

    kind: choice (buttons, optional media) | ab (variants side by side, each
    {label, spec|image}) | text (approve a draft passed as text) | brief | plan | result
    (payload in `card`, see ask_full)."""
    return ask_full(title, options, **kw)["choice"]


def ask_full(title: str, options: list[str], *, biz: int | None = None, job: str | None = None,
             detail: str | None = None, media: str | None = None, thumb: str | None = None,
             timeout: float = 3600, default: str | None = None, kind: str | None = None,
             variants: list[dict] | None = None, text: str | None = None, card: dict | None = None) -> dict:
    """Like ask(), but returns {"choice", "extra"}: extra is what else the tap carried, e.g. the
    scope chips (brief) or plan steps (plan) Einar switched off, as {"off": [labels]}."""
    fallback = {"choice": default, "extra": None}
    try:
        d = _call("POST", "/v1/decision", _drop_none({
            "title": title, "options": options, "biz": biz, "job": job, "detail": detail,
            "media": media, "thumb": thumb, "ttl": int(timeout), "default": default,
            "kind": kind, "variants": variants, "text": text, "card": card}))
    except Exception:  # noqa: BLE001
        return fallback
    if not d:
        return fallback
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = _call("GET", f"/v1/decision/{d['id']}/wait?timeout=25", timeout=35)
            if r and r.get("status") == "answered":
                return {"choice": r.get("choice"), "extra": r.get("extra")}
            if r and r.get("status") == "expired":
                return {"choice": r.get("choice") or default, "extra": None}
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(5)  # relay restarting or network blip: keep waiting
    return fallback


def snapshot() -> dict | None:
    """The relay's full current state (jobs, events, decisions, prompts), read from its stream."""
    cfg = _config()
    if not cfg:
        return None
    url, token = cfg
    req = urllib.request.Request(f"{url}/v1/stream", headers={"authorization": f"Bearer {token}", "user-agent": "hq-live-client/1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        for line in r:
            line = line.decode().strip()
            if line.startswith("data:"):
                return json.loads(line[5:])
    return None


def next_prompt(timeout: int = 25) -> dict | None:
    """Claim the oldest prompt typed or spoken in the Live tab (long-polls up to `timeout` s)."""
    try:
        r = _call("GET", f"/v1/prompt/next?timeout={timeout}&machine={MACHINE}", timeout=timeout + 10)
        return (r or {}).get("prompt")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def prompt_status(prompt_id: str, status: str, job_id: str | None = None) -> None:
    _quiet("POST", f"/v1/prompt/{prompt_id}", _drop_none({"status": status, "job": job_id}))


def _env_int(name: str) -> int | None:
    v = os.environ.get(name, "")
    return int(v) if v.isdigit() else None


def _main(argv: list[str]) -> int:
    import argparse
    # Inside a session started from the Live tab, HQ_JOB and HQ_BIZ are set by the runner,
    # so the session's commands land on its own job without repeating them.
    env_job, env_biz = os.environ.get("HQ_JOB"), _env_int("HQ_BIZ")
    p = argparse.ArgumentParser(prog="hq_live")
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("event"); e.add_argument("text"); e.add_argument("--biz", type=int, default=env_biz)
    e.add_argument("--job", default=env_job); e.add_argument("--kind", default="note"); e.add_argument("--path")
    j = sub.add_parser("job"); j.add_argument("id", nargs="?", default=env_job); j.add_argument("--title"); j.add_argument("--biz", type=int, default=env_biz)
    j.add_argument("--stages"); j.add_argument("--stage", type=int); j.add_argument("--status"); j.add_argument("--note")
    j.add_argument("--view"); j.add_argument("--data", help="JSON object, merged into the job's view data")
    a = sub.add_parser("ask"); a.add_argument("title"); a.add_argument("options"); a.add_argument("--biz", type=int, default=env_biz)
    a.add_argument("--job", default=env_job); a.add_argument("--detail"); a.add_argument("--media"); a.add_argument("--timeout", type=float, default=3600)
    c = sub.add_parser("card", help="open any card from JSON, wait for the tap, print {choice, extra} as JSON")
    c.add_argument("spec", help='JSON: {"kind","title","options","detail","default","card","variants","text","timeout"}')
    args = p.parse_args(argv)
    if args.cmd == "card":
        spec = json.loads(args.spec)
        out = ask_full(spec["title"], spec["options"], biz=spec.get("biz", env_biz), job=spec.get("job", env_job),
                       detail=spec.get("detail"), media=spec.get("media"), thumb=spec.get("thumb"),
                       timeout=float(spec.get("timeout", 1800)), default=spec.get("default"), kind=spec.get("kind"),
                       variants=spec.get("variants"), text=spec.get("text"), card=spec.get("card"))
        print(json.dumps(out))
        return 0 if out.get("choice") is not None else 1
    if args.cmd == "event":
        event(args.text, biz=args.biz, job=args.job, kind=args.kind, path=args.path)
    elif args.cmd == "job":
        if not args.id:
            print("no job id (pass one or set HQ_JOB)", file=sys.stderr)
            return 2
        job(args.id, title=args.title, biz=args.biz, stages=args.stages.split(",") if args.stages else None,
            stage=args.stage, status=args.status, note=args.note, view=args.view,
            data=json.loads(args.data) if args.data else None)
    else:
        choice = ask(args.title, args.options.split(","), biz=args.biz, job=args.job, detail=args.detail,
                     media=args.media, timeout=args.timeout)
        if choice is None:
            return 1
        print(choice)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
