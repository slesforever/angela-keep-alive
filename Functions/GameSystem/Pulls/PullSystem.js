// Functions/GameSystem/Pulls/PullSystem.js
// 抽卡系統 — 新機率 + 異想體(Abnormality)2段抽 + 卡池分類
'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

// =====================================================
// 🎯 活躍卡池設定 — 直接在此修改 rateUp 來更換 UP 池
// 複製下方格式可新增卡池
// =====================================================
const ACTIVE_BANNER = {
    name:        '標準提取 — 梅菲斯特號',
    description: '所有人格均可出現，無限制提取。',
    rateUp: {
        // S3 UP：填入人格全名（格式需與 identitiesData pool 一致）
        S3: [],
        // S4 UP（如有）
        S4: [],
    },
};

// ─── 機率設定 ─────────────────────────────────────────────────
// 注意：Abnormality 抽中後另行 2 段抽
const BASE_WEIGHTS = {
    COLOR_FIXER:  0.001,   // 0.001%
    ABN:          0.15,    // 0.15% → 觸發異想體子抽
    SPECIAL:      0.30,    // 0.3%
    S4:           0.50,    // 0.5%
    EGOS:         1.50,    // 1.5%
    S3:           2.90,    // 2.9%
    S2:          15.00,    // 15.0%
    S1:          79.649,   // 剩餘（100 - 以上總和）
};

// 異想體子抽機率（合計應為 100%）
const ABN_WEIGHTS = {
    ABN_ZAYIN:  40.0,
    ABN_TETH:   30.0,
    ABN_HE:     17.5,
    ABN_WAW:    10.0,
    ABN_ALEPH:   2.0,
    ABN_ANGELA:  0.5,
};

// ─── 稀有度設定 ──────────────────────────────────────────────
const TIER_CONFIGS = {
    COLOR_FIXER: { poolKeys: ['ColorFixer', 'Color_Fixer', 'Color Fixer'], label: 'Color Fixer', emoji: '🔴', color: 0xff3838, shardValue: 10 },
    ABN_ANGELA:  { poolKeys: ['ABN_ANGELA'],            label: '[LC] ANGELA', emoji: '🕊️', color: 0xffffff, shardValue: 20 },
    ABN_ALEPH:   { poolKeys: ['ABN_ALEPH'],             label: '異想體 ALEPH', emoji: '🟣', color: 0x9b59b6, shardValue: 15 },
    ABN_WAW:     { poolKeys: ['ABN_WAW'],               label: '異想體 WAW',   emoji: '🔵', color: 0x3498db, shardValue: 10 },
    ABN_HE:      { poolKeys: ['ABN_HE'],                label: '異想體 HE',    emoji: '🟢', color: 0x2ecc71, shardValue: 8 },
    ABN_TETH:    { poolKeys: ['ABN_TETH'],              label: '異想體 TETH',  emoji: '🟡', color: 0xf1c40f, shardValue: 5 },
    ABN_ZAYIN:   { poolKeys: ['ABN_ZAYIN'],             label: '異想體 ZAYIN', emoji: '⚪', color: 0xbdc3c7, shardValue: 3 },
    SPECIAL:     { poolKeys: ['Special'],               label: 'Special',     emoji: '🌌', color: 0x2ed573, shardValue: 5 },
    S4:          { poolKeys: ['0000', 'S4'],            label: '★★★★',        emoji: '👑', color: 0xffa502, shardValue: 5 },
    S3:          { poolKeys: ['000', 'S3'],             label: '★★★',         emoji: '✨', color: 0xffd166, shardValue: 3 },
    EGOS:        { poolKeys: ['Egos', 'EGOS'],          label: 'E.G.O',       emoji: '🔮', color: 0xa55eea, shardValue: 2 },
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

// ─── 核心抽卡邏輯 ─────────────────────────────────────────────
function drawOnce(userInventory = []) {
    // 1. 主抽
    const rolledTier = weightedDraw(BASE_WEIGHTS);

    let finalTier = rolledTier;

    // 2. 異想體子抽
    if (rolledTier === 'ABN') {
        finalTier = weightedDraw(ABN_WEIGHTS);
    }

    const config = TIER_CONFIGS[finalTier];
    if (!config) {
        // fallback to S1
        finalTier = 'S1';
    }

    let name = '';

    // S3 Rate Up 處理
    if (finalTier === 'S3' && ACTIVE_BANNER.rateUp.S3?.length && Math.random() < 0.5) {
        name = pickRandom(ACTIVE_BANNER.rateUp.S3) || pickRandom(getPool('S3')) || '未知人格';
    } else if (finalTier === 'S4' && ACTIVE_BANNER.rateUp.S4?.length && Math.random() < 0.5) {
        name = pickRandom(ACTIVE_BANNER.rateUp.S4) || pickRandom(getPool('S4')) || '未知人格';
    } else {
        const pool = getPool(finalTier);
        name = (pool.length ? pickRandom(pool) : null) || `[${TIER_CONFIGS[finalTier]?.label || finalTier}] 未知個體`;
    }

    const isDuplicate = userInventory.includes(name);
    const cfg = TIER_CONFIGS[finalTier] || TIER_CONFIGS.S1;

    return {
        name,
        tier: finalTier,
        isAbn: rolledTier === 'ABN',
        isDuplicate,
        shardValue: cfg.shardValue,
        emoji: cfg.emoji,
        label: cfg.label,
        color: cfg.color,
    };
}

// ─── 顯示格式 ─────────────────────────────────────────────────
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

    for (let i = 0; i < pullCount; i++) {
        const result = drawOnce(tempInv);
        draws.push(result);
        if (!result.isDuplicate) tempInv.push(result.name);
    }

    // 入庫（重複 → 碎片）
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

    // 顯示色：取最高稀有度
    const TIER_PRIORITY = ['COLOR_FIXER', 'ABN_ANGELA', 'ABN_ALEPH', 'ABN_WAW', 'ABN_HE', 'ABN_TETH', 'ABN_ZAYIN', 'SPECIAL', 'S4', 'EGOS', 'S3', 'S2', 'S1'];
    let embedColor = 0xeccc68;
    for (const t of TIER_PRIORITY) {
        if (draws.some(d => d.tier === t)) {
            embedColor = TIER_CONFIGS[t]?.color || embedColor;
            break;
        }
    }

    const highCount   = draws.filter(d => ['COLOR_FIXER', 'ABN_ANGELA', 'ABN_ALEPH', 'ABN_WAW', 'SPECIAL', 'S4'].includes(d.tier)).length;
    const s3Count     = draws.filter(d => d.tier === 'S3').length;
    const abnCount    = draws.filter(d => d.isAbn).length;
    const egoCount    = draws.filter(d => d.tier === 'EGOS').length;

    const summaryParts = [];
    if (highCount) summaryParts.push(`🔴 高稀有 ×${highCount}`);
    if (abnCount)  summaryParts.push(`🔮 異想體 ×${abnCount}`);
    if (s3Count)   summaryParts.push(`✨ ★★★ ×${s3Count}`);
    if (egoCount)  summaryParts.push(`🔮 E.G.O ×${egoCount}`);

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(pullCount === 1 ? `🚂 ${ACTIVE_BANNER.name} — 單抽` : `🚂 ${ACTIVE_BANNER.name} — 十連`)
        .setColor(embedColor)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `✨ 本次收穫：${summaryParts.join('、')}`
                : '「每一次提取，都是向平行世界借調可能性。」',
        })
        .setTimestamp();

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull, ACTIVE_BANNER, BASE_WEIGHTS, ABN_WEIGHTS };
