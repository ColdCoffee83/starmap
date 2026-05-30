# Deploying to PythonAnywhere (free tier)

This gets the star map onto the public web so Rick and the players can reach it
at a URL like `https://yourname.pythonanywhere.com` — no install on their end.

The free tier is enough: one web app, enough CPU for a handful of players,
always-on (no spin-down). The only quirk is you must "reload" the web app after
code changes, and free apps need a renewal click every 3 months.

## 1. Push the code to GitHub first

(See the chat / project notes for the exact `git` commands. PythonAnywhere can
pull straight from a GitHub repo.)

## 2. Create the PythonAnywhere account

1. Sign up at https://www.pythonanywhere.com/registration/register/beginner/
2. From the **Dashboard**, open a **Bash console**.

## 3. Pull the code and seed the database

In the Bash console:

```bash
git clone https://github.com/<you>/starmap.git
cd starmap
pip install --user -r requirements.txt
python seed_data.py      # OR import your own data later
```

## 4. Create the web app

1. **Web** tab → **Add a new web app** → **Manual configuration** (NOT the
   "Flask" quickstart) → pick the Python 3.x that matches the console.
2. In the web app config page, set:
   - **Source code**: `/home/<you>/starmap`
   - **Working directory**: `/home/<you>/starmap`
3. Click the **WSGI configuration file** link. Delete the template contents and
   replace with:

   ```python
   import os, sys
   path = '/home/<you>/starmap'
   if path not in sys.path:
       sys.path.insert(0, path)

   # Set a GM password so randoms can't edit your universe:
   os.environ['GM_PASSWORD'] = 'pick-something-only-the-GM-knows'

   from server import app as application, init_db
   init_db()
   ```

   (This mirrors the included `wsgi.py`; PythonAnywhere uses its own WSGI file,
   so edit it here rather than relying on the repo copy.)
4. **Reload** the web app (green button). Visit your URL.

## 5. Hand the URL to the group

- Players: just the URL. They can pan/zoom, use the distance tool, move the
  ship, and leave mouse-over notes on systems.
- GM (Rick): same URL, plus type the GM password into the **GM** box in the
  sidebar to unlock editing.

## Updating later

After you push new code to GitHub:

```bash
cd ~/starmap && git pull
```

then **Reload** the web app on the Web tab.

## Notes / gotchas

- **Data lives in `starmap.db` on the server**, not in git (it's `.gitignore`d).
  GM edits made through the site persist there. If you re-run `seed_data.py`
  it **wipes** that and reloads samples — don't do that once Rick has real data.
- To load real data without losing it to a reseed, use the `POST /api/import`
  endpoint with your generated JSON instead of `seed_data.py`.
- Free-tier apps must be renewed every 3 months (one click on an email link).
