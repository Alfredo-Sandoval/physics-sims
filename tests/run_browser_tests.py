"""Run the in-browser Solar System tests headlessly and exit nonzero on failure.

Serves the repository root, opens tests/index.test.html in headless Chromium,
and waits for the page to set document.body.dataset.testStatus. An uncaught
page error (for example a module parse error) fails the run immediately
instead of waiting for the timeout.

Run from anywhere:  python3 tests/run_browser_tests.py
Requires Playwright: pip install playwright && playwright install chromium
"""

import functools
import http.server
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
TIMEOUT_S = 300
# Software WebGL so the suite runs the same on machines with or without a GPU.
CHROMIUM_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main() -> int:
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/tests/index.test.html"

    page_errors: list[str] = []
    status = ""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=CHROMIUM_ARGS)
            page = browser.new_page(viewport={"width": 1280, "height": 1000})
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(url)

            deadline = time.monotonic() + TIMEOUT_S
            while time.monotonic() < deadline and not page_errors:
                status = page.evaluate("document.body.dataset.testStatus || ''")
                if status in ("passed", "failed"):
                    break
                page.wait_for_timeout(250)

            print(page.inner_text("#testLog").strip())
            browser.close()
    finally:
        server.shutdown()

    for error in page_errors:
        print(f"PAGE ERROR: {error}", file=sys.stderr)
    if not status and not page_errors:
        print(f"TIMEOUT: no test status after {TIMEOUT_S}s", file=sys.stderr)
    return 0 if status == "passed" and not page_errors else 1


if __name__ == "__main__":
    sys.exit(main())
