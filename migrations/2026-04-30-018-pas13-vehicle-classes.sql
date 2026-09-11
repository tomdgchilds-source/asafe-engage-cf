-- applied-historically: yes
-- source: POST /api/admin/apply-pas13-classes-schema (worker/index.ts, first commit b23a776, removed 2026-09-11)
-- Admin-editable PAS 13 vehicle-class thresholds (T1..T4). The four default
-- rows mirror PAS13_VEHICLE_CLASS_TABLE in shared/pas13Rules.ts; ON CONFLICT
-- DO NOTHING keeps any admin edits intact on re-run.

CREATE TABLE IF NOT EXISTS pas13_vehicle_classes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  class_code varchar NOT NULL UNIQUE,
  mass_min_kg integer NOT NULL DEFAULT 0,
  mass_max_kg integer,
  speed_min_kmh real NOT NULL DEFAULT 0,
  speed_max_kmh real,
  description text NOT NULL DEFAULT '',
  updated_at timestamp DEFAULT now(),
  updated_by varchar
);

INSERT INTO pas13_vehicle_classes (class_code, mass_min_kg, mass_max_kg, speed_min_kmh, speed_max_kmh, description, updated_by)
VALUES ('T1', 0, 1500, 0, 6, 'Manual / pedestrian-operated trucks (≤1 500 kg, ≤6 km/h)', 'seed')
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO pas13_vehicle_classes (class_code, mass_min_kg, mass_max_kg, speed_min_kmh, speed_max_kmh, description, updated_by)
VALUES ('T2', 1501, 3500, 0, 10, 'Light powered trucks (≤3 500 kg, ≤10 km/h)', 'seed')
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO pas13_vehicle_classes (class_code, mass_min_kg, mass_max_kg, speed_min_kmh, speed_max_kmh, description, updated_by)
VALUES ('T3', 3501, 7500, 0, 15, 'Counterbalance forklifts (≤7 500 kg, ≤15 km/h)', 'seed')
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO pas13_vehicle_classes (class_code, mass_min_kg, mass_max_kg, speed_min_kmh, speed_max_kmh, description, updated_by)
VALUES ('T4', 7501, NULL, 0, NULL, 'Heavy industrial vehicles / reach trucks (>7 500 kg or >15 km/h)', 'seed')
ON CONFLICT (class_code) DO NOTHING;
