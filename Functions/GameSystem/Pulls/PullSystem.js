// Functions/GameSystem/Pulls/PullSystem.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

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

    // 先保底避免空池炸掉
    if (!pool0.length && !pool00.length && !pool000.length && !poolEgos.length) {
        return {
            tier: 'empty',
            item: null,
            display: '⚠️ 沒有可抽取的資料',
        };
    }

    if (r < RATES.EGOS && poolEgos.length) {
        const item = pickRandom(poolEgos);
        return {
            tier: 'egos',
            item,
            display: `🔮 ${item}`,
        };
    }

    if (r < RATES.S3 && pool000.length) {
        // 有 Rate Up：50% 機率出 Rate Up 對象
        if (rateUp000.length && Math.random() < 0.5) {
            const item = pickRandom(rateUp000);
            return {
                tier: 's3_up',
                item,
                display: `🌟 ✨ [★★★ Rate Up] ${item}`,
            };
        }

        const item = pickRandom(pool000);
        return {
            tier: 's3',
            item,
            display: `✨ ★★★ ${item}`,
        };
    }

    if (r < RATES.S2 && pool00.length) {
        const item = pickRandom(pool00);
        return {
            tier: 's2',
            item,
            display: `⭐ ★★ ${item}`,
        };
    }

    if (pool0.length) {
        const item = pickRandom(pool0);
        return {
            tier: 's1',
            item,
            display: `▫️ ★ ${item}`,
        };
    }

    // 如果某一池剛好空掉，做最後 fallback
    const fallback =
        poolEgos[0] ||
        pool000[0] ||
        pool00[0] ||
        pool0[0] ||
        null;

    if (!fallback) {
        return {
            tier: 'empty',
            item: null,
            display: '⚠️ 沒有可抽取的資料',
        };
    }

    return {
        tier: 'fallback',
        item: fallback,
        display: `▫️ ${fallback}`,
    };
}

function tierEmoji(tier) {
    if (tier === 'egos')   return '🔮';
    if (tier === 's3_up')  return '🌟';
    if (tier === 's3')     return '✨';
    if (tier === 's2')     return '⭐';
    if (tier === 'empty')  return '⚠️';
    return '▫️';
}

async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;
    const count = Math.max(1, Math.min(Number(pullCount) || 1, 10));

    // 先發「處理中」訊息，讓使用者感受即時回饋
    const typingPromise = message.channel.sendTyping().catch(() => {});

    const draws = Array.from({ length: count }, () => drawOnce());
    const resultLines = draws.map((d, i) => {
        return d.item
            ? `${tierEmoji(d.tier)} \`${i + 1}.\` ${d.display}`
            : `${tierEmoji(d.tier)} \`${i + 1}.\` ${d.display}`;
    });

    // 統計本次稀有
    const s3Count = draws.filter(d => d.tier === 's3' || d.tier === 's3_up').length;
    const egoCount = draws.filter(d => d.tier === 'egos').length;

    const summaryParts = [];
    if (egoCount) summaryParts.push(`🔮 E.G.O ×${egoCount}`);
    if (s3Count)  summaryParts.push(`✨ ★★★ ×${s3Count}`);

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(count === 1 ? '🚂 腦葉物資梅菲斯特號 — 單抽報告' : '🚂 腦葉物資梅菲斯特號 — 十連報告')
        .setColor(egoCount ? 0xa55eea : s3Count ? 0xffd166 : 0xeccc68)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `✨ 本次高稀有：${summaryParts.join('、')}`
                : '「每一次提取，都是向平行世界借調可能性。」',
        })
        .setTimestamp();

    await typingPromise;

    // 存入背包：只能存原始名稱，不要存前綴字串
    const newItems = draws
        .map(d => d.item)
        .filter(Boolean);

    try {
        const inv = loadUserInventory(client, userId) || [];
        saveUserInventory(client, userId, [...inv, ...newItems]);
    } catch (err) {
        console.error('背包儲存失敗:', err.message);
    }

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
