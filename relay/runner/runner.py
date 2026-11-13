#!/usr/bin/env python3
"""
HQ Live runner (Mac): turns a prompt from the Live tab into a real Claude Code session.

For every prompt it claims from the relay:
  1. checks the launch PIN (only its SHA-256 lives in ~/.config/hq-live.json)
  2. picks the folder: the business's own repo under ~/hq-work/NN-*, else the scratch
     repo ~/hq-builds. Nothing outside that allowlist can be targeted.
  3. starts `claude -p` there in a FRESH worktree (-w), on the normal subscription, with
     the permission hook (risky calls become cards) and the build protocol (scope, plan,
     result cards)
  4. streams the session's edits and commands into the job on the Live stage

One session at a time. Nothing is pushed, merged or deployed by the runner.

    python3 runner.py              # listen (Ctrl-C to stop)
    python3 runner.py set-pin      # set or change the launch PIN (asks on stdin)
    python3 runner.py check        # show config, allowlist and Claude path, start nothing
"""
from __future__ import annotations

import getpass
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "client"))
from hq_live import event, job, next_prompt, prompt_status  # noqa: E402

CFG = Path.home() / ".config" / "hq-live.json"
CLIENT = HERE.parent / "client" / "hq_live.py"
HOOK = HERE / "permission_hook.py"
SCRATCH = Path.home() / "hq-builds"
HQ_WORK = Path.home() / "hq-work"
MAX_SECONDS = 2 * 3600
STAGES = ["Understand", "Plan", "Build", "Check", "Result"]


def cfg() -> dict:
    return json.loads(CFG.read_text())


def save_cfg(c: dict) -> None:
    CFG.write_text(json.dumps(c, indent=1) + "\n")
    CFG.chmod(0o600)


def pin_ok(pin: str | None) -> bool:
    want = cfg().get("launch_pin_sha256")
    if not want or not pin:
        return False
    return hmac.compare_digest(hashlib.sha256(pin.encode()).hexdigest(), want)


def allowlist() -> dict[int, Path]:
    """Business number -> its repo on this Mac (~/hq-work/NN-name with a .git)."""
    out: dict[int, Path] = {}
    for d in sorted(HQ_WORK.glob("[0-9][0-9]-*")):
        if (d / ".git").exists():
            out[int(d.name[:2])] = d
    return out


def ensure_scratch() -> Path:
    if not (SCRATCH / ".git").exists():
        SCRATCH.mkdir(exist_ok=True)
        (SCRATCH / "README.md").write_text("# hq-builds\n\nScratch repo for builds started from HQ Live with no business picked.\n"
                                           "Each build lives in its own worktree under .claude/worktrees/.\n")
        subprocess.run(["git", "init", "-q"], cwd=SCRATCH, check=True)
        subprocess.run(["git", "add", "README.md"], cwd=SCRATCH, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "Start hq-builds"], cwd=SCRATCH, check=True)
    return SCRATCH


def claude_bin() -> str:
    return shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude")


def settings_json() -> str:
    return json.dumps({"hooks": {"PreToolUse": [{"matcher": "*", "hooks": [
        {"type": "command", "command": f"python3 {HOOK}", "timeout": 1900}]}]}})


def rel(path: str) -> str:
    m = re.search(r"/\.claude/worktrees/[^/]+/(.+)$", path)
    return m.group(1) if m else Path(path).name


def run(p: dict) -> None:
    pid, text = p["id"], p["text"].strip()
    biz = p.get("biz")
    jid = f"run-{pid}"
    title = text if len(text) < 60 else text[:57] + "..."

    if not pin_ok(p.get("pin")):
        prompt_status(pid, "failed")
        event("Prompt refused: wrong or missing launch PIN (set it with the lock in the prompt bar)", biz=biz, kind="error")
        return

    folders = allowlist()
    folder = folders.get(biz) if biz else None
    where = folder.name if folder else "hq-builds (scratch)"
    folder = folder or ensure_scratch()

    files: dict[str, str] = {}
    job(jid, title=title, biz=biz, view="build", stages=STAGES, stage=0, status="running",
        note=f"Starting a Claude session in {where}", data={"files": [], "preview": [], "tests": {}})
    prompt_status(pid, "working", jid)
    event(f"Session starting in {where}: {title}", biz=biz, job=jid)

    protocol = (HERE / "protocol.md").read_text().replace("{CLIENT}", str(CLIENT))
    cmd = [claude_bin(), "-p", text, "--append-system-prompt", protocol, "--settings", settings_json(),
           "--permission-mode", "default", "--output-format", "stream-json", "--verbose",
           "-w", f"hq-{pid}", "--max-turns", "80", "-n", f"HQ Live: {title}"]
    env = {**os.environ, "HQ_JOB": jid, "HQ_BIZ": str(biz or ""), "HQ_MACHINE": cfg().get("machine", "mac")}
    started = time.time()
    result_text, failed = "", False
    with subprocess.Popen(cmd, cwd=folder, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1) as proc:
        assert proc.stdout
        for line in proc.stdout:
            if time.time() - started > MAX_SECONDS:
                proc.kill()
                failed, result_text = True, "Stopped after 2 hours."
                break
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("type") == "assistant":
                for part in (msg.get("message") or {}).get("content") or []:
                    if part.get("type") != "tool_use":
                        continue
                    name, inp = part.get("name"), part.get("input") or {}
                    if name in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
                        path = rel(inp.get("file_path") or inp.get("notebook_path") or "")
                        for k in files:
                            if files[k] == "active":
                                files[k] = "edit"
                        files[path] = "active"
                        job(jid, data={"files": [{"path": k, "state": v} for k, v in files.items()]})
                        event(f"{name.lower()} {path}", biz=biz, job=jid, kind="file", path=path)
                    elif name == "Bash" and "hq_live.py" not in (inp.get("command") or ""):
                        event((inp.get("description") or "ran a command")[:200], biz=biz, job=jid, kind="tool")
            elif msg.get("type") == "result":
                result_text = msg.get("result") or ""
                failed = bool(msg.get("is_error"))
        proc.wait()
        failed = failed or proc.returncode not in (0, None)

    for k in files:
        files[k] = "edit"
    summary = (result_text.strip().splitlines() or ["finished"])[0][:160]
    job(jid, status="failed" if failed else "done", stage=len(STAGES), note=summary,
        data={"files": [{"path": k, "state": v} for k, v in files.items()]})
    prompt_status(pid, "failed" if failed else "done", jid)
    event(f"Session {'failed' if failed else 'finished'}: {title}", biz=biz, job=jid, kind="error" if failed else "note")


def main() -> None:
    if sys.argv[1:3] == ["set-pin", "--random"]:
        import secrets
        pin = f"{secrets.randbelow(10**6):06d}"
        c = cfg()
        c["launch_pin_sha256"] = hashlib.sha256(pin.encode()).hexdigest()
        save_cfg(c)
        print(f"Launch PIN: {pin}  (only its hash is stored; change it any time with set-pin)")
        return
    if sys.argv[1:2] == ["set-pin"]:
        pin = getpass.getpass("New launch PIN (4+ digits): ").strip()
        if len(pin) < 4:
            sys.exit("too short")
        c = cfg()
        c["launch_pin_sha256"] = hashlib.sha256(pin.encode()).hexdigest()
        save_cfg(c)
        print("PIN saved (only its hash is stored).")
        return
    if sys.argv[1:2] == ["check"]:
        c = cfg()
        print("relay:", c.get("url"), "| pin set:", bool(c.get("launch_pin_sha256")))
        print("claude:", claude_bin())
        print("allowlist:", {k: str(v) for k, v in allowlist().items()}, "| scratch:", SCRATCH)
        return
    if not cfg().get("launch_pin_sha256"):
        sys.exit("No launch PIN yet: run `python3 runner.py set-pin` first.")
    print(f"HQ Live runner listening. Allowlist: {sorted(allowlist())} + scratch {SCRATCH}. Ctrl-C to stop.", flush=True)
    while True:
        p = next_prompt(25)
        if not p:
            continue
        print(f"prompt {p['id']}: {p['text'][:80]}", flush=True)
        try:
            run(p)
        except Exception as e:  # noqa: BLE001 - one bad run must not kill the runner
            print(f"run failed: {e}", flush=True)
            prompt_status(p["id"], "failed")
            event(f"Runner error: {e}", biz=p.get("biz"), kind="error")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
