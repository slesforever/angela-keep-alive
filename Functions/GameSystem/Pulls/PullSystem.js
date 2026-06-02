// Functions/GameSystem/Pulls/PullSystem.js
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
    return arr[Math.floor(Math.random() * arr.length)];
}

function drawOnce() {
    const r = Math.random() * 100;
    const pool000    = identitiesData.pool['000']  || [];
    const pool00     = identitiesData.pool['00']   || [];
    const pool0      = identitiesData.pool['0']    || [];
    const poolEgos   = identitiesData.pool['Egos'] || [];
    const rateUp000  = identitiesData.upTargets['000'] || [];

    if (r < RATES.EGOS) {
        return { item: pickRandom(poolEgos), tier: 'egos' };
    }
    if (r < RATES.S3) {
        // 有 Rate Up：50% 機率出 Rate Up 對象
        if (rateUp000.length && Math.random() < 0.5) {
            return { item: `✨ [★★★ Rate Up] ${pickRandom(rateUp000)}`, tier: 's3_up' };
        }
        return { item: `★★★ ${pickRandom(pool000)}`, tier: 's3' };
    }
    if (r < RATES.S2) {
        return { item: `★★ ${pickRandom(pool00)}`, tier: 's2' };
    }
    return { item: `★ ${pickRandom(pool0)}`, tier: 's1' };
}

function tierEmoji(tier) {
    if (tier === 'egos')   return '🔮';
    if (tier === 's3_up')  return '🌟';
    if (tier === 's3')     return '✨';
    if (tier === 's2')     return '⭐';
    return '▫️';
}

async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;

    // 先發「處理中」訊息，讓使用者感受即時回饋
    const typing = message.channel.sendTyping();

    const draws = Array.from({ length: pullCount }, () => drawOnce());
    const resultLines = draws.map((d, i) => `${tierEmoji(d.tier)} \`${i + 1}.\` ${d.item}`);

    // 統計本次稀有
    const s3Count = draws.filter(d => d.tier === 's3' || d.tier === 's3_up').length;
    const egoCount = draws.filter(d => d.tier === 'egos').length;

    const summaryParts = [];
    if (egoCount) summaryParts.push(`🔮 E.G.O ×${egoCount}`);
    if (s3Count)  summaryParts.push(`✨ ★★★ ×${s3Count}`);

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(pullCount === 1 ? '🚂 腦葉物資梅菲斯特號 — 單抽報告' : '🚂 腦葉物資梅菲斯特號 — 十連報告')
        .setColor(egoCount ? 0xa55eea : s3Count ? 0xffd166 : 0xeccc68)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `✨ 本次高稀有：${summaryParts.join('、')}`
                : '「每一次提取，都是向平行世界借調可能性。」',
        })
        .setTimestamp();

    await typing;

    // 非同步存檔（不阻塞回覆）
    const newItems = draws.map(d => d.item);
    loadUserInventory(client, userId)
        .then(inv => saveUserInventory(client, userId, [...inv, ...newItems]))
        .catch(err => console.error('背包儲存失敗:', err.message));

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
