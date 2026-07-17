"""Clay GPU sidecar — keeps the ₹0 detection engine torch-free while giving it a
real-time second opinion.

The main engine (Python 3.14, onnxruntime + numpy, NO torch) cannot run Clay. This
tiny always-on service DOES: it loads the frozen Clay encoder once (GPU, ~4.8 GB)
and exposes /embed, which the engine calls during a scan to turn hotspot chips into
1024-d fingerprints. Warm, it's ~36 ms/chip — fast enough for live tier-2 re-scoring.
If this service is down, the engine simply skips Clay (MLP-only). Uses only the
stdlib HTTP server so it needs nothing beyond torch + numpy in the GPU env.

Run in the GPU env:
    conda run -n mpt-train python clay_service.py            # default port 8010
    conda run -n mpt-train python clay_service.py --port 8010
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

from ml.clay_embed import embed_chips, load_clay

STATE: dict = {}


def _load() -> None:
    import torch
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    mm, mean, std, waves = load_clay(dev)
    STATE.update(dev=dev, mm=mm, mean=mean, std=std, waves=waves,
                 name=torch.cuda.get_device_name(0) if dev.type == "cuda" else "CPU")


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/health"):
            self._json(200, {"ready": bool(STATE), "device": str(STATE.get("dev")), "gpu": STATE.get("name")})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self.path.startswith("/embed"):
            self._json(404, {"error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            chips = json.loads(self.rfile.read(n))["chips"]
            x = np.asarray(chips, dtype="float32")
            if x.ndim != 4 or x.shape[-1] != 5:
                self._json(400, {"error": "chips must be shape [N,64,64,5]"})
                return
            e = embed_chips(STATE["mm"], x, STATE["mean"], STATE["std"], STATE["waves"], STATE["dev"], bs=16)
            self._json(200, {"embeddings": e.astype("float32").tolist(), "count": int(len(e))})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)[:160]})

    def log_message(self, *args) -> None:  # silence per-request logging
        return


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8010)
    args = ap.parse_args()
    print("loading Clay encoder (4.8GB ckpt)…", flush=True)
    _load()
    print(f"Clay sidecar ready on {args.host}:{args.port} ({STATE.get('name')})", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
