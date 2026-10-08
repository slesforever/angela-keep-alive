// Functions/GameSystem/AchievementSystem.js
// 成就系統：解鎖、領取獎勵、稱號、美觀 UI
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');

const ACHIEVEMENTS = [
  { id: 'voice_1h', label: '連續語音 1 小時', labelEn: 'Voice 1 hour straight', reward: [100, 20], cat: 'voice', test: p => Number(p.longestVoiceSessionMinutes) >= 60, progress: p => Math.min(1, (Number(p.longestVoiceSessionMinutes) || 0) / 60) },
  { id: 'voice_10h', label: '連續語音 10 小時', labelEn: 'Voice 10 hours straight', reward: [500, 100], cat: 'voice', test: p => Number(p.longestVoiceSessionMinutes) >= 600, progress: p => Math.min(1, (Number(p.longestVoiceSessionMinutes) || 0) / 600) },
  { id: 'voice_24h', label: '連續語音 24 小時', labelEn: 'Voice 24 hours straight', reward: [2000, 500], cat: 'voice', test: p => Number(p.longestVoiceSessionMinutes) >= 1440, progress: p => Math.min(1, (Number(p.longestVoiceSessionMinutes) || 0) / 1440) },
  { id: 'voice_120h', label: '連續語音 120 小時', labelEn: 'Voice 120 hours straight', reward: [10000, 2000], cat: 'voice', title: '不眠的管理員', titleEn: 'The Sleepless Keeper', test: p => Number(p.longestVoiceSessionMinutes) >= 7200, progress: p => Math.min(1, (Number(p.longestVoiceSessionMinutes) || 0) / 7200) },
  { id: 'msg_10k', label: '傳送 10,000 則訊息', labelEn: 'Send 10,000 messages', reward: [200, 50], cat: 'message', test: p => Number(p.totalMessages) >= 10000, progress: p => Math.min(1, (Number(p.totalMessages) || 0) / 10000) },
  { id: 'msg_100k', label: '傳送 100,000 則訊息', labelEn: 'Send 100,000 messages', reward: [1500, 300], cat: 'message', test: p => Number(p.totalMessages) >= 100000, progress: p => Math.min(1, (Number(p.totalMessages) || 0) / 100000) },
  { id: 'msg_1m', label: '傳送 1,000,000 則訊息', labelEn: 'Send 1,000,000 messages', reward: [8000, 1500], cat: 'message', test: p => Number(p.totalMessages) >= 1000000, progress: p => Math.min(1, (Number(p.totalMessages) || 0) / 1000000) },
  { id: 'msg_10m', label: '傳送 10,000,000 則訊息', labelEn: 'Send 10,000,000 messages', reward: [50000, 10000], cat: 'message', test: p => Number(p.totalMessages) >= 10000000, progress: p => Math.min(1, (Number(p.totalMessages) || 0) / 10000000) },
  { id: 'dq_streak_14', label: '每日任務連續 14 天', labelEn: 'Daily quest 14-day streak', reward: [300, 100], cat: 'quest', test: p => Number(p.dailyQuestStreak) >= 14, progress: p => Math.min(1, (Number(p.dailyQuestStreak) || 0) / 14) },
  { id: 'hq_25', label: '完成 25 組每小時任務', labelEn: 'Complete 25 hourly quests', reward: [200, 50], cat: 'quest', test: p => Number(p.hourlyQuestCompletions) >= 25, progress: p => Math.min(1, (Number(p.hourlyQuestCompletions) || 0) / 25) },
  { id: 'hq_100', label: '完成 100 組每小時任務', labelEn: 'Complete 100 hourly quests', reward: [800, 200], cat: 'quest', test: p => Number(p.hourlyQuestCompletions) >= 100, progress: p => Math.min(1, (Number(p.hourlyQuestCompletions) || 0) / 100) },
  { id: 'dq_streak_100', label: '每日任務連續 100 天', labelEn: 'Daily quest 100-day streak', reward: [3000, 800], cat: 'quest', test: p => Number(p.dailyQuestStreak) >= 100, progress: p => Math.min(1, (Number(p.dailyQuestStreak) || 0) / 100) },
  { id: 'dq_streak_250', label: '每日任務連續 250 天', labelEn: 'Daily quest 250-day streak', reward: [10000, 2500], cat: 'quest', title: '每日不懈的管理員', titleEn: 'The Relentless Keeper', test: p => Number(p.dailyQuestStreak) >= 250, progress: p => Math.min(1, (Number(p.dailyQuestStreak) || 0) / 250) },
  { id: 'hq_1000', label: '完成 1,000 組每小時任務', labelEn: 'Complete 1,000 hourly quests', reward: [20000, 5000], cat: 'quest', test: p => Number(p.hourlyQuestCompletions) >= 1000, progress: p => Math.min(1, (Number(p.hourlyQuestCompletions) || 0) / 1000) },
];

function normalize(player) {
  player.achievements = player.achievements && typeof player.achievements === 'object' ? player.achievements : {};
  player.achievements.unlocked = Array.isArray(player.achievements.unlocked) ? player.achievements.unlocked : [];
  player.achievements.claimed = Array.isArray(player.achievements.claimed) ? player.achievements.claimed : [];
  player.achievementTitles = Array.isArray(player.achievementTitles) ? player.achievementTitles : [];
  return player.achievements;
}

async function announce(client, userId, guildId, unlocked) {
  if (!client || !guildId || !unlocked.length) return;
  try {
    const { getLevelChannel } = require('./LevelSystem.js');
    const channelId = getLevelChannel(guildId);
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const lang = getLanguage(userId);
    const fields = unlocked.map(a => {
      const reward = `🌟 ${a.reward[0]} SC ｜ 🌱 ${a.reward[1]} LS`;
      const titleNote = a.title ? `\n🏅 ${pick(lang, '獲得稱號', 'New title')}: **${pick(lang, a.title, a.titleEn)}**` : '';
      return { name: `🏆 ${pick(lang, a.label, a.labelEn)}`, value: `${reward}${titleNote}`, inline: false };
    });
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(pick(lang, '🎉 成就解鎖！', '🎉 Achievement Unlocked!'))
        .setColor(0xf1c40f)
        .setDescription(`<@${userId}> ${pick(lang, '解鎖了以下成就：', 'unlocked the following achievements:')}`)
        .addFields(fields)
        .setTimestamp()]
    });
  } catch (error) { console.error('[AchievementSystem] 成就公告失敗:', error.message); }
}

async function checkAchievements(client, userId, username, guildId) {
  const player = getOrCreatePlayer(client, userId, username);
  const state = normalize(player);
  const newlyUnlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!state.unlocked.includes(achievement.id) && achievement.test(player)) {
      state.unlocked.push(achievement.id);
      newlyUnlocked.push(achievement);
      if (achievement.title && !player.achievementTitles.includes(achievement.title)) {
        player.achievementTitles.push(achievement.title);
      }
    }
  }
  if (newlyUnlocked.length) {
    savePlayerData(client, userId, player);
    await announce(client, userId, guildId, newlyUnlocked);
  }
  return newlyUnlocked;
}

function progressBar(ratio) {
  const filled = Math.round(ratio * 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

const CATEGORY_INFO = {
  voice: { icon: '🎙️', label: '語音成就', labelEn: 'Voice' },
  message: { icon: '💬', label: '訊息成就', labelEn: 'Messages' },
  quest: { icon: '📋', label: '任務成就', labelEn: 'Quests' },
};

function statusIcon(item, state) {
  if (state.claimed.includes(item.id)) return '✅';
  if (state.unlocked.includes(item.id)) return '🎁';
  return '🔒';
}

function makeView(player, userId) {
  const state = normalize(player);
  const lang = getLanguage(userId);
  const claimable = state.unlocked.filter(id => !state.claimed.includes(id));
  const unlockedCount = state.unlocked.length;
  const totalCount = ACHIEVEMENTS.length;
  const claimedCount = state.claimed.length;
  const overallProgress = unlockedCount / totalCount;

  const embed = new EmbedBuilder()
    .setTitle(pick(lang, '🏆 成就系統', '🏆 Achievements'))
    .setColor(0xf1c40f)
    .setDescription(
      `${progressBar(overallProgress)} **${Math.floor(overallProgress * 100)}%**\n` +
      `${pick(lang, '已解鎖', 'Unlocked')}: **${unlockedCount}**/${totalCount} ｜ ${pick(lang, '已領取', 'Claimed')}: **${claimedCount}** ｜ ${pick(lang, '可領取', 'Claimable')}: **${claimable.length}**`
    )
    .setFooter({ text: pick(lang, '✅ 已領取 · 🎁 可領取 · 🔒 未解鎖 ｜ 使用 /profile 查看稱號', '✅ Claimed · 🎁 Claimable · 🔒 Locked ｜ Use /profile to view titles') });

  for (const [catKey, catInfo] of Object.entries(CATEGORY_INFO)) {
    const items = ACHIEVEMENTS.filter(a => a.cat === catKey);
    if (!items.length) continue;

    const lines = items.map(item => {
      const icon = statusIcon(item, state);
      const label = pick(lang, item.label, item.labelEn);
      const reward = `\`🌟${item.reward[0]} 🌱${item.reward[1]}\``;
      const titleTag = item.title ? ` 🏅` : '';

      if (state.unlocked.includes(item.id)) {
        return `${icon} **${label}**${titleTag} ${reward}`;
      }

      const ratio = item.progress ? item.progress(player) : 0;
      const pct = Math.floor(ratio * 100);
      return `${icon} ${label}${titleTag} ${reward}\n     \`${progressBar(ratio)}\` ${pct}%`;
    });

    embed.addFields({
      name: `${catInfo.icon} ${pick(lang, catInfo.label, catInfo.labelEn)}`,
      value: lines.join('\n\n'),
      inline: false,
    });
  }

  // 個人統計
  const totalMessages = (Number(player.totalMessages) || 0).toLocaleString();
  const totalVoiceMin = Number(player.totalVoiceMinutes) || 0;
  const voiceH = Math.floor(totalVoiceMin / 60);
  const voiceM = totalVoiceMin % 60;
  const longestVoice = Number(player.longestVoiceSessionMinutes) || 0;
  const lH = Math.floor(longestVoice / 60);
  const lM = longestVoice % 60;
  const dqStreak = Number(player.dailyQuestStreak) || 0;

  embed.addFields({
    name: pick(lang, '📊 個人統計', '📊 Your Stats'),
    value:
      `💬 ${pick(lang, '訊息', 'Messages')}: **${totalMessages}**\n` +
      `🎙️ ${pick(lang, '累計語音', 'Total Voice')}: **${voiceH}${pick(lang, '時', 'h')} ${voiceM}${pick(lang, '分', 'm')}**\n` +
      `🎙️ ${pick(lang, '最長連續語音', 'Longest Voice')}: **${lH}${pick(lang, '時', 'h')} ${lM}${pick(lang, '分', 'm')}**\n` +
      `🔥 ${pick(lang, '每日任務連續', 'Daily Streak')}: **${dqStreak} ${pick(lang, '天', 'days')}**`,
    inline: false,
  });

  // 稱號
  const titles = player.achievementTitles || [];
  if (titles.length) {
    const equipped = player.profile?.equippedTitle || '';
    const titleLines = titles.map(t => t === equipped ? `**▸ ${t}** (${pick(lang, '裝備中', 'equipped')})` : `○ ${t}`);
    embed.addFields({
      name: pick(lang, '🏅 已獲得稱號', '🏅 Earned Titles'),
      value: titleLines.join('\n'),
      inline: false,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_achievements:' + userId)
      .setLabel(claimable.length
        ? pick(lang, `🎁 領取 ${claimable.length} 個獎勵`, `🎁 Claim ${claimable.length} rewards`)
        : pick(lang, '沒有可領取的獎勵', 'No rewards to claim'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimable.length === 0)
  );
  return { embed, row };
}

async function handleAchievements(client, interaction) {
  const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
  await checkAchievements(client, interaction.user.id, interaction.user.username, interaction.guildId);
  const refreshed = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
  const view = makeView(refreshed, interaction.user.id);
  return interaction.reply({ embeds: [view.embed], components: [view.row], flags: MessageFlags.Ephemeral });
}

async function handleClaim(client, interaction, userId) {
  if (interaction.user.id !== userId) return interaction.reply({ content: '這不是你的成就清單。', flags: MessageFlags.Ephemeral });
  const player = getOrCreatePlayer(client, userId, interaction.user.username);
  const state = normalize(player);
  const ids = state.unlocked.filter(id => !state.claimed.includes(id));
  if (!ids.length) return interaction.reply({ content: '目前沒有可領取的成就獎勵。', flags: MessageFlags.Ephemeral });
  let starCoins = 0;
  let lightSeeds = 0;
  for (const id of ids) {
    const achievement = ACHIEVEMENTS.find(item => item.id === id);
    if (!achievement) continue;
    starCoins += achievement.reward[0];
    lightSeeds += achievement.reward[1];
    state.claimed.push(id);
  }
  player.starCoins = (Number(player.starCoins) || 0) + starCoins;
  player.lightSeeds = (Number(player.lightSeeds) || 0) + lightSeeds;
  savePlayerData(client, userId, player);
  const view = makeView(player, userId);
  return interaction.update({ embeds: [view.embed], components: [view.row], content: `✅ 已領取 ${ids.length} 項成就獎勵：🌟 ${starCoins} StarCoins、🌱 ${lightSeeds} LightSeeds。` });
}

function init() {}

module.exports = { init, checkAchievements, handleAchievements, handleClaim, ACHIEVEMENTS };
