// Functions/GameSystem/Data/EnemyData.js
// 敵人數據 — 包含屬性標示，方便戰鬥 UI 選擇
'use strict';

// attribute: 該敵人主要使用的狀態效果種類（用於 UI 顯示）
const ENEMIES = {

    // ══════════════ 超簡單 / 簡單 ══════════════
    small_creature: {
        name: '小型生物',      tier: 'super_easy',
        attribute: '一般',     attributeEmoji: '⬜',
        hp: 20, defLevel: 5, minSpd: 3, maxSpd: 6,
        skills: [
            { name: '亂抓', type: '斬', coins: 1, base: 2, coin: 1, effect: null },
            { name: '咬', type: '刺', coins: 1, base: 2, coin: 1, effect: { name: '流血', stacks: 1 } },
        ],
    },
    rookie_fixer: {
        name: '新手收尾人',    tier: 'super_easy',
        attribute: '一般',     attributeEmoji: '⬜',
        hp: 25, defLevel: 5, minSpd: 4, maxSpd: 7,
        skills: [
            { name: '普通刺擊', type: '刺', coins: 2, base: 2, coin: 1, effect: null },
            { name: '格擋砸', type: '鈍', coins: 1, base: 3, coin: 1, effect: null },
        ],
    },
    abnormality_worker: {
        name: '扭曲工人',      tier: 'easy',
        attribute: '出血系',   attributeEmoji: '🩸',
        hp: 40, defLevel: 10, minSpd: 3, maxSpd: 6,
        skills: [
            { name: '亂揮', type: '鈍', coins: 2, base: 3, coin: 2, effect: null },
            { name: '猛咬', type: '刺', coins: 2, base: 4, coin: 2, effect: { name: '流血', stacks: 2 } },
        ],
    },
    fanatic: {
        name: '狂熱份子',      tier: 'easy',
        attribute: '燃燒系',   attributeEmoji: '🔥',
        hp: 45, defLevel: 12, minSpd: 5, maxSpd: 9,
        skills: [
            { name: '衝擊',   type: '鈍', coins: 2, base: 4, coin: 3, effect: { name: '燃燒', stacks: 2 } },
            { name: '火炸彈', type: '鈍', coins: 3, base: 3, coin: 3, effect: { name: '燃燒', stacks: 4 } },
        ],
    },

    // ══════════════ 一般 ══════════════
    armed_guard: {
        name: '武裝衛兵',      tier: 'normal',
        attribute: '震顫系',   attributeEmoji: '🌀',
        hp: 50, defLevel: 15, minSpd: 4, maxSpd: 7,
        skills: [
            { name: '槍刺',   type: '刺', coins: 2, base: 4, coin: 2, effect: null },
            { name: '槍托砸', type: '鈍', coins: 3, base: 3, coin: 2, effect: { name: '震顫', stacks: 2 } },
            { name: '連射',   type: '刺', coins: 3, base: 4, coin: 3, effect: null },
        ],
    },
    winged_mutant: {
        name: '翼型突變體',    tier: 'normal',
        attribute: '出血系',   attributeEmoji: '🩸',
        hp: 38, defLevel: 10, minSpd: 6, maxSpd: 10,
        skills: [
            { name: '利爪', type: '斬', coins: 3, base: 3, coin: 2, effect: { name: '流血', stacks: 3 } },
            { name: '俯衝', type: '刺', coins: 3, base: 4, coin: 3, effect: null },
        ],
    },
    corrupt_clerk: {
        name: '腐敗書記員',    tier: 'normal',
        attribute: '沉沒系',   attributeEmoji: '🌊',
        hp: 55, defLevel: 12, minSpd: 3, maxSpd: 6,
        skills: [
            { name: '黑墨攻擊', type: '鈍', coins: 2, base: 4, coin: 2, effect: { name: '沉沒', stacks: 3 } },
            { name: '腐蝕噴射', type: '刺', coins: 3, base: 3, coin: 2, effect: { name: '沉沒', stacks: 5 } },
        ],
    },
    chainsaw_wielder: {
        name: '鏈鋸持有者',    tier: 'normal',
        attribute: '出血系',   attributeEmoji: '🩸',
        hp: 60, defLevel: 10, minSpd: 5, maxSpd: 8,
        skills: [
            { name: '鏈鋸橫掃', type: '斬', coins: 3, base: 5, coin: 3, effect: { name: '流血', stacks: 4 } },
            { name: '旋轉攻擊', type: '斬', coins: 4, base: 4, coin: 3, effect: { name: '流血', stacks: 2 } },
        ],
    },

    // ══════════════ 困難 ══════════════
    veteran_fixer: {
        name: '老練收尾人',    tier: 'hard',
        attribute: '破裂系',   attributeEmoji: '💥',
        hp: 85, defLevel: 22, minSpd: 5, maxSpd: 9,
        skills: [
            { name: '爆破彈', type: '鈍', coins: 3, base: 5, coin: 3, effect: { name: '破裂', stacks: 3 } },
            { name: '狙擊', type: '刺', coins: 4, base: 5, coin: 4, effect: { name: '破裂', stacks: 2 } },
        ],
    },
    bound_creature: {
        name: '束縛異想體',    tier: 'hard',
        attribute: '束縛系',   attributeEmoji: '⛓️',
        hp: 95, defLevel: 20, minSpd: 3, maxSpd: 6,
        skills: [
            { name: '觸手纏繞', type: '鈍', coins: 3, base: 4, coin: 3, effect: { name: '束縛', stacks: 2 } },
            { name: '勒緊',     type: '斬', coins: 4, base: 5, coin: 3, effect: { name: '倒地', stacks: 1 } },
            { name: '全力擠壓', type: '鈍', coins: 5, base: 5, coin: 4, effect: null },
        ],
    },
    fixer_elite: {
        name: '精英收尾人',    tier: 'hard',
        attribute: '出血系',   attributeEmoji: '🩸',
        hp: 90, defLevel: 22, minSpd: 5, maxSpd: 9,
        skills: [
            { name: '雙刀',   type: '斬', coins: 3, base: 5, coin: 3, effect: { name: '流血', stacks: 3 } },
            { name: '爆破彈', type: '鈍', coins: 4, base: 4, coin: 3, effect: { name: '震顫', stacks: 2 } },
            { name: '終結射擊', type: '刺', coins: 5, base: 4, coin: 4, effect: null },
        ],
    },

    // ══════════════ 瘋狂（精英敵人）══════════════
    abnormality_cultivated: {
        name: '培育異想體',    tier: 'insane',
        attribute: '沉沒系',   attributeEmoji: '🌊',
        hp: 130, defLevel: 25, minSpd: 3, maxSpd: 7,
        skills: [
            { name: '觸手纏繞', type: '鈍', coins: 3, base: 5, coin: 3, effect: { name: '束縛', stacks: 1 } },
            { name: '毒液噴射', type: '刺', coins: 4, base: 4, coin: 3, effect: { name: '沉沒', stacks: 5 } },
            { name: '全力爆發', type: '鈍', coins: 6, base: 4, coin: 4, effect: { name: '破裂', stacks: 3 } },
        ],
    },
    lament_of_the_lake: {
        name: '湖中悲鳴',      tier: 'insane',
        attribute: '震顫系',   attributeEmoji: '🌀',
        hp: 120, defLevel: 28, minSpd: 4, maxSpd: 8,
        skills: [
            { name: '震顫波', type: '鈍', coins: 4, base: 5, coin: 4, effect: { name: '震顫', stacks: 4 } },
            { name: '深淵之聲', type: '鈍', coins: 5, base: 5, coin: 4, effect: { name: '沉沒', stacks: 4 } },
            { name: '絕望之力', type: '鈍', coins: 6, base: 6, coin: 5, effect: { name: '倒地', stacks: 2 } },
        ],
    },

    // ══════════════ BOSS ══════════════
    warp_engine: {
        name: '翹曲引擎',      tier: 'boss',
        attribute: '震顫系',   attributeEmoji: '🌀',
        hp: 200, defLevel: 30, minSpd: 3, maxSpd: 8,
        skills: [
            { name: '引擎衝擊', type: '鈍', coins: 4, base: 6, coin: 3, effect: { name: '震顫', stacks: 3 } },
            { name: '空間切割', type: '斬', coins: 5, base: 5, coin: 4, effect: { name: '流血', stacks: 4 } },
            { name: '重力壓縮', type: '鈍', coins: 6, base: 6, coin: 5, effect: { name: '倒地', stacks: 1 } },
            { name: '維度爆炸', type: '鈍', coins: 8, base: 7, coin: 5, effect: { name: '破裂', stacks: 5 } },
        ],
    },
    red_eyes_fragment: {
        name: '赤眼異想體',    tier: 'boss',
        attribute: '燃燒系',   attributeEmoji: '🔥',
        hp: 180, defLevel: 25, minSpd: 5, maxSpd: 10,
        skills: [
            { name: '衝撞',     type: '鈍', coins: 3, base: 5, coin: 4, effect: null },
            { name: '赤眼射線', type: '刺', coins: 5, base: 6, coin: 4, effect: { name: '燃燒', stacks: 6 } },
            { name: '瘋狂之力', type: '斬', coins: 6, base: 6, coin: 5, effect: { name: '破裂', stacks: 4 } },
        ],
    },
    urban_nightmare: {
        name: '都市惡夢',      tier: 'boss',
        attribute: '沉沒系',   attributeEmoji: '🌊',
        hp: 220, defLevel: 28, minSpd: 2, maxSpd: 7,
        skills: [
            { name: '黑暗纏繞', type: '鈍', coins: 4, base: 5, coin: 3, effect: { name: '沉沒', stacks: 5 } },
            { name: '恐懼波動', type: '鈍', coins: 5, base: 5, coin: 4, effect: { name: '破裂', stacks: 3 } },
            { name: '湮滅之擊', type: '鈍', coins: 7, base: 7, coin: 6, effect: { name: '倒地', stacks: 2 } },
        ],
    },
    the_smiling_angela: {
        name: '「微笑者」',    tier: 'boss',
        attribute: '混合系',   attributeEmoji: '⚠️',
        hp: 250, defLevel: 35, minSpd: 5, maxSpd: 12,
        skills: [
            { name: '圖書館之罰', type: '斬', coins: 5, base: 8, coin: 5, effect: { name: '流血', stacks: 5 } },
            { name: '判定之書',   type: '鈍', coins: 6, base: 7, coin: 5, effect: { name: '燃燒', stacks: 6 } },
            { name: '知識的重量', type: '鈍', coins: 7, base: 8, coin: 6, effect: { name: '沉沒', stacks: 6 } },
            { name: '刪除',       type: '刺', coins: 9, base: 9, coin: 7, effect: { name: '破裂', stacks: 8 } },
        ],
    },
};

// 按難度分組
const BY_TIER = {
    super_easy: Object.values(ENEMIES).filter(e => e.tier === 'super_easy'),
    easy:       Object.values(ENEMIES).filter(e => e.tier === 'easy'),
    normal:     Object.values(ENEMIES).filter(e => e.tier === 'normal'),
    hard:       Object.values(ENEMIES).filter(e => e.tier === 'hard'),
    insane:     Object.values(ENEMIES).filter(e => e.tier === 'insane'),
    boss:       Object.values(ENEMIES).filter(e => e.tier === 'boss'),
};

// 相容舊版（MirrorDungeon 仍使用 'elite'）
BY_TIER.elite = BY_TIER.hard;
BY_TIER.normal_or_easy = [...BY_TIER.normal, ...BY_TIER.easy];

function randomEnemy(tier = 'normal') {
    const pool = BY_TIER[tier] || BY_TIER.normal;
    return JSON.parse(JSON.stringify(pool[Math.floor(Math.random() * pool.length)]));
}

function getEnemiesForTier(tier) {
    return (BY_TIER[tier] || BY_TIER.normal).map(e => ({
        key: Object.keys(ENEMIES).find(k => ENEMIES[k] === e) || e.name,
        name: e.name,
        attribute: e.attribute || '一般',
        attributeEmoji: e.attributeEmoji || '⬜',
        hp: e.hp,
        defLevel: e.defLevel,
    }));
}

module.exports = { ENEMIES, randomEnemy, getEnemiesForTier, BY_TIER };
