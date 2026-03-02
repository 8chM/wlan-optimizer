#!/usr/bin/env python3
"""Simple SPA server with fallback to index.html and cache-control headers."""

import http.server
import os

BUILD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            return super().do_GET()
        # Fallback to index.html for SPA routing
        self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        # Immutable hashed assets can be cached forever
        if "/_app/immutable/" in self.path:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            # HTML and other files: never cache
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", 8888), SPAHandler)
    print(f"Serving SPA from {BUILD_DIR} on http://0.0.0.0:8888")
    server.serve_forever()
