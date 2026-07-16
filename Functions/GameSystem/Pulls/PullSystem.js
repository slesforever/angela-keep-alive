// Functions/GameSystem/Pulls/PullSystem.js
const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

const RATES = {
    EGOS: 1.5,
    S3:   4.5,  // 000 (1.5 + 3)
    S2:   20.0, // 00  (4.5 + 15.5)
    // S1: 剩餘 80%
};

function pickRandom(arr) {
    // 【防呆】如果 pool 為空或不存在，避免回傳 undefined 造成後續當機
    if (!arr || arr.length === 0) return '未知人格'; 
    return arr[Math.floor(Math.random() * arr.length)];
}

function drawOnce() {
    const r = Math.random() * 100;
    const pool000   = identitiesData.pool['000']  || [];
    const pool00    = identitiesData.pool['00']   || [];
    const pool0     = identitiesData.pool['0']    || [];
    const poolEgos  = identitiesData.pool['Egos'] || [];
    const rateUp000 = identitiesData.upTargets['000'] || [];

    // 抽卡只決定「乾淨的物品名稱 (name)」與「稀有度標籤 (tier)」
    if (r < RATES.EGOS) {
        return { name: pickRandom(poolEgos), tier: 'egos' };
    }
    if (r < RATES.S3) {
        if (rateUp000.length && Math.random() < 0.5) {
            return { name: pickRandom(rateUp000), tier: 's3_up' };
        }
        return { name: pickRandom(pool000), tier: 's3' };
    }
    if (r < RATES.S2) {
        return { name: pickRandom(pool00), tier: 's2' };
    }
    return { name: pickRandom(pool0), tier: 's1' };
}

// 專門處理 Embed 顯示文字的格式化（保持資料庫乾淨，只在前端加料）
function formatItemDisplay(name, tier) {
    if (tier === 'egos')  return `[E.G.O] ${name}`;
    if (tier === 's3_up') return `[★★★ Rate Up] ${name}`;
    if (tier === 's3')    return `[★★★] ${name}`;
    if (tier === 's2')    return `[★★] ${name}`;
    return `[★] ${name}`;
}

function tierEmoji(tier) {
    if (tier === 'egos')  return '🔮';
    if (tier === 's3_up') return '🌟';
    if (tier === 's3')    return '✨';
    if (tier === 's2')    return '⭐';
    return '▫️';
}

async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;
    await message.channel.sendTyping();

    const draws       = Array.from({ length: pullCount }, () => drawOnce());
    
    // 渲染 Discord Embed 中的顯示行數
    const resultLines = draws.map((d, i) => `${tierEmoji(d.tier)} \`${i + 1}.\` ${formatItemDisplay(d.name, d.tier)}`);

    const s3Count  = draws.filter(d => d.tier === 's3' || d.tier === 's3_up').length;
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

    // ── 儲存至背包 ──
    try {
        const rawInv = loadUserInventory(client, userId);
        
        // 【防呆】如果是新玩家，loadUserInventory 可能回傳 null/undefined，此時給予空陣列避免 [...inv] 當機
        const inv = Array.isArray(rawInv) ? rawInv : []; 
        
        // 【重要修正】寫入背包時，只提取「乾淨的原始名稱」，排除 UI 裝飾字元
        const newItems = draws.map(d => d.name);
        saveUserInventory(client, userId, [...inv, ...newItems]);
    } catch (err) {
        console.error('[PullSystem] 背包儲存失敗:', err.message);
    }

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
