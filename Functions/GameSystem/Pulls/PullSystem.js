// Functions/GameSystem/Pulls/PullSystem.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { getOrCreatePlayer, savePlayerData, loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

const PULL_COST_PER_DRAW = 0;

// 各稀有度機率（累計）
const RATES = {
    EGOS: 1.5,
    S3:   4.5,   // 000 (1.5 + 3)
    S2:   20.0,  // 00  (4.5 + 15.5)
    // S1: 剩餘 80%
};

function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function getPools() {
    return {
        pool000: Array.isArray(identitiesData?.pool?.['000']) ? identitiesData.pool['000'] : [],
        pool00: Array.isArray(identitiesData?.pool?.['00']) ? identitiesData.pool['00'] : [],
        pool0: Array.isArray(identitiesData?.pool?.['0']) ? identitiesData.pool['0'] : [],
        poolEgos: Array.isArray(identitiesData?.pool?.['Egos']) ? identitiesData.pool['Egos'] : [],
        rateUp000: Array.isArray(identitiesData?.upTargets?.['000']) ? identitiesData.upTargets['000'] : [],
    };
}

function drawOnce() {
    const r = Math.random() * 100;
    const { pool000, pool00, pool0, poolEgos, rateUp000 } = getPools();

    if (r < RATES.EGOS && poolEgos.length) {
        const item = pickRandom(poolEgos);
        return { item, tier: 'egos', display: `🔮 ${item}` };
    }

    if (r < RATES.S3 && pool000.length) {
        if (rateUp000.length && Math.random() < 0.5) {
            const item = pickRandom(rateUp000);
            return { item, tier: 's3_up', display: `🌟 ✨ [★★★ Rate Up] ${item}` };
        }
        const item = pickRandom(pool000);
        return { item, tier: 's3', display: `✨ ★★★ ${item}` };
    }

    if (r < RATES.S2 && pool00.length) {
        const item = pickRandom(pool00);
        return { item, tier: 's2', display: `⭐ ★★ ${item}` };
    }

    if (pool0.length) {
        const item = pickRandom(pool0);
        return { item, tier: 's1', display: `▫️ ★ ${item}` };
    }

    const fallback = poolEgos[0] || pool000[0] || pool00[0] || pool0[0] || null;
    if (!fallback) {
        return { item: null, tier: 'empty', display: '⚠️ 沒有可抽取的資料' };
    }

    return { item: fallback, tier: 'fallback', display: `▫️ ${fallback}` };
}

function tierEmoji(tier) {
    if (tier === 'egos') return '🔮';
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

    const s3Count = draws.filter(d => d.tier === 's3' || d.tier === 's3_up').length;
    const egoCount = draws.filter(d => d.tier === 'egos').length;

    const summaryParts = [];
    if (egoCount) summaryParts.push(`🔮 E.G.O ×${egoCount}`);
    if (s3Count) summaryParts.push(`✨ ★★★ ×${s3Count}`);

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(count === 1 ? '🚂 腦葉物資梅菲斯特號 — 單抽報告' : '🚂 腦葉物資梅菲斯特號 — 十連報告')
        .setColor(egoCount ? 0xa55eea : s3Count ? 0xffd166 : 0xeccc68)
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
