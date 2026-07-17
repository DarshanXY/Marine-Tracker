# Operations — keeping the stack alive & auto-detecting

The Python engine is a dev server; if it was started inside another tool's
terminal it dies when that session ends. That is why it "went offline after one
detection". These scripts make the stack **self-sustaining and owned by you**.

## TL;DR

| I want… | Run this |
|---|---|
| Everything up now, auto-restarting | double-click **`keep-alive.cmd`** (repo root) |
| It to survive reboots + auto-detect on a schedule | `powershell -ExecutionPolicy Bypass -File infra\install-scheduled-tasks.ps1` |
| Continuous detection sweeps by hand | `powershell -File infra\auto-detect.ps1` |
| To undo the scheduled tasks | `powershell -File infra\install-scheduled-tasks.ps1 -Uninstall` |

## `watchdog.ps1` — supervisor

Every 20 s it checks **PostgreSQL (5432), Redis (6379), engine (8000), backend
(3001)** and (with `-IncludeFrontend`) the **frontend (5173)**. A **down port** is
restarted detached. Logs → `infra/logs/watchdog.log`.

By default it does *not* kill a process that is merely slow to answer `/health` —
the engine is a single-worker uvicorn doing CPU-bound inference and legitimately
goes quiet during a long detection run, so killing on `/health` silence would
murder it mid-run. Add **`-HealthKill`** if you also want a hung (port-up but
unresponsive) process force-restarted after 3 checks.

```
powershell -ExecutionPolicy Bypass -File infra\watchdog.ps1 -IncludeFrontend
```

Run it in its **own** window (that is what `keep-alive.cmd` does) so it is not a
child of any editor/agent session.

## `auto-detect.ps1` — continuous detection

Calls `POST /api/pipeline/scheduled-run` every `-IntervalHours` (default **6h**).
Each sweep runs one live engine pass **per region** — real Sentinel-2 pixels →
FDI → CNN → DBSCAN → drift — and **persists** detections, hotspots and alerts, so
the dashboards stay fresh with zero clicks. This is the project's sanctioned
**external** scheduler (the architecture forbids an in-process one). 6h fits
Sentinel-2's ~5-day revisit while keeping drift forecasts and alerts current.

```
powershell -File infra\auto-detect.ps1 -IntervalHours 6           # loop
powershell -File infra\auto-detect.ps1 -RunOnce                   # single sweep
```

If `SCHEDULER_TOKEN` is set in `.env`, pass `-Token <value>`.

## `install-scheduled-tasks.ps1` — set-and-forget

Registers two hidden Windows Task Scheduler jobs under your account:

* **MPT-Watchdog** — starts at logon, keeps the stack alive.
* **MPT-AutoDetect** — a detection sweep every `-IntervalHours`.

No admin service, no console window, survives reboots. Start the watchdog
immediately after install with `Start-ScheduledTask -TaskName MPT-Watchdog`.

> These are optional conveniences. The manual `start-all.cmd` still works; the
> watchdog just adds the "don't make me restart it" guarantee.
