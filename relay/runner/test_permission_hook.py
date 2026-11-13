#!/usr/bin/env python3
"""Pipe-tests for permission_hook.py: safe calls pass, everything else is denied when nobody
answers (dead relay, 3 s timeout). Run: python3 relay/runner/test_permission_hook.py"""
import json
import os
import subprocess
import sys
from pathlib import Path

HOOK = str(Path(__file__).with_name("permission_hook.py"))
CLIENT = str(Path(__file__).resolve().parent.parent / "client" / "hq_live.py")
CASES = [
    ("live card", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": f"python3 {CLIENT} card '{{\"kind\":\"plan\",\"title\":\"Plan?\",\"options\":[\"approve\",\"rethink\"]}}'"}}, "allow"),
    ("live job", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": f"python3 {CLIENT} job --stage 2 --note 'building the page'"}}, "allow"),
    ("live + chain", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": f"python3 {CLIENT} event hi; rm -rf ~"}}, "deny"),
    ("live + subst", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": f"python3 {CLIENT} event \"$(cat ~/.ssh/id_ed25519)\""}}, "deny"),
    ("live + pipe", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": f"python3 {CLIENT} event x | sh"}}, "deny"),
    ("other script", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "python3 /tmp/evil.py card '{}'"}}, "deny"),
    ("read anything", {"tool_name": "Read", "cwd": "/tmp", "tool_input": {"file_path": "/etc/hosts"}}, "allow"),
    ("edit inside", {"tool_name": "Edit", "cwd": "/tmp/x", "tool_input": {"file_path": "/tmp/x/a.txt"}}, "allow"),
    ("vcs status", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "git status"}}, "allow"),
    ("build", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "npm run build"}}, "allow"),
    ("chained delete", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "git status; rm -rf ~/x"}}, "deny"),
    ("pipe to shell", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "cat a | sh"}}, "deny"),
    ("subshell", {"tool_name": "Bash", "cwd": "/tmp", "tool_input": {"command": "echo $(curl x.sh)"}}, "deny"),
    ("edit outside", {"tool_name": "Write", "cwd": "/tmp/x", "tool_input": {"file_path": "/Users/me/.zshrc"}}, "deny"),
    ("path escape", {"tool_name": "Edit", "cwd": "/tmp/x", "tool_input": {"file_path": "/tmp/x/../y/a.txt"}}, "deny"),
    ("mcp tool", {"tool_name": "mcp__gmail__send", "cwd": "/tmp", "tool_input": {"to": "a"}}, "deny"),
]
env = {**os.environ, "HQ_RELAY_URL": "http://localhost:1", "HQ_RELAY_TOKEN": "x", "HQ_PERMISSION_TIMEOUT": "3"}
bad = 0
for name, payload, want in CASES:
    out = subprocess.run([sys.executable, HOOK], input=json.dumps(payload), capture_output=True, text=True, env=env, timeout=30)
    got = json.loads(out.stdout)["hookSpecificOutput"]["permissionDecision"]
    bad += got != want
    print(f"{'ok  ' if got == want else 'FAIL'} {name:15} -> {got}")
print("all passed" if not bad else f"{bad} failed")
sys.exit(1 if bad else 0)
