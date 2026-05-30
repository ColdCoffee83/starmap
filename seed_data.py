"""Populate starmap.db with sample data for testing.
Run after server.py has been started at least once (so the DB exists),
or just run this directly — it will create the DB if missing.

   python seed_data.py
"""
import os
import random
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'starmap.db')

CLASS_WEIGHTS = [('M', 50), ('K', 15), ('G', 12), ('F', 8), ('A', 5), ('B', 2), ('O', 1)]

NAMES = [
    'Tau Ceti', 'Vela Prime', 'Korr Station', 'Deepwater', 'Hadrian',
    'Bastion', 'Niven', 'Asher', 'Greenfall', 'Ironwell', 'Pyre',
    'Thalassa', 'Outpost Theta', 'Yellowstone', 'Cinder', 'Cold Anchor',
    'Veridian', 'Halcyon', 'Lumen', 'Brackish', 'Kestrel', 'Argo',
    'Pale Cradle', 'Marrow', 'Steeple', 'Black Mire', 'Tradepoint Sigma',
    'Quill', 'Marrowstone', 'Hearth', 'Saltwind', 'Drifter',
]

FLAVOR_NOTES = [
    'Frontier outpost; loose alliance with the Korr Compact.',
    'Garden world. Currently in 17th year of religious schism.',
    'Major shipyard. Heavy customs. Avoid undeclared cargo.',
    'Pirate harbor disguised as a free port.',
    'Ancient ruins on second moon. Several expeditions lost.',
    'Population in domes. Surface is corrosive.',
    'Tidally locked. Habitable strip only.',
    'Failed colony. Salvage operations active.',
    'Heavy gravity. Locals are stocky and dangerous in melee.',
    'Recently re-contacted after 200-year isolation.',
]


def romanish(n):
    return ['I', 'II', 'III', 'IV', 'V'][n - 1] if 1 <= n <= 5 else str(n)


def weighted(items):
    total = sum(w for _, w in items)
    r = random.uniform(0, total)
    acc = 0
    for v, w in items:
        acc += w
        if r <= acc:
            return v
    return items[-1][0]


def ensure_schema(conn):
    """Mirror schema in server.py so seed can run standalone."""
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS systems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
            name TEXT DEFAULT '', system_code TEXT DEFAULT '',
            notes TEXT DEFAULT '', mouse_over TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS stars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            system_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            star_class TEXT NOT NULL DEFAULT 'G2',
            mass TEXT DEFAULT '', magnetic_field TEXT DEFAULT '',
            flare_frequency TEXT DEFAULT '', luminosity TEXT DEFAULT '',
            extra TEXT DEFAULT '', notes TEXT DEFAULT '',
            FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS planets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            star_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            name TEXT DEFAULT '', orbital_distance TEXT DEFAULT '',
            mass TEXT DEFAULT '', radius TEXT DEFAULT '',
            atmosphere TEXT DEFAULT '', hydrosphere TEXT DEFAULT '',
            sophont_artifacts TEXT DEFAULT '', notes TEXT DEFAULT '',
            FOREIGN KEY (star_id) REFERENCES stars(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS moons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            planet_id INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0,
            name TEXT DEFAULT '', orbital_distance TEXT DEFAULT '',
            mass TEXT DEFAULT '', radius TEXT DEFAULT '',
            atmosphere TEXT DEFAULT '', hydrosphere TEXT DEFAULT '',
            sophont_artifacts TEXT DEFAULT '', notes TEXT DEFAULT '',
            FOREIGN KEY (planet_id) REFERENCES planets(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS globals (
            key TEXT PRIMARY KEY, value TEXT
        );
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_x', '0');
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_y', '0');
        INSERT OR IGNORE INTO globals (key, value) VALUES ('ship_z', '0');
    ''')


def main():
    random.seed(42)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA foreign_keys = ON')
    ensure_schema(conn)
    conn.executescript('DELETE FROM moons; DELETE FROM planets; DELETE FROM stars; DELETE FROM systems;')

    names = list(NAMES)
    random.shuffle(names)
    name_iter = iter(names)
    used = set()
    count = 0

    for _ in range(45):
        for _try in range(20):
            x = round(random.uniform(-22, 22) + random.uniform(-0.3, 0.3), 1)
            y = round(random.uniform(-22, 22) + random.uniform(-0.3, 0.3), 1)
            z = round(random.uniform(-12, 12), 1)
            key = (x, y)
            if key not in used:
                used.add(key)
                break
        else:
            continue

        name = next(name_iter, '') if random.random() > 0.35 else ''
        sys_code = f'{random.choice("ABCDEF")}{random.randint(100, 899)}-{random.randint(1, 9)}' if name else ''
        mouse_over = random.choice(FLAVOR_NOTES) if name and random.random() > 0.4 else ''

        cur = conn.execute(
            'INSERT INTO systems (x, y, z, name, system_code, mouse_over) VALUES (?, ?, ?, ?, ?, ?)',
            (x, y, z, name, sys_code, mouse_over)
        )
        sid = cur.lastrowid
        count += 1

        n_stars = random.choices([1, 2, 3, 4], weights=[60, 25, 12, 3])[0]
        for i in range(n_stars):
            klass = weighted(CLASS_WEIGHTS)
            sub = random.randint(0, 9)
            cur = conn.execute(
                '''INSERT INTO stars (system_id, display_order, star_class, mass, luminosity, magnetic_field, flare_frequency)
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (sid, i, f'{klass}{sub}',
                 f'{round(random.uniform(0.1, 4.0), 2)} Msun',
                 f'{round(random.uniform(0.001, 50), 3)} Lsun',
                 random.choice(['weak', 'moderate', 'strong', 'very strong']),
                 random.choice(['rare', 'occasional', 'frequent', 'constant']))
            )
            star_id = cur.lastrowid

            for j in range(random.randint(0, 5)):
                pname = f'{name or "P"}-{i + 1}{chr(ord("a") + j)}' if name else ''
                cur = conn.execute(
                    '''INSERT INTO planets (star_id, display_order, name,
                       orbital_distance, mass, radius, atmosphere, hydrosphere)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                    (star_id, j, pname,
                     f'{round(random.uniform(0.1, 30), 2)} AU',
                     f'{round(random.uniform(0.01, 20), 2)} Mearth',
                     f'{round(random.uniform(0.3, 5), 2)} Rearth',
                     random.choice(['none', 'trace', 'thin', 'standard', 'dense', 'corrosive']),
                     random.choice(['none', 'trace', '10%', '40%', '70%', '95%']))
                )
                planet_id = cur.lastrowid

                # Larger / outer worlds get a moon or three
                for k in range(random.choices([0, 1, 2, 3], weights=[55, 25, 13, 7])[0]):
                    mname = f'{pname}-{romanish(k + 1)}' if pname else ''
                    conn.execute(
                        '''INSERT INTO moons (planet_id, display_order, name,
                           orbital_distance, mass, radius, atmosphere, hydrosphere)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                        (planet_id, k, mname,
                         f'{round(random.uniform(0.001, 0.05), 4)} AU',
                         f'{round(random.uniform(0.001, 0.3), 3)} Mearth',
                         f'{round(random.uniform(0.05, 0.5), 2)} Rearth',
                         random.choice(['none', 'none', 'trace', 'thin']),
                         random.choice(['none', 'none', 'trace', '10%']))
                    )

    conn.commit()
    conn.close()
    print(f'Seeded {count} systems at {DB_PATH}')


if __name__ == '__main__':
    main()
