-- ログイン・パスワード再設定・アカウント操作の、連続失敗の記録（ブルートフォース・クレデンシャルスタッフィング対策）。
-- テーブルは、maachang の modules/auth/lockout.js が、createLockoutManager({ dbPath }) のときに自分で作る（これは、参照用の定義）。
-- key は「スコープ:識別子（小文字）」。スコープ: login（メールアドレス）・login-ip・reset・reset-ip・account（ユーザー ID）。
CREATE TABLE IF NOT EXISTS auth_lockout (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  first_failed_at INTEGER NOT NULL,
  last_failed_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_lockout_locked ON auth_lockout(locked_until);
