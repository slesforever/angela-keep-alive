'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { getOrCreatePlayer, savePlayerData, loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

const PULL_COST_PER_DRAW = 0;

// ─── 獨立機率設定（非累計機率，直覺且極易調整） ──────────────────────────
// 所有機率加起來不超過 100%，剩餘的機率會自動分配給 1星(0) 
const PROBABILITIES = {
    SPECIAL: 0.3,       // Special 隱藏池 (0.3%)
    COLOR_FIXER: 0.0013,   // 特色收尾人 (0.0013%)
    S4: 0.7,            // 0000 稀有度 (0.7%)
    EGOS: 1.5,          // E.G.O (1.5%)
    S3: 2.9,            // 000 (3.0%)
    S2: 15.0,           // 00  (15.0%)
    // S1 (0): 剩餘的 79.6%
};

function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── 擴充獲取所有池子的資料 ───────────────────────────
function getPools() {
    return {
        poolSpecial: Array.isArray(identitiesData?.pool?.['Special']) ? identitiesData.pool['Special'] : [],
        poolColorFixer: Array.isArray(identitiesData?.pool?.['Color Fixer']) ? identitiesData.pool['Color Fixer'] : [],
        pool0000: Array.isArray(identitiesData?.pool?.['0000']) ? identitiesData.pool['0000'] : [],
        poolEgos: Array.isArray(identitiesData?.pool?.['Egos']) ? identitiesData.pool['Egos'] : [],
        pool000: Array.isArray(identitiesData?.pool?.['000']) ? identitiesData.pool['000'] : [],
        pool00: Array.isArray(identitiesData?.pool?.['00']) ? identitiesData.pool['00'] : [],
        pool0: Array.isArray(identitiesData?.pool?.['0']) ? identitiesData.pool['0'] : [],
        
        // Rate Up 判定 (過濾掉 null)
        rateUpColorFixer: Array.isArray(identitiesData?.upTargets?.['Color Fixer']) ? identitiesData.upTargets['Color Fixer'].filter(Boolean) : [],
        rateUp000: Array.isArray(identitiesData?.upTargets?.['000']) ? identitiesData.upTargets['000'].filter(Boolean) : [],
        rateUpEgos: Array.isArray(identitiesData?.upTargets?.['Egos']) ? identitiesData.upTargets['Egos'].filter(Boolean) : [],
    };
}

function drawOnce() {
    const r = Math.random() * 100;
    const pools = getPools();
    let cumulative = 0;

    // 1. Special 隱藏池
    cumulative += PROBABILITIES.SPECIAL;
    if (r < cumulative && pools.poolSpecial.length) {
        const item = pickRandom(pools.poolSpecial);
        return { item, tier: 'special', display: `🌀 ［SPECIAL］${item}` };
    }

    // 2. Color Fixer 特色收尾人 (支援 Rate Up 判定)
    cumulative += PROBABILITIES.COLOR_FIXER;
    if (r < cumulative && pools.poolColorFixer.length) {
        if (pools.rateUpColorFixer.length && Math.random() < 0.5) {
            const item = pickRandom(pools.rateUpColorFixer);
            return { item, tier: 'color_fixer_up', display: `🔴 🌟 [Color Fixer Rate Up] ${item}` };
        }
        const item = pickRandom(pools.poolColorFixer);
        return { item, tier: 'color_fixer', display: `🔴 🟥 ${item}` };
    }

    // 3. 0000 稀有度
    cumulative += PROBABILITIES.S4;
    if (r < cumulative && pools.pool0000.length) {
        const item = pickRandom(pools.pool0000);
        return { item, tier: 's4', display: `🏮 ★★★★ ${item}` };
    }

    // 4. EGOS (支援 Rate Up 判定)
    cumulative += PROBABILITIES.EGOS;
    if (r < cumulative && pools.poolEgos.length) {
        if (pools.rateUpEgos.length && Math.random() < 0.5) {
            const item = pickRandom(pools.rateUpEgos);
            return { item, tier: 'egos_up', display: `🔮 🌟 [E.G.O Rate Up] ${item}` };
        }
        const item = pickRandom(pools.poolEgos);
        return { item, tier: 'egos', display: `🔮 ${item}` };
    }

    // 5. S3 (支援 Rate Up 判定)
    cumulative += PROBABILITIES.S3;
    if (r < cumulative && pools.pool000.length) {
        if (pools.rateUp000.length && Math.random() < 0.5) {
            const item = pickRandom(pools.rateUp000);
            return { item, tier: 's3_up', display: `🌟 ✨ [★★★ Rate Up] ${item}` };
        }
        const item = pickRandom(pools.pool000);
        return { item, tier: 's3', display: `✨ ★★★ ${item}` };
    }

    // 6. S2
    cumulative += PROBABILITIES.S2;
    if (r < cumulative && pools.pool00.length) {
        const item = pickRandom(pools.pool00);
        return { item, tier: 's2', display: `⭐ ★★ ${item}` };
    }

    // 7. S1 (其餘約 79.6% 比例)
    if (pools.pool0.length) {
        const item = pickRandom(pools.pool0);
        return { item, tier: 's1', display: `▫️ ★ ${item}` };
    }

    // 兜底防錯機制
    const fallback = pools.pool000[0] || pools.pool00[0] || pools.pool0[0] || null;
    if (!fallback) {
        return { item: null, tier: 'empty', display: '⚠️ 沒有可抽取的資料' };
    }
    return { item: fallback, tier: 'fallback', display: `▫️ ${fallback}` };
}

function tierEmoji(tier) {
    if (tier === 'special') return '🌀';
    if (tier === 'color_fixer' || tier === 'color_fixer_up') return '🔴';
    if (tier === 's4') return '🏮';
    if (tier === 'egos' || tier === 'egos_up') return '🔮';
    if (tier === 's3_up') return '🌟';
    if (tier === 's3') return '✨';
    if (tier === 's2') return '⭐';
    if (tier === 'empty') return '⚠️';
    return '▫️';
}

async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;
    const count = Math.max(1, Math.min(Number(pullCount) || 1, 10));
    const cost = PULL_COST_PER_DRAW * count;

    const player = getOrCreatePlayer(client, userId, message.author.username);
    player.lunacy ??= 0;

    if (player.lunacy < cost) {
        return message.reply(`❌ 狂氣不足！\n本次需要 **${cost}** lunacy，你目前只有 **${player.lunacy}**。`);
    }

    player.lunacy -= cost;
    savePlayerData(client, userId, player);

    await message.channel.sendTyping().catch(() => {});

    const draws = Array.from({ length: count }, () => drawOnce());
    const resultLines = draws.map((d, i) => `${tierEmoji(d.tier)} \`${i + 1}.\` ${d.display}`);

    // 統計抽卡結果
    const specialCount = draws.filter(d => d.tier === 'special').length;
    const colorFixerCount = draws.filter(d => d.tier === 'color_fixer' || d.tier === 'color_fixer_up').length;
    const s4Count = draws.filter(d => d.tier === 's4').length;
    const egoCount = draws.filter(d => d.tier === 'egos' || d.tier === 'egos_up').length;
    const s3Count = draws.filter(d => d.tier === 's3' || d.tier === 's3_up').length;

    const summaryParts = [];
    if (specialCount) summaryParts.push(`🌀 SPECIAL ×${specialCount}`);
    if (colorFixerCount) summaryParts.push(`🔴 Color Fixer ×${colorFixerCount}`);
    if (s4Count) summaryParts.push(`🏮 ★★★★ ×${s4Count}`);
    if (egoCount) summaryParts.push(`🔮 E.G.O ×${egoCount}`);
    if (s3Count) summaryParts.push(`✨ ★★★ ×${s3Count}`);

    // 根據最高稀有度決定 Embed 顏色
    let embedColor = 0xeccc68;
    if (specialCount) embedColor = 0x1abc9c;       // 青色
    else if (colorFixerCount) embedColor = 0xff7675; // 亮紅
    else if (s4Count) embedColor = 0xd63031;         // 深紅
    else if (egoCount) embedColor = 0xa55eea;        // 紫色
    else if (s3Count) embedColor = 0xffd166;         // 金黃

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(count === 1 ? '🚂 腦葉物資梅菲斯特號 — 單抽報告' : '🚂 腦葉物資梅菲斯特號 — 十連報告')
        .setColor(embedColor)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `✨ 本次高稀有：${summaryParts.join('、')} ｜ 消耗 ${cost} lunacy`
                : `「每一次提取，都是向平行世界借調可能性。」｜ 消耗 ${cost} lunacy`,
        })
        .setTimestamp();

    const newItems = draws.map(d => d.item).filter(Boolean);

    try {
        const inv = loadUserInventory(client, userId) || [];
        saveUserInventory(client, userId, [...inv, ...newItems]);
    } catch (err) {
        console.error('背包儲存失敗:', err.message);
    }

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
