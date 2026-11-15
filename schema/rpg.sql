-- RPG キャラクター関連テーブル（仕様: docs/character-spec.md 9 章）
-- 保存先: SQLite3（data/rpg.db を想定）
-- 全テーブルに user_id を持たせ、$db.forUser でスコープ強制してアクセスする（BOLA/IDOR対策）。
-- user_id は当面、匿名セッション（session.js）で発行した ID を使う。
--
-- 方針: 冒険者の中身は JSON（data 列）で持つ。仕様（武器・魔法・敵・数値）が暫定の間は、項目を足しても表を変えずに済むため。
--       検索・管理に要るものだけ、別の列に出す（level・guild_id）。JSON の中身は validates/character.js で検証する。
--       冒険者の人数（1 ユーザー 1 冒険者）は、アプリ側の制限。あとで複数にできるよう、表には UNIQUE を付けない。

-- 冒険者（現在のデータ）
CREATE TABLE IF NOT EXISTS characters (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'confirmed')),   -- creating(作成中) / confirmed(確定済み・やり直し不可)
  schema_version INTEGER NOT NULL DEFAULT 1,       -- data の版。読み込み時に、古ければ lib/ の移行関数で新しい形に直す
  rev            INTEGER NOT NULL DEFAULT 1,       -- 保存のたびに +1。保存時に、読み込んだ rev と違えば断る（2 つのタブでの上書き事故を防ぐ）
  data           TEXT    NOT NULL CHECK (json_valid(data)),   -- 冒険者の中身（JSON）。構成は docs/character-spec.md 9 章
  level          INTEGER NOT NULL DEFAULT 1,       -- 第一職業のレベル（検索・管理用。data と同じ値を保つ）
  guild_id       TEXT,                             -- 最後にセーブした冒険者ギルド（復活・つづきからの場所）
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters (user_id);

-- セーブの履歴（直近 5 回分）。巻き戻しと、問い合わせの調査用。
-- 保存のたびに 1 行足し、同じ冒険者の古い行を、5 件を超えた分だけ消す（保存と同じトランザクションの中で行う）。
CREATE TABLE IF NOT EXISTS character_saves (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL,                 -- forUser のスコープ用
  character_id   INTEGER NOT NULL,
  rev            INTEGER NOT NULL,                 -- そのときの characters.rev
  schema_version INTEGER NOT NULL,
  data           TEXT    NOT NULL CHECK (json_valid(data)),
  saved_at       TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_character_saves_user ON character_saves (user_id);
CREATE INDEX IF NOT EXISTS idx_character_saves_char ON character_saves (character_id, saved_at);

-- ユーザーごとの設定（キー割り当て・音量など）。冒険者が複数になっても、共通にできるよう、冒険者とは別にする。
CREATE TABLE IF NOT EXISTS user_settings (
  user_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL
);
