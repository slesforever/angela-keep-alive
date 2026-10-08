// Functions/GameSystem/Data/StatusEffects.js
// 七大核心狀態效果系統 — 獨立腳本，方便日後新增
'use strict';

// ─── 狀態效果定義 ─────────────────────────────────────────────
// 每個效果包含：apply（施加）、onTurnEnd（回合結束觸發）、onHit（被攻擊時觸發）、describe（說明）
const STATUS_DEFS = {

    // 1. 燃燒 (Burn) ── 回合結束受到等同層數傷害
    '燃燒': {
        emoji: '🔥',
        maxStacks: 99,
        onTurnEnd: (unit, stacks) => {
            const dmg = stacks;
            unit.hp = Math.max(0, unit.hp - dmg);
            unit.statuses['燃燒'] = Math.max(0, stacks - 1);
            return `🔥 **燃燒** → **${unit.name}** 受到 **${dmg}** 燃燒傷害，層數降至 ${unit.statuses['燃燒']}`;
        },
        describe: '回合結束時，受到等同層數的固定傷害，層數 -1。層數上限 99。',
    },

    // 2. 出血 / 流血 (Bleed) ── 使用技能硬幣時受到等同層數傷害
    '流血': {
        emoji: '🩸',
        maxStacks: 99,
        onCoinFlip: (unit, stacks) => {
            const dmg = stacks;
            unit.hp = Math.max(0, unit.hp - dmg);
            unit.statuses['流血'] = Math.max(0, stacks - 1);
            return `🩸 **出血** → **${unit.name}** 使用技能時流血，受到 **${dmg}** 傷害，層數降至 ${unit.statuses['流血']}`;
        },
        describe: '目標使用技能硬幣時，受到等同層數的固定傷害，層數 -1。層數上限 99。',
    },

    // 3. 震顫 (Tremor) ── 累積後爆發觸發特殊效果
    '震顫': {
        emoji: '🌀',
        maxStacks: 99,
        burstThreshold: 10,
        onTurnEnd: (unit, stacks) => {
            if (stacks >= 10) {
                // 震顫爆發：扣除體力上限
                const burst = Math.floor(stacks / 10);
                unit.maxHp = Math.max(1, unit.maxHp - burst * 5);
                unit.hp = Math.min(unit.hp, unit.maxHp);
                unit.statuses['震顫'] = stacks % 10;
                return `🌀 **震顫爆發！** → **${unit.name}** 最大 HP 降低 **${burst * 5}**，震顫層數重置至 ${unit.statuses['震顫']}`;
            }
            return null;
        },
        describe: '累積至 10 層時爆發，降低目標最大 HP（每 10 層 -5 MaxHP），層數重置。',
    },

    // 4. 破裂 (Rupture) ── 受到攻擊時額外受到等同層數傷害
    '破裂': {
        emoji: '💥',
        maxStacks: 99,
        onReceiveHit: (unit, stacks, incomingDmg) => {
            const extra = Math.floor(stacks * 0.5);
            unit.hp = Math.max(0, unit.hp - extra);
            return `💥 **破裂** → **${unit.name}** 額外受到 **${extra}** 破裂傷害`;
        },
        describe: '受到攻擊時，額外受到等同 0.5×層數的傷害。層數上限 99。',
    },

    // 5. 沉沒 (Sinking) ── 累積至 15 層爆發造成大量傷害
    '沉淪': {
        emoji: '🌊',
        maxStacks: 99,
        burstThreshold: 15,
        onTurnEnd: (unit, stacks) => {
            if (stacks >= 15) {
                const burstDmg = Math.floor(stacks * 1.5);
                unit.hp = Math.max(0, unit.hp - burstDmg);
                unit.statuses['沉沒'] = 0;
                return `🌊 **沉沒爆發！** → **${unit.name}** 受到 **${burstDmg}** 深淵傷害，沉沒歸零`;
            }
            return null;
        },
        describe: '累積至 15 層時爆發，造成 1.5×層數傷害並歸零層數。',
    },

    // 6. 束縛 (Bind) ── 無法使用 S3，防禦降低
    '束縛': {
        emoji: '⛓️',
        maxStacks: 10,
        onTurnEnd: (unit, stacks) => {
            unit.statuses['束縛'] = Math.max(0, stacks - 1);
            return stacks > 0 ? `⛓️ **束縛** → **${unit.name}** 被束縛（無法使用最強技能），層數 ${stacks} → ${unit.statuses['束縛']}` : null;
        },
        describe: '被束縛時無法使用最強技能，每回合層數 -1。層數上限 10。',
    },

    // 7. 倒地 (Knockdown) ── 受到額外傷害，無法防禦
    '易損': {
        emoji: '💫',
        maxStacks: 5,
        onTurnEnd: (unit, stacks) => {
            unit.statuses['倒地'] = Math.max(0, stacks - 1);
            return stacks > 0 ? `💫 **倒地** → **${unit.name}** 倒地中（受到 1.5x 傷害），層數 ${stacks} → ${unit.statuses['倒地']}` : null;
        },
        describe: '倒地時受到 1.5 倍傷害且無法防禦，每回合層數 -1。',
    },
};

// ─── 施加狀態 ─────────────────────────────────────────────────
function applyStatus(target, statusName, stacks = 1) {
    if (!target.statuses) target.statuses = {};
    const def = STATUS_DEFS[statusName];
    const max = def?.maxStacks ?? 99;
    const current = target.statuses[statusName] || 0;
    target.statuses[statusName] = Math.min(current + stacks, max);
}

// ─── 回合結束處理 ─────────────────────────────────────────────
function processTurnEnd(unit) {
    const logs = [];
    if (!unit.statuses) return logs;

    for (const [name, stacks] of Object.entries(unit.statuses)) {
        if (stacks <= 0) continue;
        const def = STATUS_DEFS[name];
        if (!def?.onTurnEnd) continue;
        const result = def.onTurnEnd(unit, stacks);
        if (result) logs.push(result);
    }
    return logs;
}

// ─── 受擊時處理（破裂）────────────────────────────────────────
function processOnHit(unit, incomingDmg) {
    const logs = [];
    if (!unit.statuses) return logs;

    const ruptureStacks = unit.statuses['破裂'] || 0;
    if (ruptureStacks > 0) {
        const def = STATUS_DEFS['破裂'];
        const result = def.onReceiveHit(unit, ruptureStacks, incomingDmg);
        if (result) logs.push(result);
    }

    const knockdownStacks = unit.statuses['倒地'] || 0;
    if (knockdownStacks > 0) {
        // 倒地時受到額外 50% 傷害（已在 BattleSystem 處理）
    }

    return logs;
}

// ─── 格式化狀態顯示 ──────────────────────────────────────────
function formatStatuses(statuses = {}) {
    return Object.entries(statuses)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => {
            const emoji = STATUS_DEFS[k]?.emoji || '';
            return `${emoji}${k}×${v}`;
        })
        .join(' ') || '無';
}

// ─── 狀態說明文字 ────────────────────────────────────────────
function describeAllStatuses() {
    return Object.entries(STATUS_DEFS).map(([name, def]) =>
        `${def.emoji} **${name}**：${def.describe}`
    ).join('\n');
}

// ─── 束縛檢查（是否可以使用高級技能）────────────────────────
function isBindRestricted(unit) {
    return (unit.statuses?.['束縛'] || 0) > 0;
}

// ─── 倒地傷害倍率 ────────────────────────────────────────────
function getKnockdownMultiplier(unit) {
    return (unit.statuses?.['倒地'] || 0) > 0 ? 1.5 : 1.0;
}

module.exports = {
    STATUS_DEFS,
    applyStatus,
    processTurnEnd,
    processOnHit,
    formatStatuses,
    describeAllStatuses,
    isBindRestricted,
    getKnockdownMultiplier,
};
