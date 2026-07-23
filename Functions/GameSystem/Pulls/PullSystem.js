// Functions/GameSystem/Pulls/PullSystem.js
// 抽卡系統 — 包含：人格 / E.G.O / 異想體（Abnormality）獨立二段抽 + 十連保底
'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

// =====================================================
// 🎯 活躍卡池設定
// =====================================================
const ACTIVE_BANNER = {
    name:        '黎明事務所 提取 — 梅菲斯特號',
    description: '黎明事務所成員與限定 E.G.O 概率 UP！',
    rateUp: {
        S3: identitiesData.upTargets['000'] || [],
        EGOS: identitiesData.upTargets['Egos'] || [],
    },
};

// ─── 機率設定 ─────────────────────────────────────────────────
const BASE_WEIGHTS = {
    COLOR_FIXER:  0.001,   // 0.001%
    ABN:          0.15,    // 0.15%  → 觸發異想體(Abnormality)本體二段抽
    SPECIAL:      0.30,    // 0.3%
    S4:           0.50,    // 0.5%
    EGOS:         1.50,    // 1.5%   → 罪人 E.G.O 技能/裝備
    S3:           2.90,    // 2.9%   → ★★★ 人格
    S2:          15.00,    // 15.0%  → ★★ 人格
    S1:          79.649,   // 剩餘   → ★ 人格
};

// 異想體（Abnormality）危險等級二段抽機率（合計 100%）
const ABN_WEIGHTS = {
    ABN_ZAYIN:  40.0,
    ABN_TETH:   30.0,
    ABN_HE:     17.5,
    ABN_WAW:    10.0,
    ABN_ALEPH:   2.0,
    ABN_ANGELA:  0.5,
};

// ─── 稀有度與顯示標籤設定 ───────────────────────────────────────
const TIER_CONFIGS = {
    COLOR_FIXER: { poolKeys: ['ColorFixer', 'Color_Fixer', 'Color Fixer'], label: 'Color Fixer', emoji: '🔴', color: 0xff3838, shardValue: 10 },
    
    // 異想體 (Abnormality) 個體分類
    ABN_ANGELA:  { poolKeys: ['ABN_ANGELA'],            label: '異想體 ANGELA', emoji: '🕊️', color: 0xffffff, shardValue: 20 },
    ABN_ALEPH:   { poolKeys: ['ABN_ALEPH'],             label: '異想體 ALEPH',  emoji: '🟣', color: 0x9b59b6, shardValue: 15 },
    ABN_WAW:     { poolKeys: ['ABN_WAW'],               label: '異想體 WAW',    emoji: '🔵', color: 0x3498db, shardValue: 10 },
    ABN_HE:      { poolKeys: ['ABN_HE'],                label: '異想體 HE',     emoji: '🟢', color: 0x2ecc71, shardValue: 8 },
    ABN_TETH:    { poolKeys: ['ABN_TETH'],              label: '異想體 TETH',   emoji: '🟡', color: 0xf1c40f, shardValue: 5 },
    ABN_ZAYIN:   { poolKeys: ['ABN_ZAYIN'],             label: '異想體 ZAYIN',  emoji: '⚪', color: 0xbdc3c7, shardValue: 3 },
    
    // 一般人格與 E.G.O
    SPECIAL:     { poolKeys: ['Special'],               label: 'Special',     emoji: '🌌', color: 0x2ed573, shardValue: 5 },
    S4:          { poolKeys: ['0000', 'S4'],            label: '★★★★',        emoji: '👑', color: 0xffa502, shardValue: 5 },
    EGOS:        { poolKeys: ['Egos', 'EGOS'],          label: 'E.G.O',       emoji: '🔮', color: 0xa55eea, shardValue: 3 },
    S3:          { poolKeys: ['000', 'S3'],             label: '★★★',         emoji: '✨', color: 0xffd166, shardValue: 3 },
    S2:          { poolKeys: ['00', 'S2'],              label: '★★',          emoji: '⭐', color: 0x74b9ff, shardValue: 1 },
    S1:          { poolKeys: ['0', 'S1'],               label: '★',           emoji: '▫️', color: 0x57606f, shardValue: 1 },
};

// ─── 工具函數 ─────────────────────────────────────────────────
function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function getPool(tierKey) {
    const config = TIER_CONFIGS[tierKey];
    if (!config) return [];
    for (const key of config.poolKeys) {
        if (identitiesData.pool?.[key]?.length) return identitiesData.pool[key];
    }
    return [];
}

function weightedDraw(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [key, w] of Object.entries(weights)) {
        if (r < w) return key;
        r -= w;
    }
    return Object.keys(weights)[0];
}

// ─── 核心單抽邏輯 ─────────────────────────────────────────────
function drawOnce(tempInventory = [], forceS2OrHigher = false) {
    let weights = { ...BASE_WEIGHTS };
    if (forceS2OrHigher) {
        delete weights.S1; // 保底移除 S1
    }

    const rolledTier = weightedDraw(weights);
    let finalTier = rolledTier;

    // 異想體（Abnormality）專屬二段抽
    if (rolledTier === 'ABN') {
        finalTier = weightedDraw(ABN_WEIGHTS);
    }

    const config = TIER_CONFIGS[finalTier] || TIER_CONFIGS.S1;
    let name = '';

    // RATE UP 邏輯
    if (finalTier === 'S3' && ACTIVE_BANNER.rateUp.S3?.length && Math.random() < 0.5) {
        name = pickRandom(ACTIVE_BANNER.rateUp.S3);
    } else if (finalTier === 'EGOS' && ACTIVE_BANNER.rateUp.EGOS?.length && Math.random() < 0.5) {
        name = pickRandom(ACTIVE_BANNER.rateUp.EGOS);
    }

    // 若未命中 UP 或非 UP 項目，從對應 Pool 隨機抽
    if (!name) {
        const poolItems = getPool(finalTier);
        name = (poolItems.length ? pickRandom(poolItems) : null) || `[${config.label}] 未知對象`;
    }

    const isDuplicate = tempInventory.includes(name);

    return {
        name,
        tier: finalTier,
        isAbn: rolledTier === 'ABN',
        isDuplicate,
        shardValue: config.shardValue,
        emoji: config.emoji,
        label: config.label,
        color: config.color,
    };
}

// ─── 格式化顯示 ──────────────────────────────────────────────
function formatItemDisplay(draw) {
    if (draw.isDuplicate) {
        return `~~${draw.emoji} [${draw.label}] ${draw.name}~~ ➡️ **自我碎片 ×${draw.shardValue}**`;
    }
    return `${draw.emoji} [${draw.label}] ${draw.name}`;
}

// ─── 主執行函數 ──────────────────────────────────────────────
async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;
    await message.channel.sendTyping();

    let inv = [];
    try {
        const rawInv = loadUserInventory(client, userId);
        inv = Array.isArray(rawInv) ? rawInv : [];
    } catch (err) {
        console.error('[PullSystem] 讀取背包失敗:', err.message);
    }

    const tempInv = [...inv];
    const draws = [];

    // 開始抽卡
    for (let i = 0; i < pullCount; i++) {
        // 十連保底：如果第10抽前全都是 S1，第 10 抽保底 S2 以上
        const isTenPullPity = (pullCount === 10 && i === 9 && draws.every(d => d.tier === 'S1'));
        
        const result = drawOnce(tempInv, isTenPullPity);
        draws.push(result);
        
        if (!result.isDuplicate) {
            tempInv.push(result.name);
        }
    }

    // 重複項轉碎片，新卡寫入背包
    const itemsToAdd = [];
    draws.forEach(d => {
        if (d.isDuplicate) {
            for (let k = 0; k < d.shardValue; k++) itemsToAdd.push('自我碎片');
        } else {
            itemsToAdd.push(d.name);
        }
    });

    try {
        saveUserInventory(client, userId, [...inv, ...itemsToAdd]);
    } catch (err) {
        console.error('[PullSystem] 背包儲存失敗:', err.message);
    }

    const resultLines = draws.map((d, i) => `${d.emoji} \`${i + 1}.\` ${formatItemDisplay(d)}`);

    // 決定最高級別 Embed 顏色
    const TIER_PRIORITY = ['COLOR_FIXER', 'ABN_ANGELA', 'ABN_ALEPH', 'ABN_WAW', 'ABN_HE', 'ABN_TETH', 'ABN_ZAYIN', 'SPECIAL', 'S4', 'EGOS', 'S3', 'S2', 'S1'];
    let embedColor = 0xeccc68;
    for (const t of TIER_PRIORITY) {
        if (draws.some(d => d.tier === t)) {
            embedColor = TIER_CONFIGS[t]?.color || embedColor;
            break;
        }
    }

    // 統計資料
    const abnCount  = draws.filter(d => d.isAbn).length;
    const egoCount  = draws.filter(d => d.tier === 'EGOS').length;
    const s3Count   = draws.filter(d => d.tier === 'S3').length;

    const summaryParts = [];
    if (abnCount) summaryParts.push(`⚠️ 遭遇異想體 ×${abnCount}`);
    if (egoCount) summaryParts.push(`🔮 提取 E.G.O ×${egoCount}`);
    if (s3Count)  summaryParts.push(`✨ ★★★ 人格 ×${s3Count}`);

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(pullCount === 1 ? `🚂 ${ACTIVE_BANNER.name} — 單抽` : `🚂 ${ACTIVE_BANNER.name} — 十連`)
        .setColor(embedColor)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `收穫：${summaryParts.join('、')}`
                : '「每一次提取，都是向平行世界借調可能性。」',
        })
        .setTimestamp();

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull, ACTIVE_BANNER, BASE_WEIGHTS, ABN_WEIGHTS };
