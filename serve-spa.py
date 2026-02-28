#!/usr/bin/env python3
"""Simple SPA server with fallback to index.html for client-side routing."""

import http.server
import os

BUILD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def do_GET(self):
        # Try to serve the file directly
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            return super().do_GET()
        # Fallback to index.html for SPA routing
        self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", 8888), SPAHandler)
    print(f"Serving SPA from {BUILD_DIR} on http://0.0.0.0:8888")
    server.serve_forever()
