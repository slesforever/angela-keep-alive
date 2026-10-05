'use strict';

const {
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
    StringSelectMenuBuilder,
} = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');

const WEEKLY_CHALLENGES = [
    { type: 'voice', target: 300, label: '語音 5 小時', labelEn: 'Spend 5 hours in voice', reward: [250, 50] },
    { type: 'message', target: 500, label: '傳送 500 則訊息', labelEn: 'Send 500 messages', reward: [250, 50] },
    { type: 'command', target: 50, label: '使用 50 次指令', labelEn: 'Use 50 commands', reward: [250, 50] },
    { type: 'mention', target: 30, label: '標記成員 30 次', labelEn: 'Mention members 30 times', reward: [250, 50] },
];

const TITLE_TRANSLATIONS = {
    '不眠的管理員': 'Sleepless Administrator',
    '每日不懈的管理員': 'Daily Devotion',
    '聊天室傳奇': 'Chatroom Legend',
    '訊息永動機': 'Message Machine',
    '深夜守望者': 'Night Watcher',
    '長夜旅人': 'Long-Night Wanderer',
    '永不掉線': 'Always Connected',
    '消息常客': 'Chat Regular',
    '傳訊使者': 'Message Courier',
    '每日同行者': 'Daily Companion',
    '任務行家': 'Quest Specialist',
    '任務傳奇': 'Quest Legend',
};

function taipeiParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function shiftDate(date, days) {
    const value = new Date(date + 'T00:00:00Z');
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function getWeekStart(date = new Date()) {
    const parts = taipeiParts(date);
    const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[parts.weekday] || 0;
    return shiftDate(`${parts.year}-${parts.month}-${parts.day}`, -((day + 6) % 7));
}

function challengeForUser(userId, weekStart) {
    let hash = 2166136261;
    for (const char of `${userId}:${weekStart}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return WEEKLY_CHALLENGES[(hash >>> 0) % WEEKLY_CHALLENGES.length];
}

function ensureWeeklyChallenge(player, userId, now = new Date()) {
    const weekStart = getWeekStart(now);
    if (!player.weeklyChallenge || player.weeklyChallenge.weekStart !== weekStart) {
        const challenge = challengeForUser(userId, weekStart);
        player.weeklyChallenge = {
            weekStart,
            type: challenge.type,
            target: challenge.target,
            progress: 0,
            claimed: false,
        };
    }
    return player.weeklyChallenge;
}

function updateWeeklyChallenge(player, userId, type, amount = 1, now = new Date()) {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const state = ensureWeeklyChallenge(player, userId, now);
    if (state.type !== type || state.progress >= state.target) return false;
    state.progress = Math.min(state.target, (Number(state.progress) || 0) + amount);
    return true;
}

function progressBar(progress, target, width = 10) {
    const ratio = Math.min(1, Math.max(0, Number(progress) || 0) / Math.max(1, Number(target) || 1));
    const filled = Math.round(ratio * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function challengeDescription(challenge, lang) {
    const definition = WEEKLY_CHALLENGES.find(item => item.type === challenge.type) || WEEKLY_CHALLENGES[0];
    const label = pick(lang, definition.label, definition.labelEn);
    const progress = Math.min(Number(challenge.progress) || 0, challenge.target);
    const unit = challenge.type === 'voice' ? pick(lang, '分鐘', 'minutes') : '';
    const current = challenge.type === 'voice'
        ? `${Math.floor(progress / 60)}/${Math.floor(challenge.target / 60)} ${pick(lang, '小時', 'hours')}`
        : `${progress}/${challenge.target}`;
    return { definition, label, progress, unit, current };
}

async function handleCheckin(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const currentDate = taipeiParts();
    const today = `${currentDate.year}-${currentDate.month}-${currentDate.day}`;
    if (player.checkInLastDate === today) {
        return interaction.reply({
            content: pick(lang,
                `你今天已簽到。連續簽到 **${Number(player.checkInStreak) || 1} 天**，明天再來拿獎勵！`,
                `You already checked in today. Your streak is **${Number(player.checkInStreak) || 1} days**—come back tomorrow for the next reward.`),
            flags: MessageFlags.Ephemeral,
        });
    }

    const yesterday = shiftDate(today, -1);
    const streak = player.checkInLastDate === yesterday ? (Number(player.checkInStreak) || 0) + 1 : 1;
    const bonus = Math.min(Math.max(0, streak - 1), 14) * 5;
    const starCoins = 25 + bonus;
    const lightSeeds = 5;
    player.checkInLastDate = today;
    player.checkInStreak = streak;
    player.totalCheckIns = (Number(player.totalCheckIns) || 0) + 1;
    player.starCoins = (Number(player.starCoins) || 0) + starCoins;
    player.lightSeeds = (Number(player.lightSeeds) || 0) + lightSeeds;
    savePlayerData(client, interaction.user.id, player);

    const embed = new EmbedBuilder()
        .setColor(0x55c2a3)
        .setTitle(pick(lang, '🔥 今日簽到完成', '🔥 Daily check-in complete'))
        .setDescription(pick(lang,
            `連續簽到 **${streak} 天**\n獲得 **${starCoins} StarCoins** 與 **${lightSeeds} LightSeeds**${bonus ? `（連續加成 +${bonus} SC）` : ''}`,
            `**${streak}-day streak**\nEarned **${starCoins} StarCoins** and **${lightSeeds} LightSeeds**${bonus ? ` (streak bonus: +${bonus} SC)` : ''}`))
        .setFooter({ text: pick(lang, `台北時間 ${today}｜每日任務可照常領取`, `Taipei date ${today} | Daily quests are separate`) });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function makeWeeklyView(player, userId, lang) {
    const challenge = ensureWeeklyChallenge(player, userId);
    const { definition, label, progress, current } = challengeDescription(challenge, lang);
    const complete = progress >= challenge.target;
    const start = challenge.weekStart;
    const end = shiftDate(start, 6);
    const embed = new EmbedBuilder()
        .setColor(0x7b68ee)
        .setTitle(pick(lang, '📅 本週挑戰', '📅 Weekly challenge'))
        .setDescription([
            `**${label}**`,
            `\`${progressBar(progress, challenge.target)}\`  **${current}**`,
            pick(lang, `週期：${start} 至 ${end}（台北時間）`, `Week: ${start}–${end} (Taipei time)`),
        ].join('\n'))
        .addFields(
            { name: pick(lang, '完成獎勵', 'Completion reward'), value: `🌟 ${definition.reward[0]} SC  ·  🌱 ${definition.reward[1]} LS`, inline: true },
            { name: pick(lang, '狀態', 'Status'), value: challenge.claimed ? pick(lang, '✅ 已領取', '✅ Claimed') : complete ? pick(lang, '🎁 可以領取', '🎁 Ready to claim') : pick(lang, '⏳ 進行中', '⏳ In progress'), inline: true },
        );
    const row = new ActionRowBuilder().addComponents(
        new (require('discord.js').ButtonBuilder)()
            .setCustomId(`claim_weekly:${userId}:${start}`)
            .setLabel(pick(lang, '領取每週獎勵', 'Claim weekly reward'))
            .setStyle(require('discord.js').ButtonStyle.Success)
            .setDisabled(!complete || challenge.claimed),
    );
    return { embed, row };
}

async function handleWeekly(client, interaction) {
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    ensureWeeklyChallenge(player, interaction.user.id);
    savePlayerData(client, interaction.user.id, player);
    const view = makeWeeklyView(player, interaction.user.id, getLanguage(interaction.user.id));
    return interaction.reply({ embeds: [view.embed], components: [view.row], flags: MessageFlags.Ephemeral });
}

async function handleWeeklyClaim(client, interaction, userId, weekStart) {
    const lang = getLanguage(interaction.user.id);
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: pick(lang, '這不是你的每週挑戰。', 'This is not your weekly challenge.'), flags: MessageFlags.Ephemeral });
    }
    const player = getOrCreatePlayer(client, userId, interaction.user.username);
    const challenge = ensureWeeklyChallenge(player, userId);
    if (challenge.weekStart !== weekStart || Number(challenge.progress) < Number(challenge.target) || challenge.claimed) {
        return interaction.reply({ content: pick(lang, '這項每週獎勵目前無法領取。', 'This weekly reward is not available to claim.'), flags: MessageFlags.Ephemeral });
    }
    const definition = WEEKLY_CHALLENGES.find(item => item.type === challenge.type) || WEEKLY_CHALLENGES[0];
    challenge.claimed = true;
    player.starCoins = (Number(player.starCoins) || 0) + definition.reward[0];
    player.lightSeeds = (Number(player.lightSeeds) || 0) + definition.reward[1];
    savePlayerData(client, userId, player);
    const view = makeWeeklyView(player, userId, lang);
    return interaction.update({
        embeds: [view.embed],
        components: [view.row],
        content: pick(lang, `已領取 ${definition.reward[0]} StarCoins 與 ${definition.reward[1]} LightSeeds。`, `Claimed ${definition.reward[0]} StarCoins and ${definition.reward[1]} LightSeeds.`),
    });
}

function titleLabel(title, lang) {
    return lang === 'en' ? (TITLE_TRANSLATIONS[title] || title) : title;
}

function makeProfileView(player, target, lang, isSelf) {
    const totalXp = Math.max(Number(player.xp) || 0, Number(player.exp) || 0);
    let levelData = { level: Number(player.level) || 1, xpIntoLevel: totalXp, xpNeeded: 100 };
    try {
        levelData = require('./LevelSystem.js').getLevelFromXp(totalXp);
    } catch {}
    const unlocked = Array.isArray(player.achievements?.unlocked) ? player.achievements.unlocked.length : 0;
    const titles = Array.isArray(player.achievementTitles) ? player.achievementTitles.filter(title => typeof title === 'string') : [];
    const equippedTitle = titles.includes(player.equippedTitle) ? player.equippedTitle : '';
    const embed = new EmbedBuilder()
        .setColor(0x00b4d8)
        .setTitle(pick(lang, `👤 ${target.username} 的檔案`, `👤 ${target.username}'s profile`))
        .setThumbnail(target.displayAvatarURL?.() || null)
        .addFields(
            { name: pick(lang, '等級', 'Level'), value: `**Lv. ${levelData.level}**`, inline: true },
            { name: pick(lang, '總 XP', 'Total XP'), value: `${totalXp.toLocaleString()} XP`, inline: true },
            { name: pick(lang, '已解鎖成就', 'Achievements'), value: `${unlocked}`, inline: true },
            { name: pick(lang, '裝備稱號', 'Equipped title'), value: equippedTitle ? `🏷️ **${titleLabel(equippedTitle, lang)}**` : pick(lang, '尚未裝備', 'No title equipped'), inline: true },
            { name: pick(lang, '連續簽到', 'Check-in streak'), value: `${Number(player.checkInStreak) || 0} ${pick(lang, '天', 'days')}`, inline: true },
            { name: pick(lang, '每日任務連續完成', 'Daily quest streak'), value: `${Number(player.dailyQuestStreak) || 0} ${pick(lang, '天', 'days')}`, inline: true },
            { name: pick(lang, `下一級進度（${levelData.xpIntoLevel} / ${levelData.xpNeeded} XP）`, `Next level (${levelData.xpIntoLevel} / ${levelData.xpNeeded} XP)`), value: `\`${progressBar(levelData.xpIntoLevel, levelData.xpNeeded)}\``, inline: false },
        )
        .setFooter({ text: pick(lang, '使用 /stats 查看完整活動統計', 'Use /stats for your activity summary') });

    let components = [];
    if (isSelf && titles.length) {
        const options = [
            { label: pick(lang, '不顯示稱號', 'No title'), value: '__none__', description: pick(lang, '清除目前裝備的稱號', 'Unequip your current title') },
            ...titles.slice(0, 24).map(title => ({ label: titleLabel(title, lang).slice(0, 100), value: title.slice(0, 100) })),
        ];
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`profile_title:${target.id}`)
            .setPlaceholder(pick(lang, '裝備一個已解鎖的稱號', 'Equip an unlocked title'))
            .addOptions(options);
        components = [new ActionRowBuilder().addComponents(menu)];
    }
    return { embed, components };
}

async function handleProfile(client, interaction) {
    const target = interaction.options?.getUser('target') || interaction.user;
    const player = getOrCreatePlayer(client, target.id, target.username);
    const lang = getLanguage(interaction.user.id);
    const view = makeProfileView(player, target, lang, target.id === interaction.user.id);
    return interaction.reply({ embeds: [view.embed], components: view.components });
}

async function handleEquipTitle(client, interaction) {
    const ownerId = interaction.customId.slice('profile_title:'.length);
    const lang = getLanguage(interaction.user.id);
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: pick(lang, '只有檔案本人能更換稱號。', 'Only the profile owner can change this title.'), flags: MessageFlags.Ephemeral });
    }
    const player = getOrCreatePlayer(client, ownerId, interaction.user.username);
    const selected = interaction.values?.[0];
    if (selected === '__none__') {
        delete player.equippedTitle;
    } else if (Array.isArray(player.achievementTitles) && player.achievementTitles.includes(selected)) {
        player.equippedTitle = selected;
    } else {
        return interaction.reply({ content: pick(lang, '你尚未解鎖這個稱號。', 'You have not unlocked that title.'), flags: MessageFlags.Ephemeral });
    }
    savePlayerData(client, ownerId, player);
    const view = makeProfileView(player, interaction.user, lang, true);
    return interaction.update({ embeds: [view.embed], components: view.components });
}

function formatVoiceMinutes(value, lang) {
    const minutes = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return lang === 'en'
        ? `${hours}h ${remainder}m`
        : `${hours} 小時 ${remainder} 分鐘`;
}

async function handleStats(client, interaction) {
    const target = interaction.options?.getUser('target') || interaction.user;
    const player = getOrCreatePlayer(client, target.id, target.username);
    const lang = getLanguage(interaction.user.id);
    const unlocked = Array.isArray(player.achievements?.unlocked) ? player.achievements.unlocked.length : 0;
    const totalXp = Math.max(Number(player.xp) || 0, Number(player.exp) || 0);
    const title = player.equippedTitle && Array.isArray(player.achievementTitles) && player.achievementTitles.includes(player.equippedTitle)
        ? titleLabel(player.equippedTitle, lang)
        : pick(lang, '未裝備', 'None equipped');
    const embed = new EmbedBuilder()
        .setColor(0x2d9cdb)
        .setTitle(pick(lang, `📊 ${target.username} 的活動統計`, `📊 ${target.username}'s stats`))
        .setThumbnail(target.displayAvatarURL?.() || null)
        .addFields(
            { name: pick(lang, '訊息', 'Messages'), value: `${(Number(player.totalMessages) || 0).toLocaleString()}`, inline: true },
            { name: pick(lang, '語音時數', 'Voice time'), value: formatVoiceMinutes(player.totalVoiceMinutes, lang), inline: true },
            { name: pick(lang, '總 XP / 等級', 'Total XP / level'), value: `${totalXp.toLocaleString()} XP · Lv.${Number(player.level) || 1}`, inline: true },
            { name: pick(lang, '成就', 'Achievements'), value: `${unlocked}`, inline: true },
            { name: pick(lang, '連續簽到', 'Check-in streak'), value: `${Number(player.checkInStreak) || 0} ${pick(lang, '天', 'days')}`, inline: true },
            { name: pick(lang, '每日任務連續完成', 'Daily quest streak'), value: `${Number(player.dailyQuestStreak) || 0} ${pick(lang, '天', 'days')}`, inline: true },
            { name: pick(lang, '稱號', 'Title'), value: title, inline: false },
        )
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

async function handleVoiceAi(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const enabled = interaction.options?.getBoolean('enabled');
    if (enabled === null || enabled === undefined) {
        const active = player.voiceAiEnabled !== false;
        return interaction.reply({
            content: pick(lang,
                `語音 AI 目前${active ? '已開啟' : '已關閉'}。達到 30 分鐘時會在 AI 頻道（未設定時用伺服器系統頻道）傳送一次鼓勵訊息。可用 \`/voiceai enabled:false\` 關閉。`,
                `Voice AI is currently **${active ? 'on' : 'off'}**. After 30 minutes, it sends one supportive message to the AI channel, falling back to the server system channel. Use \`/voiceai enabled:false\` to opt out.`),
            flags: MessageFlags.Ephemeral,
        });
    }
    player.voiceAiEnabled = enabled;
    savePlayerData(client, interaction.user.id, player);
    return interaction.reply({
        content: pick(lang,
            enabled ? '已開啟語音 AI 鼓勵訊息。' : '已關閉語音 AI 鼓勵訊息。',
            enabled ? 'Voice AI encouragement is on.' : 'Voice AI encouragement is off.'),
        flags: MessageFlags.Ephemeral,
    });
}

async function processVoiceActivity(client, userId, username, guildId, sessionMinutes, elapsedMinutes, currentPlayer = null) {
    const player = currentPlayer || getOrCreatePlayer(client, userId, username);
    const lang = getLanguage(userId);
    let shouldPraise = false;
    let gift = null;

    if (player.voiceAiEnabled !== false && Number(sessionMinutes) >= 30 && !player.voicePraiseSentForSession) {
        player.voicePraiseSentForSession = true;
        shouldPraise = true;
    }

    let rewardMinutes = Math.max(0, Number(player.voiceGiftMinuteRemainder) || 0) + Math.max(0, Number(elapsedMinutes) || 0);
    while (rewardMinutes >= 60) {
        rewardMinutes -= 60;
        if (Math.random() < 0.05) {
            const drops = [
                { starCoins: 100, lightSeeds: 0 },
                { starCoins: 50, lightSeeds: 5 },
                { starCoins: 0, lightSeeds: 10 },
            ];
            gift = drops[Math.floor(Math.random() * drops.length)];
            player.starCoins = (Number(player.starCoins) || 0) + gift.starCoins;
            player.lightSeeds = (Number(player.lightSeeds) || 0) + gift.lightSeeds;
        }
    }
    player.voiceGiftMinuteRemainder = rewardMinutes;
    if (!currentPlayer) savePlayerData(client, userId, player);

    if (shouldPraise) {
        try {
            const channelId = require('./AIChatSystem.js').getAiChannel(guildId);
            const configured = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
            const channel = configured || client.guilds.cache.get(guildId)?.systemChannel;
            if (channel?.isTextBased?.()) {
                const praise = await require('./AIChatSystem.js').generateVoicePraise(lang, 30);
                await channel.send({
                    content: `<@${userId}> ${praise}`,
                    allowedMentions: { users: [userId] },
                });
            }
        } catch (error) {
            console.error('[EngagementSystem] 語音鼓勵訊息失敗:', error.message);
        }
    }

    if (gift) {
        try {
            const guild = client.guilds.cache.get(guildId);
            const aiChannelId = require('./AIChatSystem.js').getAiChannel(guildId);
            const channel = aiChannelId
                ? await client.channels.fetch(aiChannelId).catch(() => null)
                : guild?.systemChannel;
            const details = [
                gift.starCoins ? `🌟 ${gift.starCoins} StarCoins` : '',
                gift.lightSeeds ? `🌱 ${gift.lightSeeds} LightSeeds` : '',
            ].filter(Boolean).join(' + ');
            const content = pick(lang,
                `<@${userId}> 在語音時數寶箱中找到 **${details}**！`,
                `<@${userId}> found **${details}** in a voice-time treasure chest!`);
            if (channel?.isTextBased?.()) {
                await channel.send({ content, allowedMentions: { users: [userId] } });
            } else {
                await client.users.fetch(userId).then(user => user.send(content.replace(`<@${userId}>`, user.username))).catch(() => {});
            }
        } catch (error) {
            console.error('[EngagementSystem] 語音寶箱通知失敗:', error.message);
        }
    }
}

module.exports = {
    ensureWeeklyChallenge,
    updateWeeklyChallenge,
    handleCheckin,
    handleWeekly,
    handleWeeklyClaim,
    handleProfile,
    handleEquipTitle,
    handleStats,
    handleVoiceAi,
    processVoiceActivity,
    titleLabel,
};