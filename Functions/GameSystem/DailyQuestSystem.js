'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const QUESTS = {
  message: { label: '發送訊息', daily: 30, hourly: 8, unit: '則' },
  voice: { label: '語音停留', daily: 20, hourly: 5, unit: '分鐘' },
  mention: { label: '標記其他成員', daily: 3, hourly: 1, unit: '次' },
  command: { label: '使用斜線指令', daily: 5, hourly: 2, unit: '次' },
};
function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { date: values.year + '-' + values.month + '-' + values.day, hour: values.hour };
}
function shiftDate(date, amount) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
function shuffledTypes() {
  const types = Object.keys(QUESTS);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types.slice(0, 3);
}
function makeSet(period) {
  return shuffledTypes().map(type => ({ type, target: QUESTS[type][period], progress: 0, done: false }));
}
function ensureState(player, now = new Date()) {
  const current = taipeiParts(now);
  if (!player.dailyQuest || player.dailyQuest.date !== current.date) {
    player.dailyQuest = { date: current.date, quests: makeSet('daily'), streak: Number(player.dailyQuestStreak) || 0, claimed: false };
  }
  const countDate = player.hourlyQuestCountDate === current.date;
  const count = countDate ? Number(player.hourlyQuestCountToday) || 0 : 0;
  if (!player.hourlyQuest || player.hourlyQuest.date !== current.date || player.hourlyQuest.hour !== current.hour) {
    player.hourlyQuest = { date: current.date, hour: current.hour, quests: makeSet('hourly'), count, claimed: false };
  }
  player.hourlyQuest.count = count;
  return { current, daily: player.dailyQuest, hourly: player.hourlyQuest };
}
function applyProgress(set, type, amount) {
  let changed = false;
  for (const item of set) {
    if (item.type !== type || item.done) continue;
    item.progress = Math.min(item.target, (Number(item.progress) || 0) + amount);
    item.done = item.progress >= item.target;
    changed = true;
  }
  return changed;
}
function allDone(set) { return Array.isArray(set) && set.length > 0 && set.every(item => item.done); }
async function progress(client, userId, username, guildId, type, amount = 1) {
  if (!QUESTS[type] || !Number.isFinite(amount) || amount <= 0) return false;
  const player = getOrCreatePlayer(client, userId, username);
  const state = ensureState(player);
  const changed = Boolean(applyProgress(state.daily.quests, type, amount) | applyProgress(state.hourly.quests, type, amount));
  if (!changed) return false;
  savePlayerData(client, userId, player);
  if (allDone(state.daily.quests) || allDone(state.hourly.quests)) {
    require('./AchievementSystem.js').checkAchievements(client, userId, username, guildId).catch(() => {});
  }
  return true;
}
function renderQuest(set) {
  return set.map(item => {
    const def = QUESTS[item.type];
    return (item.done ? '✅ ' : '▫️ ') + def.label + '：' + Math.min(item.progress, item.target) + '/' + item.target + ' ' + def.unit;
  }).join('\n');
}
function makeView(player, userId) {
  const state = ensureState(player);
  const streak = Number(player.dailyQuestStreak) || 0;
  const dailyReady = !state.daily.claimed && allDone(state.daily.quests);
  const hourlyReady = !state.hourly.claimed && allDone(state.hourly.quests);
  const embed = new EmbedBuilder().setTitle('📜 每日與每時任務').setColor(0x5865f2)
    .setDescription('今日任務（台北時間 ' + state.current.date + '）\n' + renderQuest(state.daily.quests) + '\n\n本小時任務（' + state.current.hour + ':00 起）\n' + renderQuest(state.hourly.quests))
    .addFields({ name: '連續完成每日任務', value: streak + ' 天' }, { name: '今日完成每小時任務', value: String(state.hourly.count) + ' 組' }, { name: '獎勵', value: '每日：50 StarCoins + 10 LightSeeds；連續天數每多 1 天加 5 StarCoins（最多加 150）。每小時：10 StarCoins + 2 LightSeeds。' });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_quests:' + userId).setLabel('領取已完成任務獎勵').setStyle(ButtonStyle.Success).setDisabled(!dailyReady && !hourlyReady));
  return { embed, row };
}
async function handleDailyQuest(client, interaction) {
  const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
  ensureState(player);
  savePlayerData(client, interaction.user.id, player);
  const view = makeView(player, interaction.user.id);
  return interaction.reply({ embeds: [view.embed], components: [view.row], flags: MessageFlags.Ephemeral });
}
async function handleClaim(client, interaction, userId) {
  if (interaction.user.id !== userId) return interaction.reply({ content: '這不是你的任務清單。', flags: MessageFlags.Ephemeral });
  const player = getOrCreatePlayer(client, userId, interaction.user.username);
  const state = ensureState(player);
  let starCoins = 0;
  let lightSeeds = 0;
  const messages = [];
  if (!state.daily.claimed && allDone(state.daily.quests)) {
    const today = state.current.date;
    const last = player.dailyQuestLastClaimDate;
    const streak = last === shiftDate(today, -1) ? (Number(player.dailyQuestStreak) || 0) + 1 : 1;
    player.dailyQuestStreak = streak;
    player.dailyQuestLastClaimDate = today;
    state.daily.streak = streak;
    state.daily.claimed = true;
    const bonus = Math.min(Math.max(0, streak - 1), 30) * 5;
    starCoins += 50 + bonus;
    lightSeeds += 10;
    messages.push('每日任務：50 StarCoins + 10 LightSeeds，連續天數加成 +' + bonus + ' StarCoins');
  }
  if (!state.hourly.claimed && allDone(state.hourly.quests)) {
    state.hourly.claimed = true;
    state.hourly.count = (Number(state.hourly.count) || 0) + 1;
    player.hourlyQuestCountDate = state.current.date;
    player.hourlyQuestCountToday = state.hourly.count;
    player.hourlyQuestCompletions = (Number(player.hourlyQuestCompletions) || 0) + 1;
    starCoins += 10;
    lightSeeds += 2;
    messages.push('每小時任務：10 StarCoins + 2 LightSeeds');
  }
  if (!messages.length) return interaction.reply({ content: '目前沒有可領取的完整任務獎勵。', flags: MessageFlags.Ephemeral });
  player.starCoins = (Number(player.starCoins) || 0) + starCoins;
  player.lightSeeds = (Number(player.lightSeeds) || 0) + lightSeeds;
  savePlayerData(client, userId, player);
  await require('./AchievementSystem.js').checkAchievements(client, userId, interaction.user.username, interaction.guildId).catch(() => {});
  const view = makeView(player, userId);
  return interaction.update({ embeds: [view.embed], components: [view.row], content: '已領取：' + messages.join('；') + '。合計 ' + starCoins + ' StarCoins、' + lightSeeds + ' LightSeeds。' });
}
function init(client) {
  client.on('messageCreate', message => {
    if (!message.guild || message.author?.bot) return;
    const name = message.member?.displayName || message.author.username;
    progress(client, message.author.id, name, message.guild.id, 'message').catch(error => console.error('[DailyQuestSystem] 訊息進度失敗:', error.message));
    if (message.mentions?.users?.size) progress(client, message.author.id, name, message.guild.id, 'mention').catch(error => console.error('[DailyQuestSystem] 標記進度失敗:', error.message));
  });
  client.on('interactionCreate', interaction => {
    if (!interaction.isChatInputCommand?.() || !interaction.guild || interaction.user?.bot) return;
    const name = interaction.member?.displayName || interaction.user.username;
    progress(client, interaction.user.id, name, interaction.guild.id, 'command').catch(error => console.error('[DailyQuestSystem] 指令進度失敗:', error.message));
  });
}
module.exports = { init, progress, handleDailyQuest, handleClaim, ensureState, QUESTS };