#!/usr/bin/env python3
"""
PreToolUse hook for sessions started from the Live tab: the session has no terminal,
so this IS its permission system.

  safe  -> allowed silently: reading and searching, editing files inside the session's
           own folder, and a short list of harmless commands (git status, builds, checks)
  else  -> a card in the Live tab ("Allow this command?") with the exact command; the
           session waits for the tap. No tap in 30 min, or no relay = DENY.

It answers with hookSpecificOutput.permissionDecision, so it never weakens anything:
a deny here blocks the call even if some other setting would have allowed it.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "client"))
from hq_live import ask  # noqa: E402

READ_ONLY = {"Read", "Glob", "Grep", "LS", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "ToolSearch"}
EDITS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
# Whole commands that only look or build locally. Anything with a pipe into a shell,
# a redirect outside, network tools or deletes falls through to a card.
SAFE_BASH = [
    r"(ls|pwd|cat|head|tail|wc|echo|find|grep|rg|which|date|sort|uniq|diff|tree)\b[^;&|<>`$]*",
    r"git (status|diff|log|show|branch|add|commit|rev-parse|ls-files)\b[^;&|<>`$]*",
    r"(npm|pnpm) (run (build|typecheck|lint|test)|test|ci)\b[^;&|<>`$]*",
    r"(python3?|node) (-m py_compile|--check) [^;&|<>`$]*",
    r"mkdir -p [^;&|<>`$]*",
]
TIMEOUT = int(os.environ.get("HQ_PERMISSION_TIMEOUT", "1800"))


CLIENT = str((Path(__file__).resolve().parent.parent / "client" / "hq_live.py"))


def is_live_call(cmd: str) -> bool:
    """The session talking to the Live tab: exactly `python3 <client> card|job|event ...`, with
    nothing chained, piped, redirected or substituted (no $, backticks or newlines at all)."""
    if any(ch in cmd for ch in "$`\n\r"):
        return False
    try:
        lex = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        toks = list(lex)
    except ValueError:
        return False
    if any(set(t) <= set(";&|<>()") for t in toks):
        return False
    return len(toks) >= 3 and toks[0] in ("python3", "python") and toks[1] == CLIENT and toks[2] in ("card", "job", "event")


def decide(allow: bool, reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow" if allow else "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def inside(path: str, root: Path) -> bool:
    try:
        Path(path).resolve().relative_to(root.resolve())
        return True
    except (ValueError, OSError):
        return False


def main() -> None:
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}
    root = Path(data.get("cwd") or os.getcwd())
    biz = int(os.environ["HQ_BIZ"]) if os.environ.get("HQ_BIZ", "").isdigit() else None
    job = os.environ.get("HQ_JOB")

    if tool in READ_ONLY:
        decide(True, "read-only")
    if tool in EDITS:
        target = inp.get("file_path") or inp.get("notebook_path") or ""
        if target and inside(target, root):
            decide(True, "edit inside the session folder")
        what = f"{tool} outside the project: {target}"
        detail = "The session wants to change a file outside its own folder."
    elif tool == "Bash":
        cmd = (inp.get("command") or "").strip()
        if is_live_call(cmd):
            decide(True, "talking to the Live tab")
        if any(re.fullmatch(p, cmd, flags=re.S) for p in SAFE_BASH):
            decide(True, "harmless command")
        what = cmd
        detail = (inp.get("description") or "The session wants to run a command.").strip()
    else:
        what = f"{tool} {json.dumps(inp)[:600]}"
        detail = "A tool outside the safe list."

    choice = ask(f"Allow: {tool}?", ["allow", "deny"], biz=biz, job=job, kind="text", text=what[:1500],
                 detail=detail[:400], timeout=TIMEOUT, default="deny")
    if choice == "allow":
        decide(True, "Einar allowed it in the Live tab")
    decide(False, "Einar denied it in the Live tab (or no answer in time). Find another way or ask in a card.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - when in doubt, deny
        decide(False, f"permission hook failed ({e}); denied to be safe")
