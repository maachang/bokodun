/**
 * 冒険者の保存・読み込み (lib/characterStore.js)
 *
 * 仕様: docs/character-spec.md 9 章。テーブル: schema/rpg.sql。検証: validates/character.js。
 *   - user_id は、呼び出し側が、セッションから決めた値を渡す（リクエストの ID は信用しない）。DB へは $db.forUser（スコープ強制）で触る。
 *   - 保存は、読み込んだ rev と現在の rev が違えば断る（2 つのタブでの上書き事故を防ぐ）。
 *   - 保存のたびに、履歴（character_saves）へ 1 行足し、同じ冒険者の古い行を、直近 5 回分だけ残して消す。同じトランザクションの中で行う。
 *   - data は、トップレベルの項目ごとに、既存へ上書きして持つ（送られなかった項目は、前の値のまま）。
 * 当面、1 ユーザー 1 冒険者（アプリ側の制限）。
 */
const rpgDb = require('./rpgDb.js');
const dbWrapper = rpgDb.dbWrapper;

const SCHEMA_VERSION = 1;
const KEEP_SAVES = 5;
const ensureTables = rpgDb.ensureTables;   // users・characters などのテーブルを、初回に作る

const now = () => new Date().toISOString();

// 保存用の行を、API の返り値の形にする
function toResult(row) {
    return { id: row.id, name: row.name, status: row.status, rev: row.rev, schemaVersion: row.schema_version, guildId: row.guild_id, data: JSON.parse(row.data) };
}

/** そのユーザーの冒険者を返す（なければ null） */
function load(userId, dbPath) {
    ensureTables(dbPath);
    const rows = dbWrapper.forUser(userId, { dbPath }).find('characters', '', [], dbPath);
    return rows.length ? toResult(rows[0]) : null;
}

/**
 * 保存する。body は、検証済みの { name, status, rev, data }。
 * 戻り値: { ok: true, rev } / { ok: false, conflict: true, rev: 現在の rev }
 */
function save(userId, body, dbPath) {
    ensureTables(dbPath);
    const userDb = dbWrapper.forUser(userId, { dbPath });
    return dbWrapper.transaction(() => {
        const rows = userDb.find('characters', '', [], dbPath);
        const t = now();
        const level = (d) => (d.jobs && d.jobs.levels && d.jobs.levels[d.jobs.primary]) || 1;
        if (!rows.length) {
            if (body.rev !== 1) return { ok: false, conflict: true, rev: 0 };   // 新規は rev 1 で送る
            const res = userDb.insert('characters', {
                name: body.name, status: body.status, schema_version: SCHEMA_VERSION, rev: 1,
                data: JSON.stringify(body.data), level: level(body.data), guild_id: (body.data.guild && body.data.guild.lastId) || null,
                created_at: t, updated_at: t
            }, dbPath);
            writeHistory(userDb, Number(res.lastInsertRowid), 1, body.data, t, dbPath);
            return { ok: true, rev: 1 };
        }
        const cur = rows[0];
        if (body.rev !== cur.rev) return { ok: false, conflict: true, rev: cur.rev };
        if (cur.status === 'confirmed' && body.status !== 'confirmed') return { ok: false, invalid: '確定済みの冒険者は、作成中に戻せません' };
        const data = { ...JSON.parse(cur.data), ...body.data };
        const rev = cur.rev + 1;
        userDb.updateById('characters', cur.id, {
            name: body.name, status: body.status, schema_version: SCHEMA_VERSION, rev,
            data: JSON.stringify(data), level: level(data), guild_id: (data.guild && data.guild.lastId) || cur.guild_id, updated_at: t
        }, 'id', dbPath);
        writeHistory(userDb, cur.id, rev, data, t, dbPath);
        return { ok: true, rev };
    }, dbPath);
}

function writeHistory(userDb, characterId, rev, data, t, dbPath) {
    userDb.insert('character_saves', { character_id: characterId, rev, schema_version: SCHEMA_VERSION, data: JSON.stringify(data), saved_at: t }, dbPath);
    const all = userDb.find('character_saves', 'character_id = ?', [characterId], dbPath);
    const olds = all.sort((a, b) => b.id - a.id).slice(KEEP_SAVES);   // 新しい順に、5 件を超えた分
    for (const o of olds) userDb.deleteById('character_saves', o.id, 'id', dbPath);
}

module.exports = { load, save, KEEP_SAVES };
