CREATE TABLE gift_ideas_priority_v2 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  image_url TEXT
);

CREATE TABLE gift_reservations_priority_v2 (
  gift_id TEXT PRIMARY KEY REFERENCES gift_ideas_priority_v2(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO gift_ideas_priority_v2
  (id, title, url, price_cents, priority, note, active, created_at, updated_at, image_url)
SELECT id, title, url, price_cents, priority, note, active, created_at, updated_at, image_url
FROM gift_ideas;

INSERT INTO gift_reservations_priority_v2 (gift_id, token_hash, created_at)
SELECT gift_id, token_hash, created_at FROM gift_reservations;

DROP TABLE gift_reservations;
DROP INDEX IF EXISTS idx_gift_ideas_public_order;
DROP TABLE gift_ideas;

ALTER TABLE gift_ideas_priority_v2 RENAME TO gift_ideas;
ALTER TABLE gift_reservations_priority_v2 RENAME TO gift_reservations;

CREATE INDEX idx_gift_ideas_public_order
  ON gift_ideas (active, priority ASC, created_at DESC);
