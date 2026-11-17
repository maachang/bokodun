-- ユーザー（ログイン用のアカウント）。保存先: SQLite3（data/rpg.db）。
-- 匿名ユーザーはなし。原則ユーザー登録（メールアドレス＋パスワード）。冒険者・セーブ履歴・設定の user_id は、この users.id を使う。
-- パスワードは、保存しない。password.js（PBKDF2-HMAC-SHA256）の { salt, hash, iterations } を、列に分けて持つ。
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,          -- crypto.randomUUID()
  email      TEXT NOT NULL UNIQUE,      -- 小文字・前後の空白なしにして保存（ログインのキー）
  pw_salt    TEXT NOT NULL,
  pw_hash    TEXT NOT NULL,
  pw_iter    INTEGER NOT NULL,
  -- パスワードの再設定に使う「キーワード」（登録のときに、必須で決める）。パスワードと同じく、ハッシュ化して持つ。メールを送らないため、これで本人を確かめる。
  kw_salt    TEXT,
  kw_hash    TEXT,
  kw_iter    INTEGER,
  kw_fails   INTEGER NOT NULL DEFAULT 0,        -- キーワードを、連続して間違えた回数（3 回で、再設定を凍結。正しければ 0 に戻る）
  reset_frozen_until INTEGER NOT NULL DEFAULT 0, -- 再設定の凍結が解ける時刻（エポックミリ秒。凍結中でも、パスワードでのログインはできる）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
