"""
Star Map server. Run: python server.py  →  http://localhost:5000

Auth model:
  - Reading is open (anyone can GET).
  - Moving the ship is open (PUT /api/ship).
  - All other writes require the GM password (if GM_PASSWORD env var is set).
    Set it like:    set GM_PASSWORD=hunter2    (PowerShell: $env:GM_PASSWORD = 'hunter2')
    If unset, all edits are open (single-user / trusted-LAN mode).
"""
import os
import sqlite3
from flask import Flask, request, jsonify, send_from_directory, abort

app = Flask(__name__, static_folder='static', static_url_path='')
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'starmap.db')
GM_PASSWORD = os.environ.get('GM_PASSWORD', '')

CLASS_ORDER = {'O': 7, 'B': 6, 'A': 5, 'F': 4, 'G': 3, 'K': 2, 'M': 1}

SYSTEM_FIELDS = {'name', 'system_code', 'notes', 'mouse_over', 'x', 'y', 'z'}
STAR_FIELDS   = {'star_class', 'mass', 'magnetic_field', 'flare_frequency',
                 'luminosity', 'extra', 'notes', 'display_order'}
PLANET_FIELDS = {'name', 'orbital_distance', 'mass', 'radius', 'atmosphere',
                 'hydrosphere', 'sophont_artifacts', 'notes', 'display_order'}
MOON_FIELDS   = PLANET_FIELDS  # moons carry the same physical/notes fields as planets

# Fields a non-GM player is allowed to edit on a system (their own travel notes).
PLAYER_SYSTEM_FIELDS = {'mouse_over'}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS systems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            x REAL NOT NULL,
            y REAL NOT NULL,
            z REAL NOT NULL,
            name TEXT DEFAULT '',
            system_code TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            mouse_over TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS stars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            star_class TEXT NOT NULL DEFAULT 'G2',
            mass TEXT DEFAULT '',
            magnetic_field TEXT DEFAULT '',
            flare_frequency TEXT DEFAULT '',
            luminosity TEXT DEFAULT '',
            extra TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS planets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            star_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            name TEXT DEFAULT '',
            orbital_distance TEXT DEFAULT '',
            mass TEXT DEFAULT '',
            radius TEXT DEFAULT '',
            atmosphere TEXT DEFAULT '',
            hydrosphere TEXT DEFAULT '',
            sophont_artifacts TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (star_id) REFERENCES stars(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS moons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            planet_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            name TEXT DEFAULT '',
            orbital_distance TEXT DEFAULT '',
            mass TEXT DEFAULT '',
            radius TEXT DEFAULT '',
            atmosphere TEXT DEFAULT '',
            hydrosphere TEXT DEFAULT '',
            sophont_artifacts TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (planet_id) REFERENCES planets(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS globals (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_x', '0');
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_y', '0');
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_z', '0');
    ''')
    conn.commit()
    conn.close()


def require_gm():
    if GM_PASSWORD and request.headers.get('X-GM-Password', '') != GM_PASSWORD:
        abort(401, description='GM password required')


def star_size_rank(c):
    return CLASS_ORDER.get((c or '')[:1].upper(), 0)


def update_row(table, row_id, allowed, data):
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return
    sets = ', '.join(f'{k} = ?' for k in fields)
    values = list(fields.values()) + [row_id]
    conn = get_db()
    conn.execute(f'UPDATE {table} SET {sets} WHERE id = ?', values)
    conn.commit()
    conn.close()


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/config')
def config():
    return jsonify({'gm_password_required': bool(GM_PASSWORD)})


@app.route('/api/systems')
def list_systems():
    conn = get_db()
    systems = conn.execute('SELECT * FROM systems').fetchall()
    result = []
    for s in systems:
        stars = conn.execute(
            'SELECT star_class FROM stars WHERE system_id = ?', (s['id'],)
        ).fetchall()
        primary = max((r['star_class'] for r in stars),
                      key=star_size_rank, default='G2')
        result.append({
            'id': s['id'],
            'x': s['x'], 'y': s['y'], 'z': s['z'],
            'name': s['name'],
            'mouse_over': s['mouse_over'],
            'primary_class': primary,
            'star_count': len(stars),
        })
    conn.close()
    return jsonify(result)


@app.route('/api/system/<int:sid>')
def get_system(sid):
    conn = get_db()
    sys = conn.execute('SELECT * FROM systems WHERE id = ?', (sid,)).fetchone()
    if not sys:
        abort(404)
    out = dict(sys)
    stars = conn.execute(
        'SELECT * FROM stars WHERE system_id = ? ORDER BY display_order, id',
        (sid,)
    ).fetchall()
    out['stars'] = []
    for star in stars:
        s = dict(star)
        planets = conn.execute(
            'SELECT * FROM planets WHERE star_id = ? ORDER BY display_order, id',
            (star['id'],)
        ).fetchall()
        s['planets'] = []
        for planet in planets:
            p = dict(planet)
            moons = conn.execute(
                'SELECT * FROM moons WHERE planet_id = ? ORDER BY display_order, id',
                (planet['id'],)
            ).fetchall()
            p['moons'] = [dict(m) for m in moons]
            s['planets'].append(p)
        out['stars'].append(s)
    conn.close()
    return jsonify(out)


@app.route('/api/system', methods=['POST'])
def create_system():
    require_gm()
    d = request.get_json() or {}
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO systems (x, y, z, name) VALUES (?, ?, ?, ?)',
        (float(d.get('x', 0)), float(d.get('y', 0)), float(d.get('z', 0)),
         d.get('name', ''))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': new_id})


@app.route('/api/system/<int:sid>', methods=['PATCH'])
def update_system(sid):
    data = request.get_json() or {}
    # Players may edit their own travel notes (mouse_over) without GM rights.
    # Any other field touches GM-owned data, so require the password.
    touches_gm_fields = (set(data) & SYSTEM_FIELDS) - PLAYER_SYSTEM_FIELDS
    if touches_gm_fields:
        require_gm()
    update_row('systems', sid, SYSTEM_FIELDS, data)
    return jsonify({'ok': True})


@app.route('/api/system/<int:sid>', methods=['DELETE'])
def delete_system(sid):
    require_gm()
    conn = get_db()
    conn.execute('DELETE FROM systems WHERE id = ?', (sid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/star', methods=['POST'])
def create_star():
    require_gm()
    d = request.get_json() or {}
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO stars (system_id, star_class, display_order) VALUES (?, ?, ?)',
        (int(d['system_id']), d.get('star_class', 'G2'),
         int(d.get('display_order', 0)))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': new_id})


@app.route('/api/star/<int:star_id>', methods=['PATCH'])
def update_star(star_id):
    require_gm()
    update_row('stars', star_id, STAR_FIELDS, request.get_json() or {})
    return jsonify({'ok': True})


@app.route('/api/star/<int:star_id>', methods=['DELETE'])
def delete_star(star_id):
    require_gm()
    conn = get_db()
    conn.execute('DELETE FROM stars WHERE id = ?', (star_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/planet', methods=['POST'])
def create_planet():
    require_gm()
    d = request.get_json() or {}
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO planets (star_id, name, display_order) VALUES (?, ?, ?)',
        (int(d['star_id']), d.get('name', ''),
         int(d.get('display_order', 0)))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': new_id})


@app.route('/api/planet/<int:pid>', methods=['PATCH'])
def update_planet(pid):
    require_gm()
    update_row('planets', pid, PLANET_FIELDS, request.get_json() or {})
    return jsonify({'ok': True})


@app.route('/api/planet/<int:pid>', methods=['DELETE'])
def delete_planet(pid):
    require_gm()
    conn = get_db()
    conn.execute('DELETE FROM planets WHERE id = ?', (pid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/moon', methods=['POST'])
def create_moon():
    require_gm()
    d = request.get_json() or {}
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO moons (planet_id, name, display_order) VALUES (?, ?, ?)',
        (int(d['planet_id']), d.get('name', ''),
         int(d.get('display_order', 0)))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': new_id})


@app.route('/api/moon/<int:mid>', methods=['PATCH'])
def update_moon(mid):
    require_gm()
    update_row('moons', mid, MOON_FIELDS, request.get_json() or {})
    return jsonify({'ok': True})


@app.route('/api/moon/<int:mid>', methods=['DELETE'])
def delete_moon(mid):
    require_gm()
    conn = get_db()
    conn.execute('DELETE FROM moons WHERE id = ?', (mid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/ship')
def get_ship():
    conn = get_db()
    rows = conn.execute(
        "SELECT key, value FROM globals WHERE key IN ('ship_x','ship_y','ship_z')"
    ).fetchall()
    conn.close()
    g = {r['key']: float(r['value']) for r in rows}
    return jsonify({'x': g['ship_x'], 'y': g['ship_y'], 'z': g['ship_z']})


@app.route('/api/ship', methods=['PUT'])
def update_ship():
    d = request.get_json() or {}
    conn = get_db()
    for axis in ('x', 'y', 'z'):
        if axis in d:
            conn.execute(
                "UPDATE globals SET value = ? WHERE key = ?",
                (str(float(d[axis])), f'ship_{axis}')
            )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/import', methods=['POST'])
def bulk_import():
    """Accepts a JSON array of systems, each optionally with stars/planets.
    Replaces all current data."""
    require_gm()
    data = request.get_json() or []
    conn = get_db()
    conn.executescript('DELETE FROM moons; DELETE FROM planets; DELETE FROM stars; DELETE FROM systems;')
    for sys in data:
        cur = conn.execute(
            'INSERT INTO systems (x, y, z, name, system_code, notes, mouse_over) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (float(sys['x']), float(sys['y']), float(sys['z']),
             sys.get('name', ''), sys.get('system_code', ''),
             sys.get('notes', ''), sys.get('mouse_over', ''))
        )
        sid = cur.lastrowid
        for i, star in enumerate(sys.get('stars', [])):
            cur = conn.execute(
                '''INSERT INTO stars (system_id, display_order, star_class, mass,
                   magnetic_field, flare_frequency, luminosity, extra, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (sid, i, star.get('star_class', 'G2'),
                 star.get('mass', ''), star.get('magnetic_field', ''),
                 star.get('flare_frequency', ''), star.get('luminosity', ''),
                 star.get('extra', ''), star.get('notes', ''))
            )
            star_id = cur.lastrowid
            for j, planet in enumerate(star.get('planets', [])):
                cur = conn.execute(
                    '''INSERT INTO planets (star_id, display_order, name,
                       orbital_distance, mass, radius, atmosphere, hydrosphere,
                       sophont_artifacts, notes)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (star_id, j, planet.get('name', ''),
                     planet.get('orbital_distance', ''), planet.get('mass', ''),
                     planet.get('radius', ''), planet.get('atmosphere', ''),
                     planet.get('hydrosphere', ''),
                     planet.get('sophont_artifacts', ''),
                     planet.get('notes', ''))
                )
                planet_id = cur.lastrowid
                for k, moon in enumerate(planet.get('moons', [])):
                    conn.execute(
                        '''INSERT INTO moons (planet_id, display_order, name,
                           orbital_distance, mass, radius, atmosphere, hydrosphere,
                           sophont_artifacts, notes)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                        (planet_id, k, moon.get('name', ''),
                         moon.get('orbital_distance', ''), moon.get('mass', ''),
                         moon.get('radius', ''), moon.get('atmosphere', ''),
                         moon.get('hydrosphere', ''),
                         moon.get('sophont_artifacts', ''),
                         moon.get('notes', ''))
                    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'imported': len(data)})


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
