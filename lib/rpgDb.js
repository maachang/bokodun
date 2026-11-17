/**
 * RPG の DB（data/rpg.db）の初期化 (lib/rpgDb.js)
 * schema/users.sql（ユーザー）と schema/rpg.sql（冒険者・セーブ履歴・設定）を、初回に 1 度だけ実行する（CREATE IF NOT EXISTS）。
 */
// 注意: $loadLib で読まれる lib は、素の CommonJS（require）。$loadLib・$db・$request などの、ハンドラーに注入される変数は、ここでは使えない。
const fs = require('fs');
const path = require('path');
const FW_HOME = process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang';
const dbWrapper = require(path.join(FW_HOME, 'src/db.js'));   // $db と同じモジュール（require のキャッシュで、同じ接続を共有する）

/** フレームワークの modules/ のモジュールを読む（例: fw('session.js')、fw('password.js')）。auth/ 配下は、自動で探す */
function fw(name) {
    for (const sub of ['', 'auth/']) {
        const f = path.join(FW_HOME, 'modules', sub + name);
        if (fs.existsSync(f)) return require(f);
    }
    throw new Error(`framework module not found: ${name}`);
}

const FILES = ['users.sql', 'rpg.sql'];
const initialized = new Set();

function ensureTables(dbPath) {
    if (initialized.has(dbPath)) return;
    for (const f of FILES) dbWrapper.exec(fs.readFileSync(path.join(process.cwd(), 'schema', f), 'utf8'), dbPath);
    initialized.add(dbPath);
}

module.exports = { ensureTables, dbWrapper, fw };
