// Functions/GameSystem/LevelSystem.js
// 等級系統：打字、語音、戰鬥、鏡牢、關卡 XP + 等級獎勵
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const LEVEL_CONFIG_PATH = path.join(process.cwd(), 'data', 'level-config.json');
const PLAYERS_DIR = path.join(process.cwd(), 'data', 'players');

// 平衡原則：每級少量獎勵，重要里程碑再給一次小額 bonus，避免 XP 變成無限提款機。
const LEVEL_REWARDS = {
    perLevel: { starCoins: 25, lightSeeds: 5 },
    milestones: {
        5:   { starCoins: 50,   lightSeeds: 10 },
        10:  { starCoins: 100,  lightSeeds: 20 },
        15:  { starCoins: 150,  lightSeeds: 30 },
        20:  { starCoins: 250,  lightSeeds: 50 },
        25:  { starCoins: 350,  lightSeeds: 70 },
        50:  { starCoins: 750,  lightSeeds: 150 },
        100: { starCoins: 1500, lightSeeds: 300 },
    },
};

function xpNeededForLevel(level) { return level * 150; }

function getLevelFromXp(totalXp) {
    let level = 0;
    let remaining = Math.max(0, Number(totalXp) || 0);
    while (level < 100) {
        const needed = xpNeededForLevel(level + 1);
        if (remaining < needed) break;
        remaining -= needed;
        level++;
    }
    return { level, xpIntoLevel: remaining, xpNeeded: xpNeededForLevel(level + 1) };
}

function rewardForLevel(level) {
    const milestone = LEVEL_REWARDS.milestones[level] || {};
    return {
        starCoins: LEVEL_REWARDS.perLevel.starCoins + (milestone.starCoins || 0),
        lightSeeds: LEVEL_REWARDS.perLevel.lightSeeds + (milestone.lightSeeds || 0),
    };
}

function grantLevelRewards(player, oldLevel, newLevel) {
    const total = { starCoins: 0, lightSeeds: 0 };
    for (let level = Math.max(1, oldLevel + 1); level <= newLevel; level++) {
        const reward = rewardForLevel(level);
        total.starCoins += reward.starCoins;
        total.lightSeeds += reward.lightSeeds;
    }
    if (total.starCoins || total.lightSeeds) {
        player.starCoins = (player.starCoins || 0) + total.starCoins;
        player.lightSeeds = (player.lightSeeds || 0) + total.lightSeeds;
    }
    return total;
}

function getLevelConfig() {
    try { return fs.existsSync(LEVEL_CONFIG_PATH) ? JSON.parse(fs.readFileSync(LEVEL_CONFIG_PATH, 'utf8')) : {}; }
    catch { return {}; }
}

function saveLevelConfig(config) {
    try { 
        fs.mkdirSync(path.dirname(LEVEL_CONFIG_PATH), { recursive: true }); 
        fs.writeFileSync(LEVEL_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); 
    } catch (err) { 
        console.error('[LevelSystem] 儲存設定失敗:', err.message); 
    }
}

function setLevelChannel(guildId, channelId) { const c = getLevelConfig(); c[guildId] = channelId; saveLevelConfig(c); }
function getLevelChannel(guildId) { return getLevelConfig()[guildId] || null; }

async function announceLevelUp(client, userId, username, newLevel, guildId, rewards = {}) {
    try {
        const channelId = getLevelChannel(guildId);
        if (!channelId) return;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const rewardText = `🌟 +${rewards.starCoins || 0} Starcoins ｜ 🌱 +${rewards.lightSeeds || 0} LightSeeds`;
        await channel.send({ embeds: [new EmbedBuilder()
            .setTitle('⬆️ 等級提升！')
            .setColor(0xf1c40f)
            .setDescription(`🎉 <@${userId}> 升到了 **Lv.${newLevel}**！\n\n獲得等級獎勵：${rewardText}\n\n> 「繼續前進，主管。這條路沒有盡頭。」`)
            .setFooter({ text: '使用 /rank 查看詳細資料，/leaderboard 查看排行榜' })
            .setTimestamp()] });
    } catch (err) { console.error('[LevelSystem] 升級公告失敗:', err.message); }
}

/**
 * 安全獲取玩家當前總經驗值 (雙重相容 exp 與 xp 欄位)
 */
function getPlayerTotalXp(player) {
    if (!player) return 0;
    return Math.max(Number(player.xp) || 0, Number(player.exp) || 0);
}

/**
 * 增加經驗值 (自動相容並同步 xp/exp 兩欄位)
 */
async function addXp(client, userId, username, amount, guildId = null) {
    const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
    const player = getOrCreatePlayer(client, userId, username);
    
    const oldXp = getPlayerTotalXp(player);
    const oldData = getLevelFromXp(oldXp);
    
    const newXp = oldXp + Math.max(0, Number(amount) || 0);
    const newData = getLevelFromXp(newXp);
    
    const rewards = newData.level > oldData.level 
        ? grantLevelRewards(player, oldData.level, newData.level) 
        : { starCoins: 0, lightSeeds: 0 };
    
    // 雙向同步儲存，徹底消除不同模組欄位讀取落差
    player.xp = newXp;
    player.exp = newXp;
    player.level = newData.level;
    
    savePlayerData(client, userId, player);
    if (newData.level > oldData.level && client && guildId) {
        await announceLevelUp(client, userId, username, newData.level, guildId, rewards);
    }
    return { ...newData, rewards };
}

/**
 * 手動救援/設定玩家經驗值工具
 */
function setPlayerXp(client, userId, username, targetXp) {
    const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
    const player = getOrCreatePlayer(client, userId, username);
    const xpVal = Math.max(0, Number(targetXp) || 0);
    const newData = getLevelFromXp(xpVal);
    
    player.xp = xpVal;
    player.exp = xpVal;
    player.level = newData.level;
    
    savePlayerData(client, userId, player);
    return { ...newData, totalXp: xpVal };
}

const messageCooldowns = new Map();
async function handleMessageXp(client, message) {
    if (!message || message.author?.bot || !message.guild) return;
    const userId = message.author.id;
    const now = Date.now();
    if (now - (messageCooldowns.get(userId) || 0) < 60_000) return;
    messageCooldowns.set(userId, now);
    await addXp(client, userId, message.author.username, 2, message.guild.id).catch(() => {});
}

// 使用 guildId:userId 作 key，避免同一玩家在不同伺服器互相覆蓋。
const voiceJoinTimes = new Map();
function voiceKey(userId, guildId) { return `${guildId}:${userId}`; }

function trackVoiceJoin(userId, username, guildId) {
    const key = voiceKey(userId, guildId);
    if (!voiceJoinTimes.has(key)) voiceJoinTimes.set(key, { userId, joinedAt: Date.now(), guildId, username });
}

function trackVoiceLeave(userId, guildId) { voiceJoinTimes.delete(voiceKey(userId, guildId)); }

function bootstrapVoiceTracking(client) {
    let count = 0;
    for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates?.cache?.values?.() || []) {
            const member = state.member || guild.members.cache.get(state.id);
            if (!state.channelId || !member || member.user?.bot) continue;
            trackVoiceJoin(member.id, member.user.username, guild.id);
            count++;
        }
    }
    console.log(`[LevelSystem] 預載 ${count} 位語音成員進入 XP 追蹤`);
    return count;
}

async function processVoiceXpTick(client) {
    const active = new Set();
    for (const guild of client.guilds.cache.values()) {
        for (const state of guild.voiceStates?.cache?.values?.() || []) {
            const member = state.member || guild.members.cache.get(state.id);
            if (!state.channelId || !member || member.user?.bot) continue;
            const key = voiceKey(member.id, guild.id);
            active.add(key);
            trackVoiceJoin(member.id, member.user.username, guild.id);
        }
    }
    for (const key of voiceJoinTimes.keys()) if (!active.has(key)) voiceJoinTimes.delete(key);
    for (const [key, data] of voiceJoinTimes) {
        const minutes = Math.floor((Date.now() - data.joinedAt) / 60_000);
        if (minutes < 1) continue;
        voiceJoinTimes.set(key, { ...data, joinedAt: data.joinedAt + minutes * 60_000 });
        await addXp(client, data.userId, data.username, minutes * 5, data.guildId).catch(err => console.error('[LevelSystem] 語音 XP 失敗:', err.message));
    }
}

function buildRankBar(xpInto, xpNeeded) {
    const pct = Math.min(1, xpInto / Math.max(1, xpNeeded));
    const filled = Math.round(pct * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function handleRank(client, interaction) {
    const target = interaction.options?.getUser('target') || interaction.user;
    const { getOrCreatePlayer } = require('./PacksAndData.js');
    const player = getOrCreatePlayer(client, target.id, target.username);
    const xp = getPlayerTotalXp(player);
    const { level, xpIntoLevel, xpNeeded } = getLevelFromXp(xp);
    const pct = Math.floor((xpIntoLevel / Math.max(1, xpNeeded)) * 100);
    return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`📊 ${target.username} 的等級資料`)
        .setColor(0x00b4d8)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '等級', value: `**Lv.${level}**`, inline: true },
            { name: '總 XP', value: `${xp.toLocaleString()} XP`, inline: true },
            { name: '貨幣', value: `🌟 ${(player.starCoins || 0).toLocaleString()} Starcoins\n🌱 ${(player.lightSeeds || 0).toLocaleString()} LightSeeds`, inline: true },
            { name: `進度到下一級 (${xpIntoLevel} / ${xpNeeded} XP)`, value: `\`[${buildRankBar(xpIntoLevel, xpNeeded)}]\` ${pct}%`, inline: false },
        )
        .setFooter({ text: '打字 +2 XP｜語音每分鐘 +5 XP｜戰鬥/關卡/鏡牢也可獲得 XP' })
        .setTimestamp()] });
}

async function handleLeaderboard(client, interaction) {
    if (!fs.existsSync(PLAYERS_DIR)) return interaction.reply({ content: '目前還沒有任何玩家資料。', ephemeral: true });
    const entries = [];
    for (const file of fs.readdirSync(PLAYERS_DIR)) {
        if (!file.endsWith('.json')) continue;
        try { 
            const p = JSON.parse(fs.readFileSync(path.join(PLAYERS_DIR, file), 'utf8')); 
            const totalXp = Math.max(Number(p.xp) || 0, Number(p.exp) || 0);
            entries.push({ id: file.slice(0, -5), username: p.username || 'Player', xp: totalXp }); 
        } catch {}
    }
    entries.sort((a, b) => b.xp - a.xp);
    if (!entries.length) return interaction.reply({ content: '目前還沒有玩家資料。', ephemeral: true });
    const top = entries.slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((e, i) => `${medals[i] || `**#${i + 1}**`} <@${e.id}> — **${e.xp.toLocaleString()} XP** • Lv.${getLevelFromXp(e.xp).level}`).join('\n');
    const myIdx = entries.findIndex(e => e.id === interaction.user.id);
    const footer = myIdx >= 0 ? `你的排名：第 ${myIdx + 1} / ${entries.length} 名 • ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}` : '未在資料中找到你';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 等級排行榜 — XP TOP 10').setColor(0xf1c40f).setDescription(lines).setFooter({ text: footer }).setTimestamp()] });
}

function startVoiceXpTimer(client) {
    processVoiceXpTick(client).catch(err => console.error('[LevelSystem] 初次語音 XP 失敗:', err.message));
    return setInterval(() => processVoiceXpTick(client).catch(err => console.error('[LevelSystem] 語音 XP 失敗:', err.message)), 60_000);
}

module.exports = {
    addXp,
    setPlayerXp,
    handleMessageXp,
    handleRank,
    handleLeaderboard,
    setLevelChannel,
    getLevelChannel,
    trackVoiceJoin,
    trackVoiceLeave,
    bootstrapVoiceTracking,
    processVoiceXpTick,
    startVoiceXpTimer,
    getLevelFromXp,
    LEVEL_REWARDS,
};
