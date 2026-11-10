#!/usr/bin/env python3
"""
PostToolUse hook: lights up the HQ Live tab while Claude Code works on this machine.

Sends one activity line per tool call to the HQ Live relay (see the dashboard repo,
relay/). Only file paths and the Bash *description* leave the machine, never the
command text or file contents (commands can carry tokens).

Silent no-op when ~/.config/hq-live.json is missing. Never fails the tool call: runs
async from settings.json, 2 s timeout, every error swallowed.
"""
import json
import os
import re
import socket
import sys
import urllib.request
from pathlib import Path

# Which of the 11 a folder belongs to. hq-work/NN-name folders map by their number.
BIZ_BY_FOLDER = {"cover-motion": 2, "bassvision-agent": 2, "covervisualizer-site": 2, "pulso": 2}


def biz_for(path: str):
    m = re.search(r"/hq-work/(\d{2})-", path)
    if m:
        return int(m.group(1))
    for part in Path(path).parts:
        if part in BIZ_BY_FOLDER:
            return BIZ_BY_FOLDER[part]
    return None


def project_root(cwd: str) -> Path:
    p = Path(cwd)
    for d in [p, *p.parents]:
        if (d / ".git").exists():
            return d
    return p


def main() -> None:
    try:
        cfg = json.loads((Path.home() / ".config" / "hq-live.json").read_text())
        url, token = cfg["url"].rstrip("/"), cfg["token"]
    except Exception:
        return
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}
    cwd = data.get("cwd") or os.getcwd()
    machine = os.environ.get("HQ_MACHINE") or cfg.get("machine") or socket.gethostname().split(".")[0]

    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        fp = inp.get("file_path") or inp.get("notebook_path") or ""
        if not fp:
            return
        root = project_root(os.path.dirname(fp) or cwd)
        try:
            rel = f"{root.name}/{Path(fp).resolve().relative_to(root.resolve())}"
        except ValueError:
            rel = Path(fp).name
        body = {"kind": "file", "text": f"{tool.lower()} {rel}", "path": rel, "biz": biz_for(fp)}
    elif tool == "Bash":
        desc = (inp.get("description") or "ran a shell command").strip()
        body = {"kind": "tool", "text": desc[:200], "biz": biz_for(cwd)}
    else:
        return

    body = {k: v for k, v in body.items() if v is not None}
    body["machine"] = machine
    req = urllib.request.Request(f"{url}/v1/event", data=json.dumps(body).encode(), method="POST", headers={
        "authorization": f"Bearer {token}", "content-type": "application/json", "user-agent": "hq-live-hook/1"})
    urllib.request.urlopen(req, timeout=2).read()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
