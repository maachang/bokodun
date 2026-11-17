/**
 * ユーザー登録・ログイン・パスワード変更・アカウント削除の入力の検証 (validates/register.js)
 *   const validate = $loadLib('validate.js');
 *   const schema = $loadLib('validates/register.js');
 *   validate.check($request.body, schema.register)
 * パスワードの長さは、仮（8〜128 文字）。決まったら直す。
 */
const password = { type: 'string', required: true, minLen: 8, maxLen: 128, messages: { required: 'パスワードは必須です', minLen: 'パスワードは 8 文字以上です', maxLen: 'パスワードは 128 文字以内です' } };
const email = { type: 'string', required: true, mail: true, maxLen: 254, messages: { required: 'メールアドレスは必須です', mail: 'メールアドレスの形式が正しくありません', maxLen: 'メールアドレスが長すぎます' } };

module.exports = {
    register: { email, password },
    login: { email: { type: 'string', required: true, maxLen: 254 }, password: { type: 'string', required: true, maxLen: 128 } },
    changePassword: { current: { type: 'string', required: true, maxLen: 128, messages: { required: '現在のパスワードは必須です' } }, next: { ...password, messages: { ...password.messages, required: '新しいパスワードは必須です' } } },
    deleteAccount: { password: { type: 'string', required: true, maxLen: 128, messages: { required: 'パスワードは必須です' } } }
};
