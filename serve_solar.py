#!/usr/bin/env python3
"""
Serve the repository and open the Solar System simulation.

Usage:
  python3 serve_solar.py --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import argparse
from serve import run_server  # type: ignore


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve Solar System sim")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    return run_server(args.host, args.port, "Solar-System/index.html")


if __name__ == "__main__":
    raise SystemExit(main())
