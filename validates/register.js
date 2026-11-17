/**
 * ユーザー登録・ログイン・パスワード変更・アカウント削除の入力の検証 (validates/register.js)
 *   const validate = $loadLib('validate.js');
 *   const schema = $loadLib('validates/register.js');
 *   validate.check($request.body, schema.register)
 * パスワードの長さは、仮（8〜128 文字）。キーワードの長さも、仮（4〜64 文字）。決まったら直す。
 */
const password = { type: 'string', required: true, minLen: 8, maxLen: 128, messages: { required: 'パスワードは必須です', minLen: 'パスワードは 8 文字以上です', maxLen: 'パスワードは 128 文字以内です' } };
const email = { type: 'string', required: true, mail: true, maxLen: 254, messages: { required: 'メールアドレスは必須です', mail: 'メールアドレスの形式が正しくありません', maxLen: 'メールアドレスが長すぎます' } };

// キーワード: パスワードを忘れたときの再設定に使う（メールを送らないため）。パスワードと同じ文字列は、不可（custom）
const keyword = { type: 'string', required: true, minLen: 4, maxLen: 64, messages: { required: 'キーワードは必須です', minLen: 'キーワードは 4 文字以上です', maxLen: 'キーワードは 64 文字以内です' } };
const notSameAsPassword = (field) => (v, all) => (typeof v === 'string' && v.trim() === all[field]) ? 'キーワードは、パスワードと別のものにしてください' : true;

module.exports = {
    register: { email, password, keyword: { ...keyword, custom: notSameAsPassword('password') } },
    reset: { email: { type: 'string', required: true, maxLen: 254 }, keyword: { type: 'string', required: true, maxLen: 64, messages: { required: 'キーワードは必須です' } }, next: { ...password, messages: { ...password.messages, required: '新しいパスワードは必須です' } } },
    changeKeyword: { password: { type: 'string', required: true, maxLen: 128, messages: { required: 'パスワードは必須です' } }, keyword: { ...keyword, custom: notSameAsPassword('password') } },
    login: { email: { type: 'string', required: true, maxLen: 254 }, password: { type: 'string', required: true, maxLen: 128 }, keyword: { type: 'string', maxLen: 64 } },   // keyword は、ログインがロックされているときの解除にだけ使う（任意）
    changePassword: { current: { type: 'string', required: true, maxLen: 128, messages: { required: '現在のパスワードは必須です' } }, next: { ...password, messages: { ...password.messages, required: '新しいパスワードは必須です' } } },
    deleteAccount: { password: { type: 'string', required: true, maxLen: 128, messages: { required: 'パスワードは必須です' } } }
};
