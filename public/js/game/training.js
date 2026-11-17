// 職業訓練所のメニュー（教官に話しかけると、店のメニューと同じ枠（#talk）に出る）。GameEngine のメソッド（this は GameEngine）。
//   画面: top（レベルを上げる・職業を覚える・第一職業を変える・サブ職業を決める）→ levelup / learn / primary / sub。操作は jobs.js。
export const trainingMethods = {
    trainingTitle(m) {
        const j = this.player.jobs;
        const head = { top: '何をする？', levelup: 'レベルを上げる', learn: '職業を覚える', primary: '第一職業を変える', sub: 'サブ職業を決める' }[m.screen];
        return `${head}　経験値のストック ${j.expStock}`;
    },

    trainingChoices(m) {
        const j = this.player.jobs, back = { label: 'もどる', act: () => { m.screen = 'top'; m.index = 0; m.note = ''; } };
        const run = (r) => { m.note = r.message; };   // 操作の結果を、メニューの下に出す
        const lvText = (id) => `${this.jobName(id)}　Lv.${j.levels[id]}`;
        if (m.screen === 'levelup') {
            return [...Object.keys(j.levels).map((id) => {
                const cost = this.expCost(id);
                return { label: `${lvText(id)}${id === j.primary ? '（第一）' : id === j.sub ? '（サブ）' : ''}　${cost === null ? '最大' : `→ Lv.${j.levels[id] + 1}　必要 ${cost}`}`, act: () => run(this.levelUpJob(id)) };
            }), back];
        }
        if (m.screen === 'learn') {
            const ids = this.learnableJobs();
            return [...ids.map((id) => ({ label: `${this.jobName(id)}（${this.rules.jobs[id].tier === 'high' ? '上位職' : '基本職'}・${this.rules.jobs[id].type === 'combat' ? '戦闘' : '非戦闘'}）`, act: () => { run(this.learnJob(id)); m.index = 0; } })),
                ...(ids.length ? [] : [{ label: '（いま覚えられる職業は、ありません）', act: () => {} }]), back];
        }
        if (m.screen === 'primary') {
            return [...Object.keys(j.levels).filter((id) => this.rules.jobs[id].type === 'combat').map((id) => ({ label: `${lvText(id)}${id === j.primary ? '（いまの第一職業）' : ''}`, act: () => run(this.setPrimaryJob(id)) })), back];
        }
        if (m.screen === 'sub') {
            return [{ label: `なし${j.sub === null ? '（いま）' : ''}`, act: () => run(this.setSubJob(null)) },
                ...Object.keys(j.levels).filter((id) => id !== j.primary).map((id) => ({ label: `${lvText(id)}${id === j.sub ? '（いまのサブ）' : ''}`, act: () => run(this.setSubJob(id)) })), back];
        }
        const go = (screen) => () => { m.screen = screen; m.index = 0; m.note = ''; };
        return [
            { label: 'レベルを上げる', act: go('levelup') },
            { label: '職業を覚える', act: go('learn') },
            { label: '第一職業を変える', act: go('primary') },
            { label: 'サブ職業を決める', act: go('sub') },
            { label: 'やめる', act: () => this.closeShopMenu() }
        ];
    }
};
