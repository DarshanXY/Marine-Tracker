"""Scheduling helpers. The engine runs NO in-process scheduler (project rule) —
these are callables an EXTERNAL scheduler (infra/auto-detect.ps1, the Node
backend's /api/pipeline/scheduled-run, cron-job.org, GitHub Actions) drives.
"""
