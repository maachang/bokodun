// 職業・経験値・訓練所での操作（職業のレベルアップ・覚える・第一職業とサブ職業の変更）。GameEngine のメソッド（this は GameEngine）。
//   仕様: docs/character-spec.md 6 章（職業）・7 章（経験値と職業訓練所）。定義は jobs.json（this.rules.jobs）。
//   player.jobs = { primary: 第一職業, sub: サブ職業（なければ null）, levels: { 職業 ID: レベル }, expStock: 経験値のストック }（保存データの jobs と同じ形）
//   戦闘能力（HP・MP・攻撃・魔法・回避など）は、第一職業とそのレベルで決まる（player.job・player.level に写す）。サブ職業の効果は、未決なので、まだない。
//   経験値は、戦闘で貯めるだけ。レベルアップと職業の変更は、訓練所（教官）でのみ行える。
import * as R from '/js/game/rules.js';

export const jobMethods = {
    // player.job・player.level を、第一職業から決め直す（戦闘の式は、この 2 つを見る）
    syncJob() {
        const p = this.player, j = p.jobs;
        p.job = j.primary;
        p.level = j.levels[j.primary];
    },

    jobName(id) {
        return this.rules.jobs[id]?.name ?? id;
    },

    // 経験値を、ストックに貯める（レベルは、上がらない）
    gainExp(amount) {
        this.player.jobs.expStock += amount;
    },

    // 職業 id のレベルを 1 つ上げるのに必要な経験値（覚えていない・最大レベルなら null）
    expCost(id) {
        const lv = this.player.jobs.levels[id];
        if (!lv || lv >= (this.rules.maxLevel ?? 99)) return null;
        return R.expToNextLevel(this.rules, id, lv);
    },

    // 訓練所でのレベルアップ。{ ok, message }
    levelUpJob(id) {
        const j = this.player.jobs, cost = this.expCost(id);
        if (cost === null) return { ok: false, message: j.levels[id] ? `${this.jobName(id)}は、最大のレベルです` : `${this.jobName(id)}は、まだ覚えていません` };
        if (j.expStock < cost) return { ok: false, message: `経験値が足りません（必要 ${cost}・ストック ${j.expStock}）` };
        j.expStock -= cost;
        j.levels[id]++;
        if (id === j.primary) { this.syncJob(); this.recomputeStats(false); }   // 第一職業なら、HP・MP などが変わる
        return { ok: true, message: `${this.jobName(id)}が、Lv.${j.levels[id]} になりました` };
    },

    // 覚えられる職業（条件を満たし、まだ覚えていないもの）。上位職は、基本職の条件（例: ファイター Lv20）が必要
    learnableJobs() {
        const levels = this.player.jobs.levels;
        return Object.keys(this.rules.jobs).filter((id) => !(id in levels) && R.jobRequirementsMet(this.rules, id, levels));
    },

    // 職業を覚える（Lv.1 から。経験値は使わない）
    learnJob(id) {
        const j = this.player.jobs;
        if (!this.rules.jobs[id] || id in j.levels) return { ok: false, message: '覚えられません' };
        if (!R.jobRequirementsMet(this.rules, id, j.levels)) return { ok: false, message: '覚える条件を満たしていません' };
        j.levels[id] = 1;
        return { ok: true, message: `${this.jobName(id)}を覚えました（Lv.1）` };
    },

    // 第一職業を変える（覚えた戦闘職から。戦闘能力は、その職業のレベルで決まる）
    setPrimaryJob(id) {
        const j = this.player.jobs;
        if (!(id in j.levels) || this.rules.jobs[id].type !== 'combat') return { ok: false, message: '第一職業にできるのは、覚えた戦闘職です' };
        if (id === j.primary) return { ok: false, message: 'すでに第一職業です' };
        if (j.sub === id) j.sub = null;   // サブと同じになるときは、サブを外す
        j.primary = id;
        this.syncJob();
        this.recomputeStats(false);
        return { ok: true, message: `第一職業を、${this.jobName(id)}（Lv.${j.levels[id]}）にしました` };
    },

    // サブ職業を決める（覚えた職業のうち、第一職業でないもの。null で外す）。効果は未決なので、まだない
    setSubJob(id) {
        const j = this.player.jobs;
        if (id === null) { j.sub = null; return { ok: true, message: 'サブ職業を外しました' }; }
        if (!(id in j.levels) || id === j.primary) return { ok: false, message: 'サブ職業にできるのは、覚えた職業（第一職業以外）です' };
        j.sub = id;
        return { ok: true, message: `サブ職業を、${this.jobName(id)}（Lv.${j.levels[id]}）にしました` };
    }
};
