'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');
const ACHIEVEMENTS = [
  { id: 'voice_1h', label: '連續語音 1 小時', labelEn: 'Stay in voice for 1 hour', reward: [100, 20], title: '深夜守望者', progress: p => [Number(p.longestVoiceSessionMinutes) || 0, 60], test: p => Number(p.longestVoiceSessionMinutes) >= 60 },
  { id: 'voice_10h', label: '連續語音 10 小時', labelEn: 'Stay in voice for 10 hours', reward: [500, 100], title: '長夜旅人', progress: p => [Number(p.longestVoiceSessionMinutes) || 0, 600], test: p => Number(p.longestVoiceSessionMinutes) >= 600 },
  { id: 'voice_24h', label: '連續語音 24 小時', labelEn: 'Stay in voice for 24 hours', reward: [2000, 500], title: '永不掉線', progress: p => [Number(p.longestVoiceSessionMinutes) || 0, 1440], test: p => Number(p.longestVoiceSessionMinutes) >= 1440 },
  { id: 'voice_120h', label: '連續語音 120 小時', labelEn: 'Stay in voice for 120 hours', reward: [10000, 2000], title: '不眠的管理員', progress: p => [Number(p.longestVoiceSessionMinutes) || 0, 7200], test: p => Number(p.longestVoiceSessionMinutes) >= 7200 },
  { id: 'msg_10k', label: '傳送 10,000 則訊息', labelEn: 'Send 10,000 messages', reward: [200, 50], title: '消息常客', progress: p => [Number(p.totalMessages) || 0, 10000], test: p => Number(p.totalMessages) >= 10000 },
  { id: 'msg_100k', label: '傳送 100,000 則訊息', labelEn: 'Send 100,000 messages', reward: [1500, 300], title: '傳訊使者', progress: p => [Number(p.totalMessages) || 0, 100000], test: p => Number(p.totalMessages) >= 100000 },
  { id: 'msg_1m', label: '傳送 1,000,000 則訊息', labelEn: 'Send 1,000,000 messages', reward: [8000, 1500], title: '聊天室傳奇', progress: p => [Number(p.totalMessages) || 0, 1000000], test: p => Number(p.totalMessages) >= 1000000 },
  { id: 'msg_10m', label: '傳送 10,000,000 則訊息', labelEn: 'Send 10,000,000 messages', reward: [50000, 10000], title: '訊息永動機', progress: p => [Number(p.totalMessages) || 0, 10000000], test: p => Number(p.totalMessages) >= 10000000 },
  { id: 'dq_streak_14', label: '每日任務連續 14 天', labelEn: 'Complete daily quests for 14 days', reward: [300, 100], title: '每日同行者', progress: p => [Number(p.dailyQuestStreak) || 0, 14], test: p => Number(p.dailyQuestStreak) >= 14 },
  { id: 'hq_25', label: '完成 25 組每小時任務', labelEn: 'Complete 25 hourly quest sets', reward: [200, 50], title: '任務行家', progress: p => [Number(p.hourlyQuestCompletions) || 0, 25], test: p => Number(p.hourlyQuestCompletions) >= 25 },
  { id: 'hq_100', label: '完成 100 組每小時任務', labelEn: 'Complete 100 hourly quest sets', reward: [800, 200], progress: p => [Number(p.hourlyQuestCompletions) || 0, 100], test: p => Number(p.hourlyQuestCompletions) >= 100 },
  { id: 'dq_streak_100', label: '每日任務連續 100 天', labelEn: 'Complete daily quests for 100 days', reward: [3000, 800], title: '任務傳奇', progress: p => [Number(p.dailyQuestStreak) || 0, 100], test: p => Number(p.dailyQuestStreak) >= 100 },
  { id: 'dq_streak_250', label: '每日任務連續 250 天', labelEn: 'Complete daily quests for 250 days', reward: [10000, 2500], title: '每日不懈的管理員', progress: p => [Number(p.dailyQuestStreak) || 0, 250], test: p => Number(p.dailyQuestStreak) >= 250 },
  { id: 'hq_1000', label: '完成 1,000 組每小時任務', labelEn: 'Complete 1,000 hourly quest sets', reward: [20000, 5000], progress: p => [Number(p.hourlyQuestCompletions) || 0, 1000], test: p => Number(p.hourlyQuestCompletions) >= 1000 },
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
    const lang = getLanguage(userId);
    const { getLevelChannel } = require('./LevelSystem.js');
    const channelId = getLevelChannel(guildId);
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const names = unlocked.map(a => '🏆 ' + pick(lang, a.label, a.labelEn)).join('\n');
    await channel.send({ embeds: [new EmbedBuilder()
      .setTitle(pick(lang, '成就解鎖！', 'Achievement unlocked!'))
      .setColor(0xf1c40f)
      .setDescription(pick(lang, `<@${userId}> 解鎖了：\n${names}`, `<@${userId}> unlocked:\n${names}`))
      .setTimestamp()] });
  } catch (error) { console.error('[AchievementSystem] 成就公告失敗:', error.message); }
}
async function checkAchievements(client, userId, username, guildId) {
  const player = getOrCreatePlayer(client, userId, username);
  const state = normalize(player);
  const newlyUnlocked = [];
  let addedTitle = false;
  for (const achievement of ACHIEVEMENTS) {
    const achieved = achievement.test(player);
    if (!state.unlocked.includes(achievement.id) && achieved) {
      state.unlocked.push(achievement.id);
      newlyUnlocked.push(achievement);
    }
    // Backfill titles for milestones unlocked before the title equip system existed.
    if (achieved && achievement.title && !player.achievementTitles.includes(achievement.title)) {
      player.achievementTitles.push(achievement.title);
      addedTitle = true;
    }
  }
  if (newlyUnlocked.length || addedTitle) {
    savePlayerData(client, userId, player);
    if (newlyUnlocked.length) await announce(client, userId, guildId, newlyUnlocked);
  }
  return newlyUnlocked;
}
function formatProgress(item, player, lang, state) {
  const [rawProgress, target] = item.progress ? item.progress(player) : [0, 1];
  const progress = Math.min(Math.max(0, Number(rawProgress) || 0), target);
  const filled = Math.round(progress / Math.max(1, target) * 8);
  const bar = '█'.repeat(filled) + '░'.repeat(8 - filled);
  const label = pick(lang, item.label, item.labelEn);
  const status = state.claimed.includes(item.id) ? '✅' : state.unlocked.includes(item.id) ? '🎁' : '🔒';
  return `${status} **${label}** · ${progress.toLocaleString()}/${target.toLocaleString()}\n\`${bar}\` 🌟 ${item.reward[0]} SC / 🌱 ${item.reward[1]} LS`;
}
function makeView(player, userId, lang) {
  const state = normalize(player);
  const claimable = state.unlocked.filter(id => !state.claimed.includes(id));
  const categories = {
    voice: { label: pick(lang, '🎙️ 語音成就', '🎙️ Voice'), items: [] },
    message: { label: pick(lang, '💬 訊息成就', '💬 Messages'), items: [] },
    quest: { label: pick(lang, '📋 任務成就', '📋 Quests'), items: [] },
  };
  for (const item of ACHIEVEMENTS) {
    const category = item.id.startsWith('voice') ? 'voice'
      : item.id.startsWith('msg') ? 'message' : 'quest';
    categories[category].items.push(item);
  }

  const unlockedCount = ACHIEVEMENTS.filter(item => state.unlocked.includes(item.id)).length;
  const embed = new EmbedBuilder()
    .setTitle(pick(lang, '🏆 成就列表', '🏆 Achievements'))
    .setColor(0xf1c40f)
    .setDescription(pick(
      lang,
      `已解鎖 **${unlockedCount}/${ACHIEVEMENTS.length}** 項 · 🎁 ${claimable.length} 項獎勵待領`,
      `**${unlockedCount}/${ACHIEVEMENTS.length}** unlocked · 🎁 ${claimable.length} reward${claimable.length === 1 ? '' : 's'} ready`,
    ))
    .setFooter({ text: pick(lang, '✅ 已領取 · 🎁 可領取 · 🔒 未解鎖｜稱號可在 /profile 裝備', '✅ Claimed · 🎁 Claimable · 🔒 Locked | Equip titles in /profile') });

  for (const category of Object.values(categories)) {
    const lines = category.items.map(item => formatProgress(item, player, lang, state));
    embed.addFields({ name: category.label, value: lines.join('\n') });
  }
  embed.addFields({
    name: pick(lang, '📊 個人統計', '📊 Your stats'),
    value: pick(
      lang,
      `訊息 **${(Number(player.totalMessages) || 0).toLocaleString()}** · 最長連續語音 **${(Number(player.longestVoiceSessionMinutes) || 0).toLocaleString()} 分鐘** · 每日任務連續 **${Number(player.dailyQuestStreak) || 0} 天**`,
      `Messages **${(Number(player.totalMessages) || 0).toLocaleString()}** · Longest voice **${(Number(player.longestVoiceSessionMinutes) || 0).toLocaleString()} min** · Daily streak **${Number(player.dailyQuestStreak) || 0} days**`,
    ),
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_achievements:' + userId)
      .setLabel(claimable.length
        ? pick(lang, `🎁 領取 ${claimable.length} 個成就獎勵`, `🎁 Claim ${claimable.length} rewards`)
        : pick(lang, '沒有可領取的成就', 'No rewards to claim'))
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimable.length === 0),
  );
  return { embed, row };
}
async function handleAchievements(client, interaction) {
  await checkAchievements(client, interaction.user.id, interaction.user.username, interaction.guildId);
  const refreshed = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
  const view = makeView(refreshed, interaction.user.id, getLanguage(interaction.user.id));
  return interaction.reply({ embeds: [view.embed], components: [view.row], flags: MessageFlags.Ephemeral });
}
async function handleClaim(client, interaction, userId) {
  const lang = getLanguage(interaction.user.id);
  if (interaction.user.id !== userId) return interaction.reply({ content: pick(lang, '這不是你的成就清單。', 'This is not your achievement board.'), flags: MessageFlags.Ephemeral });
  const player = getOrCreatePlayer(client, userId, interaction.user.username);
  const state = normalize(player);
  const ids = state.unlocked.filter(id => !state.claimed.includes(id));
  if (!ids.length) return interaction.reply({ content: pick(lang, '目前沒有可領取的成就獎勵。', 'There are no achievement rewards ready to claim.'), flags: MessageFlags.Ephemeral });
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
  const view = makeView(player, userId, lang);
  return interaction.update({
    embeds: [view.embed],
    components: [view.row],
    content: pick(lang,
      `已領取 ${ids.length} 項成就獎勵：${starCoins} StarCoins、${lightSeeds} LightSeeds。`,
      `Claimed ${ids.length} achievement reward${ids.length === 1 ? '' : 's'}: ${starCoins} StarCoins and ${lightSeeds} LightSeeds.`),
  });
}
function init() {}
module.exports = { init, checkAchievements, handleAchievements, handleClaim, ACHIEVEMENTS };