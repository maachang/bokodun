/**
 * 冒険者の作成（確定）の入力の検証 (validates/create.js)。形だけをここで見て、能力値の整合（計測値・種族・ボーナス）は、rules.js の validateCreation で見る。
 *   const validate = $loadLib('validate.js');
 *   validate.check($request.body, $loadLib('validates/create.js'))
 */
module.exports = {
    name: { type: 'string', required: true, minLen: 1, maxLen: 50, messages: { required: '名前は必須です', minLen: '名前を入れてください', maxLen: '名前は 50 文字以内です' } },
    race: { type: 'string', required: true, pattern: /^[a-z_]{1,32}$/, messages: { required: '種族は必須です' } },
    job: { type: 'string', required: true, pattern: /^[a-z_]{1,32}$/, messages: { required: '第一職業は必須です' } },
    a: { type: 'float', required: true }, b: { type: 'float', required: true }, c: { type: 'float', required: true }, d: { type: 'float', required: true },
    bonus: { type: 'int', required: true },
    abilities: { required: true, custom: (v) => (v !== null && typeof v === 'object' && !Array.isArray(v)) || '能力値が不正です' }
};
