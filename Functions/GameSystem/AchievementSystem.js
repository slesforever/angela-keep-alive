'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const ACHIEVEMENTS = [
  { id: 'voice_1h', label: '連續語音 1 小時', reward: [100, 20], test: p => Number(p.longestVoiceSessionMinutes) >= 60 },
  { id: 'voice_10h', label: '連續語音 10 小時', reward: [500, 100], test: p => Number(p.longestVoiceSessionMinutes) >= 600 },
  { id: 'voice_24h', label: '連續語音 24 小時', reward: [2000, 500], test: p => Number(p.longestVoiceSessionMinutes) >= 1440 },
  { id: 'voice_120h', label: '連續語音 120 小時', reward: [10000, 2000], title: '不眠的管理員', test: p => Number(p.longestVoiceSessionMinutes) >= 7200 },
  { id: 'msg_10k', label: '傳送 10,000 則訊息', reward: [200, 50], test: p => Number(p.totalMessages) >= 10000 },
  { id: 'msg_100k', label: '傳送 100,000 則訊息', reward: [1500, 300], test: p => Number(p.totalMessages) >= 100000 },
  { id: 'msg_1m', label: '傳送 1,000,000 則訊息', reward: [8000, 1500], test: p => Number(p.totalMessages) >= 1000000 },
  { id: 'msg_10m', label: '傳送 10,000,000 則訊息', reward: [50000, 10000], test: p => Number(p.totalMessages) >= 10000000 },
  { id: 'dq_streak_14', label: '每日任務連續 14 天', reward: [300, 100], test: p => Number(p.dailyQuestStreak) >= 14 },
  { id: 'hq_25', label: '完成 25 組每小時任務', reward: [200, 50], test: p => Number(p.hourlyQuestCompletions) >= 25 },
  { id: 'hq_100', label: '完成 100 組每小時任務', reward: [800, 200], test: p => Number(p.hourlyQuestCompletions) >= 100 },
  { id: 'dq_streak_100', label: '每日任務連續 100 天', reward: [3000, 800], test: p => Number(p.dailyQuestStreak) >= 100 },
  { id: 'dq_streak_250', label: '每日任務連續 250 天', reward: [10000, 2500], title: '每日不懈的管理員', test: p => Number(p.dailyQuestStreak) >= 250 },
  { id: 'hq_1000', label: '完成 1,000 組每小時任務', reward: [20000, 5000], test: p => Number(p.hourlyQuestCompletions) >= 1000 },
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
    const names = unlocked.map(a => '🏆 ' + a.label).join('\n');
    await channel.send({ embeds: [new EmbedBuilder().setTitle('成就解鎖！').setColor(0xf1c40f).setDescription('<@' + userId + '> 解鎖了：\n' + names).setTimestamp()] });
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
      if (achievement.title && !player.achievementTitles.includes(achievement.title)) player.achievementTitles.push(achievement.title);
    }
  }
  if (newlyUnlocked.length) {
    savePlayerData(client, userId, player);
    await announce(client, userId, guildId, newlyUnlocked);
  }
  return newlyUnlocked;
}
function statusLine(item, state) {
  if (state.claimed.includes(item.id)) return '✅ **已領取** — ' + item.label;
  if (state.unlocked.includes(item.id)) return '🎁 **可領取** — ' + item.label;
  return '🔒 ' + item.label;
}
function makeView(player) {
  const state = normalize(player);
  const claimable = state.unlocked.filter(id => !state.claimed.includes(id));
  const lines = ACHIEVEMENTS.map(item => statusLine(item, state) + ' (' + item.reward[0] + ' SC / ' + item.reward[1] + ' LS)');
  const embed = new EmbedBuilder().setTitle('🏆 成就').setColor(0xf1c40f)
    .setDescription(lines.join('\n'))
    .addFields({ name: '統計', value: '訊息：' + (Number(player.totalMessages) || 0).toLocaleString() + '｜最長連續語音：' + (Number(player.longestVoiceSessionMinutes) || 0) + ' 分鐘' });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_achievements:' + player.discordId).setLabel('領取所有成就獎勵').setStyle(ButtonStyle.Success).setDisabled(claimable.length === 0));
  return { embed, row };
}
async function handleAchievements(client, interaction) {
  const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
  await checkAchievements(client, interaction.user.id, interaction.user.username, interaction.guildId);
  const view = makeView(player);
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
  const view = makeView(player);
  return interaction.update({ embeds: [view.embed], components: [view.row], content: '已領取 ' + ids.length + ' 項成就獎勵：' + starCoins + ' StarCoins、' + lightSeeds + ' LightSeeds。' });
}
function init() {}
module.exports = { init, checkAchievements, handleAchievements, handleClaim, ACHIEVEMENTS };