"""
WSGI entry point for production hosting (e.g. PythonAnywhere).

PythonAnywhere imports an `application` callable from this file. The Flask
dev server in server.py (the `if __name__ == '__main__'` block) does NOT run
under WSGI, so we call init_db() here to make sure the tables exist.

IMPORTANT: server.py reads GM_PASSWORD from the environment AT IMPORT TIME.
If you want password-protected editing on a public host, set the env var
BEFORE importing server, i.e. uncomment and edit the line below.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- Set a GM password for public hosting (recommended) --------------------
# Without this, ANYONE who can reach the site can edit all your data.
# os.environ['GM_PASSWORD'] = 'change-me-to-something-only-the-GM-knows'

from server import app as application, init_db  # noqa: E402

init_db()
