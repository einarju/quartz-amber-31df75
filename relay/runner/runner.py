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


class Preview:
    """Serves each build's worktree and its screenshots on http://localhost:4330, bound to
    127.0.0.1 only (this Mac; never the network). /w/<prompt id>/... is the build's folder,
    /shots/<prompt id>/<n>.png its screenshots. Read-only GETs, paths confined to those folders."""

    PORT = 4330
    SHOTS = Path.home() / ".cache" / "hq-live" / "shots"
    CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

    def __init__(self) -> None:
        self.roots: dict[str, Path] = {}
        self.SHOTS.mkdir(parents=True, exist_ok=True)
        import functools
        import http.server
        import threading

        outer = self

        class Handler(http.server.SimpleHTTPRequestHandler):
            def translate_path(self, path: str) -> str:  # noqa: D401 - map URL to an allowed file only
                parts = path.split("?", 1)[0].split("#", 1)[0].strip("/").split("/")
                if len(parts) >= 2 and parts[0] in ("w", "shots"):
                    base = outer.roots.get(parts[1]) if parts[0] == "w" else outer.SHOTS / parts[1]
                    if base:
                        target = (base / "/".join(parts[2:])).resolve()
                        if str(target).startswith(str(Path(base).resolve())):
                            return str(target)
                return "/nonexistent"

            def log_message(self, *a) -> None:  # quiet
                pass

            def end_headers(self) -> None:
                self.send_header("Cache-Control", "no-store")
                super().end_headers()

        srv = http.server.ThreadingHTTPServer(("127.0.0.1", self.PORT), functools.partial(Handler, directory=str(Path.home())))
        threading.Thread(target=srv.serve_forever, daemon=True).start()

    def register(self, pid: str, folder: Path) -> None:
        self.roots[pid] = folder

    def base(self, pid: str) -> str:
        return f"http://localhost:{self.PORT}/w/{pid}/"

    def page_url(self, pid: str) -> str | None:
        """The build's main page: index.html at the top, else the first html file found."""
        root = self.roots.get(pid)
        if not root or not root.exists():
            return None
        if (root / "index.html").exists():
            return self.base(pid) + "index.html"
        for f in sorted(root.rglob("*.html")):
            if ".git" not in f.parts and "node_modules" not in f.parts:
                return self.base(pid) + str(f.relative_to(root))
        return None

    def screenshot(self, pid: str, url: str, n: int) -> str | None:
        """Real screenshot with a hidden Chrome (its own throwaway profile, so the open browser is untouched)."""
        out = self.SHOTS / pid / f"{n:03d}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        import tempfile
        with tempfile.TemporaryDirectory() as prof:
            try:
                subprocess.run([self.CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                                # tall frame: pages often pin the headline to the bottom of a full-height hero
                                "--window-size=1280,1500", "--virtual-time-budget=3000", f"--screenshot={out}", url],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
            except (OSError, subprocess.TimeoutExpired):
                return None
        return f"http://localhost:{self.PORT}/shots/{pid}/{out.name}" if out.exists() else None


PREVIEW: Preview  # started in main(), only when the runner actually listens


def run(p: dict) -> None:
    pid, text = p["id"], p["text"].strip()
    biz = p.get("biz")
    jid = f"run-{pid}"
    title = text if len(text) < 60 else text[:57] + "..."

    pin = (p.get("pin") or "").strip()
    if not pin_ok(pin):
        prompt_status(pid, "failed")
        why = "no PIN arrived" if not pin else f"the PIN that arrived has {len(pin)} characters and does not match"
        event(f"Prompt refused: {why}. Set it with the lock in the prompt bar.", biz=biz, kind="error")
        return

    folders = allowlist()
    folder = folders.get(biz) if biz else None
    where = folder.name if folder else "hq-builds (scratch)"
    folder = folder or ensure_scratch()

    files: dict[str, str] = {}
    worktree = folder / ".claude" / "worktrees" / f"hq-{pid}"  # where `claude -w hq-<pid>` puts the session
    PREVIEW.register(pid, worktree)
    shots: list[str] = []
    pending: dict[str, str] = {}  # tool_use id of an edit -> file path, screenshot once it lands

    def snap() -> None:
        url = PREVIEW.page_url(pid)
        if not url:
            return
        shot = PREVIEW.screenshot(pid, url, len(shots))
        if shot:
            shots.append(shot)
            job(jid, data={"shots_img": shots[-12:], "url": url})

    job(jid, title=title, biz=biz, view="build", stages=STAGES, stage=0, status="running",
        note=f"Starting a Claude session in {where}",
        data={"files": [], "preview": [], "tests": {}, "folder": str(worktree).replace(str(Path.home()), "~")})
    prompt_status(pid, "working", jid)
    event(f"Session starting in {where}: {title}", biz=biz, job=jid)

    protocol = (HERE / "protocol.md").read_text().replace("{CLIENT}", str(CLIENT)).replace("{PREVIEW}", PREVIEW.base(pid))
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
                        if re.search(r"\.(html?|css|js|jsx|tsx|svg)$", path):
                            pending[part.get("id", "")] = path
                    elif name == "Bash" and "hq_live.py" not in (inp.get("command") or ""):
                        event((inp.get("description") or "ran a command")[:200], biz=biz, job=jid, kind="tool")
            elif msg.get("type") == "user":
                # tool results: the edit has now really been written, so the screenshot shows it
                for part in (msg.get("message") or {}).get("content") or []:
                    if isinstance(part, dict) and part.get("type") == "tool_result" and pending.pop(part.get("tool_use_id", ""), None):
                        snap()
            elif msg.get("type") == "result":
                result_text = msg.get("result") or ""
                failed = bool(msg.get("is_error"))
        proc.wait()
        failed = failed or proc.returncode not in (0, None)

    for k in files:
        files[k] = "edit"
    snap()  # the final look, for the stage and the history
    summary = (result_text.strip().splitlines() or ["finished"])[0][:160]
    job(jid, status="failed" if failed else "done", stage=len(STAGES), note=summary,
        data={"files": [{"path": k, "state": v} for k, v in files.items()], "summary": result_text.strip()[:1200]})
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
    global PREVIEW
    PREVIEW = Preview()
    # earlier builds stay openable after a restart
    for repo in [SCRATCH, *allowlist().values()]:
        for wt in sorted((repo / ".claude" / "worktrees").glob("hq-*")):
            PREVIEW.register(wt.name[3:], wt)
    print(f"Previews on http://localhost:{Preview.PORT} (this Mac only).", flush=True)
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
