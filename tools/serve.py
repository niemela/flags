#!/usr/bin/env python3
"""Local dev server that mimics GitHub Pages for the flag browser.

The deploy artifact merges site/ at the root with data/ under /data/, so this
server presents the same layout locally: a request for /X resolves to
<repo>/site/X, and /data/X resolves to <repo>/data/X. Unknown paths return
site/404.html with a 404 status, matching how Pages handles deep links.

Usage:
    python3 tools/serve.py            # serves on http://localhost:8000/
    python3 tools/serve.py 8080       # custom port

Then open http://localhost:8000/ in a browser.
"""
import http.server
import os
import sys
import urllib.parse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_DIR = os.path.join(REPO_ROOT, "site")
DATA_DIR = os.path.join(REPO_ROOT, "data")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # `directory` is only a fallback — translate_path below routes between
        # the site/ and data/ trees explicitly.
        super().__init__(*args, directory=SITE_DIR, **kwargs)

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        p = urllib.parse.unquote(p)
        if p == "/data" or p.startswith("/data/"):
            rel = p[len("/data"):].lstrip("/")
            return os.path.join(DATA_DIR, rel)
        return os.path.join(SITE_DIR, p.lstrip("/"))

    def end_headers(self):
        # Fingerprinted assets (…?v=<hash>) are immutable: the URL changes when
        # the bytes change, so they can be cached indefinitely. Everything else
        # — HTML, app.js, flags.json — must revalidate so new hashes propagate.
        # Mirrors the intended production behaviour and prevents stale assets in
        # local dev. (GitHub Pages can't set headers, but its short max-age +
        # ETag combined with the changing URL achieves the same effect.)
        query = urllib.parse.urlsplit(self.path).query
        if "v" in urllib.parse.parse_qs(query):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        fs = self.translate_path(self.path)
        if os.path.isdir(fs):
            fs = os.path.join(fs, "index.html")
        if os.path.isfile(fs):
            return super().do_GET()
        # Unknown route -> serve 404.html with a 404 status, like GitHub Pages.
        self._serve_404()

    def _serve_404(self):
        page = os.path.join(SITE_DIR, "404.html")
        try:
            with open(page, "rb") as fh:
                body = fh.read()
        except OSError:
            body = b"404"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    addr = ("", port)
    httpd = http.server.ThreadingHTTPServer(addr, Handler)
    print(f"Serving  site/ from {SITE_DIR}")
    print(f"         data/ from {DATA_DIR}")
    print(f"Open     http://localhost:{port}/")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
