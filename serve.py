#!/usr/bin/env python3
"""
Simple development server for physics-sims.

- Serves the repo root over HTTP (required for JSON/texture fetches)
- Optional: opens a browser tab to the Solar System or GR demo

Usage examples:
  python3 serve.py --port 8000 --solar
  python3 serve.py --port 8080 --gr
  python3 serve.py --open Solar-System/index.html
"""
from __future__ import annotations

import argparse
import contextlib
import os
import socket
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial


class DevHandler(SimpleHTTPRequestHandler):
    """HTTP handler with dev-friendly headers (no-cache)."""

    def end_headers(self) -> None:  # type: ignore[override]
        # Prevent caching to make iteration easier
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def find_free_port(host: str, port: int) -> int:
    if port != 0:
        return port
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def run_server(host: str = "127.0.0.1", port: int = 8000, open_path: str | None = None) -> int:
    """Start the dev server and optionally open a relative path."""
    base_dir = os.path.dirname(os.path.abspath(__file__))

    port = find_free_port(host, port)

    handler = partial(DevHandler, directory=base_dir)
    httpd = ThreadingHTTPServer((host, port), handler)

    url = f"http://{host}:{port}/"
    print(f"Serving {base_dir} at {url}")

    if open_path:
        open_url = url + open_path.lstrip("/")
        print(f"Opening: {open_url}")
        threading.Timer(0.4, lambda: webbrowser.open(open_url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down…")
    finally:
        httpd.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve physics-sims locally")
    parser.add_argument("--host", default="127.0.0.1", help="Host/IP to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000; use 0 for random)")
    parser.add_argument("--open", default=None, help="Relative path to open after start (e.g., Solar-System/index.html)")
    parser.add_argument("--solar", action="store_true", help="Open Solar-System/index.html after start")
    parser.add_argument("--gr", action="store_true", help="Open general-relativity.html after start")

    args = parser.parse_args()

    # Resolve which page to open
    open_path: str | None = None
    if args.solar:
        open_path = "Solar-System/index.html"
    elif args.gr:
        open_path = "general-relativity.html"
    elif args.open:
        open_path = args.open

    return run_server(args.host, args.port, open_path)


if __name__ == "__main__":
    sys.exit(main())
