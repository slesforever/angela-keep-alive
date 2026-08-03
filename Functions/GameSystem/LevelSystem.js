// Functions/GameSystem/LevelSystem.js
// 等級系統 — 打字/語音/戰鬥/鏡牢/關卡 都可獲得 XP
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const LEVEL_CONFIG_PATH = path.join(process.cwd(), 'data', 'level-config.json');

// ─── XP 公式 ──────────────────────────────────────────────────
// 升到下一級所需 XP = 當前等級 × 150（最高 100 級）
function xpNeededForLevel(level) {
    return level * 150;
}

function getLevelFromXp(totalXp) {
    let level = 0;
    let remaining = totalXp;
    while (level < 100) {
        const needed = xpNeededForLevel(level + 1);
        if (remaining < needed) break;
        remaining -= needed;
        level++;
    }
    return { level, xpIntoLevel: remaining, xpNeeded: xpNeededForLevel(level + 1) };
}

// ─── 設定檔 ───────────────────────────────────────────────────
function getLevelConfig() {
    try {
        if (fs.existsSync(LEVEL_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(LEVEL_CONFIG_PATH, 'utf8'));
        }
    } catch {}
    return {};
}

function saveLevelConfig(config) {
    try {
        fs.mkdirSync(path.dirname(LEVEL_CONFIG_PATH), { recursive: true });
        fs.writeFileSync(LEVEL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        console.error('[LevelSystem] 儲存設定失敗:', err.message);
    }
}

function setLevelChannel(guildId, channelId) {
    const config = getLevelConfig();
    config[guildId] = channelId;
    saveLevelConfig(config);
}

function getLevelChannel(guildId) {
    return getLevelConfig()[guildId] || null;
}

// ─── 升級公告 ────────────────────────────────────────────────
async function announceLevelUp(client, userId, username, newLevel, guildId) {
    try {
        const channelId = getLevelChannel(guildId);
        if (!channelId) return;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const levelMilestones = {
            10: '「精神脈衝穩定性顯著提升。繼續保持主管。」',
            25: '「您正在突破系統預設的精神閾值。令人振奮。」',
            50: '「達到 50 級……安潔菈預測您的路還很長。」',
            75: '「75 級。普通罪人走不到這裡的。」',
            100: '「100 級。您已超越了安潔菈的預期上限。」',
        };
        const msg = levelMilestones[newLevel] || '「繼續前進，主管。這條路沒有盡頭。」';

        await channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('⬆️ 等級提升！')
                .setColor(0xf1c40f)
                .setDescription(`🎉 <@${userId}> 升到了 **Lv.${newLevel}**！\n\n> ${msg}`)
                .setFooter({ text: '使用 /rank 查看詳細等級資料' })
                .setTimestamp()]
        });
    } catch (err) {
        console.error('[LevelSystem] 升級公告失敗:', err.message);
    }
}

// ─── 加 XP 核心函式 ──────────────────────────────────────────
async function addXp(client, userId, username, amount, guildId = null) {
    // 懶加載避免循環依賴
    const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
    const player = getOrCreatePlayer(null, userId, username);

    const oldXp = player.xp || 0;
    const newXp = oldXp + amount;
    player.xp = newXp;

    const oldData = getLevelFromXp(oldXp);
    const newData = getLevelFromXp(newXp);

    savePlayerData(null, userId, player);

    if (newData.level > oldData.level && client && guildId) {
        await announceLevelUp(client, userId, username, newData.level, guildId);
    }

    return newData;
}

// ─── 打字 XP（每 60 秒最多一次）─────────────────────────────
const messageCooldowns = new Map();

async function handleMessageXp(client, message) {
    if (!message || message.author?.bot) return;
    const userId = message.author.id;
    const now = Date.now();
    if (now - (messageCooldowns.get(userId) || 0) < 60_000) return;
    messageCooldowns.set(userId, now);

    await addXp(client, userId, message.author.username, 2, message.guild?.id).catch(() => {});
}

// ─── 語音 XP 追蹤 ────────────────────────────────────────────
const voiceJoinTimes = new Map(); // userId -> { joinedAt, guildId, username }

function trackVoiceJoin(userId, username, guildId) {
    voiceJoinTimes.set(userId, { joinedAt: Date.now(), guildId, username });
}

function trackVoiceLeave(userId) {
    voiceJoinTimes.delete(userId);
}

// 每分鐘呼叫一次，給在語音的玩家加 XP
async function processVoiceXpTick(client) {
    for (const [userId, data] of voiceJoinTimes) {
        const minutesPassed = (Date.now() - data.joinedAt) / 60_000;
        if (minutesPassed >= 1) {
            const xp = Math.floor(minutesPassed) * 5;
            voiceJoinTimes.set(userId, { ...data, joinedAt: Date.now() });
            await addXp(client, userId, data.username, xp, data.guildId).catch(() => {});
        }
    }
}

// ─── /rank 指令 ───────────────────────────────────────────────
function buildRankBar(xpInto, xpNeeded) {
    const pct = Math.min(1, xpInto / Math.max(1, xpNeeded));
    const filled = Math.round(pct * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function handleRank(client, interaction) {
    const target = interaction.options?.getUser('target') || interaction.user;
    const { getOrCreatePlayer } = require('./PacksAndData.js');
    const player = getOrCreatePlayer(null, target.id, target.username);
    const xp = player.xp || 0;
    const { level, xpIntoLevel, xpNeeded } = getLevelFromXp(xp);
    const pct = Math.floor((xpIntoLevel / Math.max(1, xpNeeded)) * 100);

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${target.username} 的等級資料`)
        .setColor(0x00b4d8)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '等級', value: `**Lv.${level}**`, inline: true },
            { name: '總 XP', value: `${xp.toLocaleString()} XP`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            {
                name: `進度到下一級 (${xpIntoLevel} / ${xpNeeded} XP)`,
                value: `\`[${buildRankBar(xpIntoLevel, xpNeeded)}]\` ${pct}%`,
                inline: false,
            },
        )
        .setFooter({ text: '打字 +2 XP｜語音每分鐘 +5 XP｜戰鬥/關卡/鏡牢也可獲得 XP' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// 啟動語音 XP 定時器（每 60 秒）
function startVoiceXpTimer(client) {
    setInterval(() => processVoiceXpTick(client).catch(console.error), 60_000);
}

module.exports = {
    addXp,
    handleMessageXp,
    handleRank,
    setLevelChannel,
    getLevelChannel,
    trackVoiceJoin,
    trackVoiceLeave,
    startVoiceXpTimer,
};
