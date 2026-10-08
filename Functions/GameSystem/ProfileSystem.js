// Functions/GameSystem/ProfileSystem.js
// 個人資料系統：融合 rank + stats，可編輯自我介紹、經驗來源、頭像、稱號
// 每天最多更新 2 次（圖片需 AI 審核）
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');
const { getLevelFromXp, getPlayerTotalXp } = require('./LevelSystem.js');
const { getMarriages, addMarriage } = require('./MarriageSystem.js');

const SUPER_ADMIN_ID = '1330463890122735642';
const PROFILE_UPDATE_LIMIT = 2;
const MAX_BIO_LENGTH = 500;
const MAX_ORIGIN_LENGTH = 300;
const MAX_TITLE_LENGTH = 50;

// ─── 個人資料欄位預設值 ─────────────────────────────────────────
function ensureProfile(player) {
    if (!player.profile || typeof player.profile !== 'object') {
        player.profile = {};
    }
    player.profile.bio ??= '';
    player.profile.origin ??= '';
    player.profile.imageUrl ??= '';
    player.profile.equippedTitle ??= '';
    player.profile.updateHistory ??= [];
    return player.profile;
}

// ─── 每日更新次數計算 ───────────────────────────────────────────
function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getUpdateCountToday(player) {
    const profile = ensureProfile(player);
    const today = getTodayKey();
    return (profile.updateHistory || []).filter(ts => {
        try { return new Date(ts).toISOString().slice(0, 10) === today; }
        catch { return false; }
    }).length;
}

function recordUpdate(player) {
    const profile = ensureProfile(player);
    profile.updateHistory = profile.updateHistory || [];
    profile.updateHistory.push(Date.now());
    // 只保留最近 7 天的紀錄
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    profile.updateHistory = profile.updateHistory.filter(ts => ts > cutoff);
}

// ─── XP 進度條 ──────────────────────────────────────────────────
function buildProgressBar(xpInto, xpNeeded) {
    const pct = Math.min(1, xpInto / Math.max(1, xpNeeded));
    const filled = Math.round(pct * 15);
    return '█'.repeat(filled) + '░'.repeat(15 - filled);
}

// ─── 婚姻狀態摘要 ───────────────────────────────────────────────
function marriageSummary(client, userId, lang) {
    const marriages = getMarriages(userId);
    if (!marriages.length) {
        return pick(lang, '未婚', 'Single');
    }
    const names = marriages.map(m => {
        const partnerId = m.a === userId ? m.b : m.a;
        const user = client.users.cache.get(partnerId);
        const days = Math.floor((Date.now() - m.createdAt) / (24 * 60 * 60 * 1000));
        const dayLabel = pick(lang, `（結婚 ${days} 天）`, `（married ${days} days）`);
        return `<@${partnerId}>${user ? ` (${user.username})` : ''} ${dayLabel}`;
    });
    return names.join('\n');
}

// ─── /profile 指令 ──────────────────────────────────────────────
async function handleProfile(client, interaction) {
    const target = interaction.options?.getUser('target') || interaction.user;
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, target.id, target.username);
    const profile = ensureProfile(player);
    const xp = getPlayerTotalXp(player);
    const { level, xpIntoLevel, xpNeeded } = getLevelFromXp(xp);
    const pct = Math.floor((xpIntoLevel / Math.max(1, xpNeeded)) * 100);

    const marriages = getMarriages(target.id);
    const marriageText = marriageSummary(client, target.id, lang);

    // 稱號
    const titles = player.achievementTitles || [];
    const equippedTitle = profile.equippedTitle || '';

    // XP 來源統計
    const xpSourceLabels = {
        message: pick(lang, '💬 打字', '💬 Messages'),
        voice: pick(lang, '🎙️ 語音', '🎙️ Voice'),
        battle: pick(lang, '⚔️ 戰鬥', '⚔️ Battle'),
        mirror: pick(lang, '🪞 鏡牢', '🪞 Mirror'),
        command: pick(lang, '🎮 指令', '🎮 Commands'),
        other: pick(lang, '📌 其他', '📌 Other'),
    };
    const xpSources = Object.entries(player.xpSources || {})
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${xpSourceLabels[k] || k}: **${Number(v).toLocaleString()}** XP`)
        .join(' ｜ ') || pick(lang, '尚無紀錄', 'No records');

    // 統計數據
    const totalMessages = (Number(player.totalMessages) || 0).toLocaleString();
    const totalVoiceMin = Number(player.totalVoiceMinutes) || 0;
    const voiceHours = Math.floor(totalVoiceMin / 60);
    const voiceRemain = totalVoiceMin % 60;
    const voiceText = `${voiceHours}${pick(lang, '時', 'h')} ${voiceRemain}${pick(lang, '分', 'm')}`;
    const longestVoice = Number(player.longestVoiceSessionMinutes) || 0;
    const longestHours = Math.floor(longestVoice / 60);
    const longestRemain = longestVoice % 60;
    const longestText = `${longestHours}${pick(lang, '時', 'h')} ${longestRemain}${pick(lang, '分', 'm')}`;
    const dqStreak = Number(player.dailyQuestStreak) || 0;

    // 抽卡統計
    const totalPulls = Number(player.totalPulls) || 0;
    const ownedCount = (player.identities || []).length;
    const egoCount = (player.egos || []).length;

    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle(pick(lang, `📋 ${target.username} 的個人資料`, `📋 ${target.username}'s Profile`))
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }));

    if (profile.imageUrl) {
        embed.setImage(profile.imageUrl);
    }

    if (equippedTitle) {
        embed.setDescription(`### 🏅 ${equippedTitle}\n${profile.bio || pick(lang, '*尚未設定自我介紹*', '*No bio set*')}`);
    } else {
        embed.setDescription(profile.bio || pick(lang, '*尚未設定自我介紹*', '*No bio set*'));
    }

    embed.addFields(
        { name: pick(lang, '⭐ 等級', '⭐ Level'), value: `**Lv.${level}**`, inline: true },
        { name: pick(lang, '✨ 總 XP', '✨ Total XP'), value: `${xp.toLocaleString()}`, inline: true },
        { name: pick(lang, '🎮 抽卡次數', '🎮 Total Pulls'), value: `${totalPulls}`, inline: true },
        { name: pick(lang, '🌱 LightSeeds', '🌱 LightSeeds'), value: `${(player.lightSeeds || 0).toLocaleString()}`, inline: true },
        { name: pick(lang, '🌟 StarCoins', '🌟 StarCoins'), value: `${(player.starCoins || 0).toLocaleString()}`, inline: true },
        { name: pick(lang, '🎭 持有人格', '🎭 Identities'), value: `${ownedCount} ${pick(lang, '件', 'items')} ｜ 🔮 EGO: ${egoCount}`, inline: true },
        {
            name: pick(lang, `📈 升級進度 (${xpIntoLevel}/${xpNeeded} XP)`, `📈 Level Progress (${xpIntoLevel}/${xpNeeded} XP)`),
            value: `\`[${buildProgressBar(xpIntoLevel, xpNeeded)}]\` **${pct}%**`,
            inline: false,
        },
        { name: pick(lang, '📊 XP 來源', '📊 XP Sources'), value: xpSources, inline: false },
        { name: pick(lang, '💍 婚姻狀態', '💍 Marriage Status'), value: marriageText, inline: false },
    );

    // 經驗來源
    if (profile.origin) {
        embed.addFields({ name: pick(lang, '📖 經驗來源', '📖 Experience Origin'), value: profile.origin, inline: false });
    }

    // 統計區
    embed.addFields(
        { name: pick(lang, '📊 個人統計', '📊 Personal Stats'), value:
            `${pick(lang, '💬 訊息', '💬 Messages')}: **${totalMessages}**\n` +
            `${pick(lang, '🎙️ 累計語音', '🎙️ Total Voice')}: **${voiceText}**\n` +
            `${pick(lang, '🎙️ 最長連續語音', '🎙️ Longest Voice')}: **${longestText}**\n` +
            `${pick(lang, '🔥 每日任務連續', '🔥 Daily Streak')}: **${dqStreak} ${pick(lang, '天', 'days')}**`,
            inline: false },
    );

    // 稱號列表
    if (titles.length) {
        const titleList = titles.map(t => t === equippedTitle ? `**▸ ${t}**` : `○ ${t}`).join('\n');
        embed.addFields({ name: pick(lang, '🏅 已獲得稱號', '🏅 Titles'), value: titleList, inline: false });
    }

    embed.setFooter({ text: pick(lang, '使用 /updateprofile 編輯你的個人資料（每天最多 2 次）', 'Use /updateprofile to edit your profile (max 2 times/day)') });
    embed.setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// ─── /updateprofile 指令 ────────────────────────────────────────
async function handleUpdateProfile(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const profile = ensureProfile(player);

    const updatesToday = getUpdateCountToday(player);
    if (updatesToday >= PROFILE_UPDATE_LIMIT && interaction.user.id !== SUPER_ADMIN_ID) {
        return interaction.reply({
            content: pick(lang,
                `⏳ 你今天已經更新了 ${updatesToday} 次個人資料，每日上限為 ${PROFILE_UPDATE_LIMIT} 次。請明天再試。`,
                `⏳ You've updated your profile ${updatesToday} times today (daily limit: ${PROFILE_UPDATE_LIMIT}). Try again tomorrow.`),
            flags: MessageFlags.Ephemeral,
        });
    }

    const bio = interaction.options?.getString('bio');
    const origin = interaction.options?.getString('origin');
    const imageUrl = interaction.options?.getString('image_url');
    const title = interaction.options?.getString('title');

    let changed = false;
    const changes = [];

    if (bio !== null && bio !== undefined) {
        if (bio.length > MAX_BIO_LENGTH) {
            return interaction.reply({ content: pick(lang, `❌ 自我介紹上限為 ${MAX_BIO_LENGTH} 字。`, `❌ Bio max length is ${MAX_BIO_LENGTH} characters.`), flags: MessageFlags.Ephemeral });
        }
        profile.bio = bio.trim();
        changed = true;
        changes.push(pick(lang, '自我介紹', 'Bio'));
    }

    if (origin !== null && origin !== undefined) {
        if (origin.length > MAX_ORIGIN_LENGTH) {
            return interaction.reply({ content: pick(lang, `❌ 經驗來源上限為 ${MAX_ORIGIN_LENGTH} 字。`, `❌ Experience origin max length is ${MAX_ORIGIN_LENGTH} characters.`), flags: MessageFlags.Ephemeral });
        }
        profile.origin = origin.trim();
        changed = true;
        changes.push(pick(lang, '經驗來源', 'Experience Origin'));
    }

    if (imageUrl !== null && imageUrl !== undefined) {
        const trimmed = imageUrl.trim();
        // 簡單 URL 驗證
        if (trimmed && !trimmed.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i)) {
            return interaction.reply({ content: pick(lang, '❌ 圖片網址必須是 http/https 開頭，且結尾為 .jpg/.png/.gif/.webp', '❌ Image URL must start with http/https and end with .jpg/.png/.gif/.webp'), flags: MessageFlags.Ephemeral });
        }
        // AI 審核模擬：這裡應該呼叫 AI 審核圖片，目前先以基本檢查放行
        // TODO: 接上 Gemini Vision API 審核圖片內容
        profile.imageUrl = trimmed;
        changed = true;
        changes.push(pick(lang, '個人圖片', 'Profile Image'));
    }

    if (title !== null && title !== undefined) {
        const titles = player.achievementTitles || [];
        if (title.trim() === '') {
            profile.equippedTitle = '';
            changed = true;
            changes.push(pick(lang, '稱號（已卸下）', 'Title (unequipped)'));
        } else if (title.length > MAX_TITLE_LENGTH) {
            return interaction.reply({ content: pick(lang, `❌ 稱號上限為 ${MAX_TITLE_LENGTH} 字。`, `❌ Title max length is ${MAX_TITLE_LENGTH} characters.`), flags: MessageFlags.Ephemeral });
        } else if (!titles.includes(title)) {
            return interaction.reply({ content: pick(lang, `❌ 你尚未獲得此稱號。可用稱號：${titles.join(', ') || '無'}`, `❌ You don't have this title. Available: ${titles.join(', ') || 'none'}`), flags: MessageFlags.Ephemeral });
        } else {
            profile.equippedTitle = title;
            changed = true;
            changes.push(pick(lang, '稱號', 'Title'));
        }
    }

    if (!changed) {
        return interaction.reply({ content: pick(lang, '❌ 沒有提供任何要更新的欄位。', '❌ No fields provided to update.'), flags: MessageFlags.Ephemeral });
    }

    recordUpdate(player);
    savePlayerData(client, interaction.user.id, player);

    return interaction.reply({
        content: pick(lang,
            `✅ 個人資料已更新：${changes.join('、')}（今日已更新 ${getUpdateCountToday(player)}/${PROFILE_UPDATE_LIMIT} 次）`,
            `✅ Profile updated: ${changes.join(', ')} (${getUpdateCountToday(player)}/${PROFILE_UPDATE_LIMIT} updates today)`),
        flags: MessageFlags.Ephemeral,
    });
}

// ─── /title 指令（裝備/卸下稱號）────────────────────────────────
async function handleTitle(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const profile = ensureProfile(player);
    const titles = player.achievementTitles || [];

    if (!titles.length) {
        return interaction.reply({ content: pick(lang, '❌ 你尚未獲得任何稱號。完成成就來解鎖稱號！', '❌ You have no titles yet. Unlock achievements to earn titles!'), flags: MessageFlags.Ephemeral });
    }

    const action = interaction.options?.getString('action') || 'list';
    const titleName = interaction.options?.getString('name');

    if (action === 'list') {
        const lines = titles.map(t => {
            const equipped = t === profile.equippedTitle;
            return `${equipped ? '**▸' : '○'} ${t}${equipped ? pick(lang, ' (裝備中)', ' (equipped)') : ''}`;
        });
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle(pick(lang, '🏅 你的稱號', '🏅 Your Titles'))
                .setColor(0xf1c40f)
                .setDescription(lines.join('\n'))
                .setFooter({ text: pick(lang, '使用 /title action:equip name:稱號 來裝備', 'Use /title action:equip name:title to equip') })],
            flags: MessageFlags.Ephemeral,
        });
    }

    if (action === 'equip') {
        if (!titleName || !titles.includes(titleName)) {
            return interaction.reply({ content: pick(lang, `❌ 無效的稱號。可用：${titles.join(', ')}`, `❌ Invalid title. Available: ${titles.join(', ')}`), flags: MessageFlags.Ephemeral });
        }
        profile.equippedTitle = titleName;
        savePlayerData(client, interaction.user.id, player);
        return interaction.reply({ content: pick(lang, `✅ 已裝備稱號：**${titleName}**`, `✅ Equipped title: **${titleName}**`), flags: MessageFlags.Ephemeral });
    }

    if (action === 'unequip') {
        profile.equippedTitle = '';
        savePlayerData(client, interaction.user.id, player);
        return interaction.reply({ content: pick(lang, '✅ 已卸下稱號。', '✅ Title unequipped.'), flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    handleProfile,
    handleUpdateProfile,
    handleTitle,
    ensureProfile,
    recordUpdate,
    getUpdateCountToday,
};
