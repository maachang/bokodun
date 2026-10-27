-- RPG キャラクター関連テーブル（仕様: docs/character-spec.md）
-- 保存先: SQLite3（data/rpg.db を想定）
-- 全テーブルに user_id を持たせ、$db.forUser でスコープ強制してアクセスする（BOLA/IDOR対策）。
-- user_id は当面、匿名セッション（session.js）で発行した ID を使う。

-- キャラクター（1ユーザー1キャラ想定、将来の複数キャラにも対応できる形）
CREATE TABLE IF NOT EXISTS characters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  race        TEXT    NOT NULL,            -- human / elf / dwarf / demon / fairy / beast / dragon / halfling
  status      TEXT    NOT NULL,            -- creating(作成中) / confirmed(確定済み・やり直し不可)
  -- 作成中の乱数（確定前のみ使用。各 1〜12.5）
  roll_a      REAL,
  roll_b      REAL,
  roll_c      REAL,
  roll_d      REAL,
  bonus_total INTEGER,                     -- 決まったボーナス値（最大9）
  -- 基礎能力値（確定後は固定。装備補正は含めない）
  dex         INTEGER,                     -- 器用度
  agi         INTEGER,                     -- 敏捷度
  str         INTEGER,                     -- 筋力
  vit         INTEGER,                     -- 生命力
  intel       INTEGER,                     -- 知力
  mnd         INTEGER,                     -- 精神力
  primary_job TEXT,                        -- 第一職業（戦闘職）
  exp_stock   INTEGER NOT NULL DEFAULT 0,  -- 未割り振りの経験値
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters (user_id);

-- 職業ごとのレベル（戦闘職・非戦闘職共通）
CREATE TABLE IF NOT EXISTS character_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,           -- forUser のスコープ用
  character_id INTEGER NOT NULL,
  job_id       TEXT    NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1, -- 1〜99
  UNIQUE (character_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_character_jobs_user ON character_jobs (user_id);
