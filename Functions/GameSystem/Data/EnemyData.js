// Functions/GameSystem/Data/EnemyData.js
// 敵人數據：一般敵人 / 精英 / BOSS

const ENEMIES = {
    // ── 一般敵人 ────────────────────────────────────────────────
    abnormality_worker: {
        name: '扭曲工人', tier: 'normal',
        hp: 40, defLevel: 10, minSpd: 3, maxSpd: 6,
        skills: [
            { name: '亂揮', type: '鈍', coins: 2, base: 3, coin: 2, effect: null },
            { name: '猛咬', type: '刺', coins: 2, base: 4, coin: 2, effect: { name: '流血', stacks: 2 } },
        ],
    },
    armed_guard: {
        name: '武裝衛兵', tier: 'normal',
        hp: 50, defLevel: 15, minSpd: 4, maxSpd: 7,
        skills: [
            { name: '槍刺',   type: '刺', coins: 2, base: 4, coin: 2, effect: null },
            { name: '槍托砸', type: '鈍', coins: 3, base: 3, coin: 2, effect: { name: '震顫', stacks: 1 } },
            { name: '連射',   type: '刺', coins: 3, base: 4, coin: 3, effect: null },
        ],
    },
    fanatic: {
        name: '狂熱份子', tier: 'normal',
        hp: 45, defLevel: 12, minSpd: 5, maxSpd: 9,
        skills: [
            { name: '衝擊',   type: '鈍', coins: 2, base: 4, coin: 3, effect: { name: '燃燒', stacks: 2 } },
            { name: '火炸彈', type: '鈍', coins: 3, base: 3, coin: 3, effect: { name: '燃燒', stacks: 4 } },
        ],
    },
    winged_mutant: {
        name: '翼型突變體', tier: 'normal',
        hp: 38, defLevel: 10, minSpd: 6, maxSpd: 10,
        skills: [
            { name: '利爪', type: '斬', coins: 3, base: 3, coin: 2, effect: { name: '流血', stacks: 3 } },
            { name: '俯衝', type: '刺', coins: 3, base: 4, coin: 3, effect: null },
        ],
    },

    // ── 精英敵人 ────────────────────────────────────────────────
    fixer_elite: {
        name: '精英收尾人', tier: 'elite',
        hp: 90, defLevel: 22, minSpd: 5, maxSpd: 9,
        skills: [
            { name: '雙刀', type: '斬', coins: 3, base: 5, coin: 3, effect: { name: '流血', stacks: 3 } },
            { name: '爆破彈', type: '鈍', coins: 4, base: 4, coin: 3, effect: { name: '震顫', stacks: 2 } },
            { name: '終結射擊', type: '刺', coins: 5, base: 4, coin: 4, effect: null },
        ],
    },
    abnormality_cultivated: {
        name: '培育異想體', tier: 'elite',
        hp: 100, defLevel: 20, minSpd: 3, maxSpd: 7,
        skills: [
            { name: '觸手纏繞', type: '鈍', coins: 3, base: 5, coin: 3, effect: { name: '束縛', stacks: 1 } },
            { name: '毒液噴射', type: '刺', coins: 4, base: 4, coin: 3, effect: { name: '沉沒', stacks: 3 } },
            { name: '全力爆發', type: '鈍', coins: 6, base: 4, coin: 4, effect: null },
        ],
    },

    // ── BOSS ────────────────────────────────────────────────────
    warp_engine: {
        name: '翹曲引擎', tier: 'boss',
        hp: 200, defLevel: 30, minSpd: 3, maxSpd: 8,
        skills: [
            { name: '引擎衝擊', type: '鈍', coins: 4, base: 6, coin: 3, effect: { name: '震顫', stacks: 3 } },
            { name: '空間切割', type: '斬', coins: 5, base: 5, coin: 4, effect: { name: '流血', stacks: 4 } },
            { name: '重力壓縮', type: '鈍', coins: 6, base: 6, coin: 5, effect: { name: '倒地', stacks: 1 } },
            { name: '維度爆炸', type: '鈍', coins: 8, base: 7, coin: 5, effect: { name: '破裂', stacks: 5 } },
        ],
    },
    red_eyes_fragment: {
        name: '赤眼異想體碎片', tier: 'boss',
        hp: 180, defLevel: 25, minSpd: 5, maxSpd: 10,
        skills: [
            { name: '衝撞', type: '鈍', coins: 3, base: 5, coin: 4, effect: null },
            { name: '赤眼射線', type: '刺', coins: 5, base: 6, coin: 4, effect: { name: '燃燒', stacks: 5 } },
            { name: '瘋狂之力', type: '斬', coins: 6, base: 6, coin: 5, effect: { name: '破裂', stacks: 4 } },
        ],
    },
    urban_nightmare: {
        name: '都市惡夢', tier: 'boss',
        hp: 220, defLevel: 28, minSpd: 2, maxSpd: 7,
        skills: [
            { name: '黑暗纏繞', type: '鈍', coins: 4, base: 5, coin: 3, effect: { name: '沉沒', stacks: 4 } },
            { name: '恐懼波動', type: '鈍', coins: 5, base: 5, coin: 4, effect: { name: '破裂', stacks: 3 } },
            { name: '湮滅之擊', type: '鈍', coins: 7, base: 7, coin: 6, effect: { name: '倒地', stacks: 2 } },
        ],
    },
};

const NORMAL_ENEMIES  = Object.values(ENEMIES).filter(e => e.tier === 'normal').map((e, _, a) => e);
const ELITE_ENEMIES   = Object.values(ENEMIES).filter(e => e.tier === 'elite');
const BOSS_ENEMIES    = Object.values(ENEMIES).filter(e => e.tier === 'boss');

function randomEnemy(tier = 'normal') {
    const pool = tier === 'boss' ? BOSS_ENEMIES : tier === 'elite' ? ELITE_ENEMIES : NORMAL_ENEMIES;
    return JSON.parse(JSON.stringify(pool[Math.floor(Math.random() * pool.length)]));
}

module.exports = { ENEMIES, randomEnemy, NORMAL_ENEMIES, ELITE_ENEMIES, BOSS_ENEMIES };
