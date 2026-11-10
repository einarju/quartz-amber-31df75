# HQ Live relay

The message pipe behind the dashboard's **Live** tab. No AI, no dependencies, no API
credits: jobs post what they are doing, the tab listens on one stream, and taps on
decision cards go back to the job that is waiting.

```
jobs (PC, Mac, Hetzner, Claude Code hook) ──POST──▶ relay (Hetzner) ──SSE──▶ Live tab
                         ◀──── answer ────────────────────────────── tap
```

## Where it runs

- Hetzner box, `hq-relay.service`, Node 22, loopback `127.0.0.1:8095`, own user `hqrelay`,
  `MemoryMax=96M`, lowest CPU priority. State: `/var/lib/hq-relay/state.json`.
- Public at `https://hq.167-233-29-228.sslip.io` through its own Caddy block
  (`Caddyfile.snippet`); the `live.bassvision.store` block is untouched.
- Token: `/etc/hq-relay/token` on the server, `~/.config/hq-live.json` on each machine
  (`{"url", "token", "machine"}`), pasted once into the Live tab (stays in that browser).

Deploy or update: copy this folder to the box and run `bash deploy.sh` as root. Safe to
re-run; the token and the Caddy block are created once.

## Talking to it from a job

```python
from hq_live import job, item, event, ask      # relay/client/hq_live.py, stdlib only

job("pack-2026-11-09", biz=2, title="Daily pack", stages=["Panels", "Kling", "Loop gate", "4K", "Publish"], stage=1)
item("pack-2026-11-09", "c3", status="done", thumb=THUMB_URL, media=CLIP_URL)
event("clip 3 rendered", biz=2, job="pack-2026-11-09")
choice = ask("Clip 4: seam at 0:05", ["redo", "keep", "drop"], biz=2, media=CLIP_URL, default="keep")
```

`job`, `item` and `event` never raise and give up after 3 s, so a dead relay cannot break a
render. `ask` blocks until the tap (or `timeout`, then returns `default`).

CLI: `hq_live.py event "text" --biz 2`, `hq_live.py ask "Title" redo,keep,drop --media URL`.

## Pieces

| File | What |
|---|---|
| `server.mjs` | the relay |
| `hq-relay.service`, `Caddyfile.snippet`, `deploy.sh` | server install |
| `client/hq_live.py` | client for any job |
| `client/demo_pack.py` | fake daily-pack run with real public clips, nothing billed |
| `client/claude_code_hook.py` | copy of `~/.claude/hooks/hq_live_hook.py` (PostToolUse): files Claude edits glow in the tab. Sends paths and Bash descriptions only, never command text |
