-- ユーザー（ログイン用のアカウント）。保存先: SQLite3（data/rpg.db）。
-- 匿名ユーザーはなし。原則ユーザー登録（メールアドレス＋パスワード）。冒険者・セーブ履歴・設定の user_id は、この users.id を使う。
-- パスワードは、保存しない。password.js（PBKDF2-HMAC-SHA256）の { salt, hash, iterations } を、列に分けて持つ。
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,          -- crypto.randomUUID()
  email      TEXT NOT NULL UNIQUE,      -- 小文字・前後の空白なしにして保存（ログインのキー）
  pw_salt    TEXT NOT NULL,
  pw_hash    TEXT NOT NULL,
  pw_iter    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
