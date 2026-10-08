// Functions/GameSystem/CheckInSystem.js
// 每日簽到系統：連續簽到加成、與每日任務並存
'use strict';
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');

function todayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function ensureCheckIn(player) {
    player.checkIn = player.checkIn || {};
    player.checkIn.lastDate ??= '';
    player.checkIn.streak ??= 0;
    player.checkIn.totalDays ??= 0;
    player.checkIn.lastReward ??= 0;
    return player.checkIn;
}

// 連續天數獎勵表
const STREAK_REWARDS = [
    { streak: 1, starCoins: 10, lightSeeds: 5, label: '簽到', labelEn: 'Check-in' },
    { streak: 3, starCoins: 30, lightSeeds: 15, label: '連續 3 天', labelEn: '3-day streak' },
    { streak: 7, starCoins: 80, lightSeeds: 40, label: '連續 7 天', labelEn: '7-day streak', bonus: '🎁 額外碎片×5' },
    { streak: 14, starCoins: 150, lightSeeds: 80, label: '連續 14 天', labelEn: '14-day streak', bonus: '🎁 額外卷×3' },
    { streak: 30, starCoins: 500, lightSeeds: 250, label: '連續 30 天', labelEn: '30-day streak', bonus: '🎁 額外碎片×20' },
    { streak: 100, starCoins: 3000, lightSeeds: 1500, label: '連續 100 天', labelEn: '100-day streak', bonus: '🏅 稱號：堅毅的簽到者' },
];

function getRewardForStreak(streak) {
    let best = STREAK_REWARDS[0];
    for (const r of STREAK_REWARDS) {
        if (streak >= r.streak) best = r;
    }
    return best;
}

async function handleCheckIn(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const ci = ensureCheckIn(player);
    const today = todayKey();

    if (ci.lastDate === today) {
        return interaction.reply({
            content: pick(lang,
                `📅 你今天已經簽到過了！目前連續簽到 **${ci.streak}** 天。明天再來吧！`,
                `📅 You've already checked in today! Current streak: **${ci.streak}** days. Come back tomorrow!`),
            flags: MessageFlags.Ephemeral,
        });
    }

    // 判斷是否延續連續
    if (ci.lastDate === yesterdayKey()) {
        ci.streak = (Number(ci.streak) || 0) + 1;
    } else {
        ci.streak = 1;
    }

    ci.lastDate = today;
    ci.totalDays = (Number(ci.totalDays) || 0) + 1;

    const reward = getRewardForStreak(ci.streak);
    let starCoins = reward.starCoins;
    let lightSeeds = reward.lightSeeds;
    let bonusText = reward.bonus || '';

    // 額外獎勵
    if (ci.streak === 100 && !player.achievementTitles?.includes('堅毅的簽到者')) {
        player.achievementTitles = player.achievementTitles || [];
        player.achievementTitles.push('堅毅的簽到者');
    }
    if (ci.streak === 7) { player.fragments = (Number(player.fragments) || 0) + 5; }
    if (ci.streak === 14) { player.expScrolls = (Number(player.expScrolls) || 0) + 3; }
    if (ci.streak === 30) { player.fragments = (Number(player.fragments) || 0) + 20; }

    player.starCoins = (Number(player.starCoins) || 0) + starCoins;
    player.lightSeeds = (Number(player.lightSeeds) || 0) + lightSeeds;
    ci.lastReward = starCoins + lightSeeds;
    savePlayerData(client, interaction.user.id, player);

    // 下個里程碑
    const nextMilestone = STREAK_REWARDS.find(r => r.streak > ci.streak);
    const nextText = nextMilestone
        ? pick(lang, `下一里程碑：連續 ${nextMilestone.streak} 天（還需 ${nextMilestone.streak - ci.streak} 天）`, `Next milestone: ${nextMilestone.streak}-day streak (${nextMilestone.streak - ci.streak} days to go)`)
        : pick(lang, '已達最高里程碑！', 'Highest milestone reached!');

    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(pick(lang, '📅 每日簽到', '📅 Daily Check-in'))
        .setDescription(
            `✅ <@${interaction.user.id}> ${pick(lang, '簽到成功！', 'checked in successfully!')}\n\n` +
            `🔥 ${pick(lang, '連續簽到', 'Current Streak')}: **${ci.streak}** ${pick(lang, '天', 'days')}\n` +
            `📊 ${pick(lang, '累計簽到', 'Total Check-ins')}: **${ci.totalDays}** ${pick(lang, '天', 'days')}\n\n` +
            `🎁 ${pick(lang, '本次獎勵', 'Reward')}: 🌟 **${starCoins}** StarCoins ｜ 🌱 **${lightSeeds}** LightSeeds` +
            (bonusText ? `\n${bonusText}` : '')
        )
        .addFields(
            { name: pick(lang, '🎯 下一個目標', '🎯 Next Goal'), value: nextText, inline: false },
        )
        .setFooter({ text: pick(lang, '每天簽到可獲得更多獎勵！連續天數越多獎勵越豐厚。', 'Check in daily for better rewards! Longer streaks = bigger rewards.') })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

function init() {}

module.exports = { init, handleCheckIn, todayKey, ensureCheckIn, STREAK_REWARDS };
