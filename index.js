'use strict';

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [全域安全攔截] 未處理的 Promise 拒絕：', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ [全域安全攔截] 未捕獲的例外事件：', err);
});

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const identitiesData = require('./identitiesData.js');

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID || '1330463890122735642';
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const RATEUP_ANNOUNCE_CHANNEL_ID = process.env.RATEUP_ANNOUNCE_CHANNEL_ID || '1510153086281187330';
const PING_ROLE_ID = process.env.PING_ROLE_ID || '1406984068725211177';
const PING_ROLE_MENTION = `<@&${PING_ROLE_ID}>`;
const TARGET_USER = {
  username: process.env.TWITTER_USERNAME || 'LimbusCompany_B',
  displayName: process.env.TWITTER_DISPLAY_NAME || '邊獄公司 (Limbus Company) 官方最新公告',
};
const CHECK_INTERVAL_MS = 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const DAILY_BASE_REWARD = 130;
const DAILY_STREAK_BONUS = 1;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'players.json');

const NITTER_NODES = (process.env.NITTER_NODES || 'https://nitter.net,https://nitter.poast.org,https://nitter.cz,https://nitter.lucabased.xyz,https://nitter.so,https://nitter.moomoo.me')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

let playersDB = {};
let saveTimer = null;
let lastFetchedId = null;
let lastSteamNewsId = null;
let totalTweetsChecked = 0;
let lastRateUpSnapshot = null;
const activeTrades = new Map();

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDatabase();
  }, 150);
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      playersDB = {};
      saveDatabase();
      return;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8').trim();
    playersDB = raw ? JSON.parse(raw) : {};
    if (!playersDB || typeof playersDB !== 'object' || Array.isArray(playersDB)) playersDB = {};
    console.log(`💾 資料庫讀取成功：${DB_FILE}`);
  } catch (err) {
    console.error('❌ 資料庫讀取失敗，已重置為空資料：', err);
    playersDB = {};
  }
}

function saveDatabase() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(playersDB, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('❌ 資料寫入失敗：', err);
  }
}

function ensurePlayer(userId) {
  if (!playersDB[userId]) {
    playersDB[userId] = {
      lunacy: 0,
      inventory: {},
      egos: {},
      team: [],
      equipped: null,
      starterGranted: false,
      dailyStreak: 0,
      lastDailyClaimDate: '',
    };
    const baseSinners = identitiesData?.identities?.['0'] || [];
    for (const sinner of baseSinners) {
      const name = typeof sinner === 'string' ? sinner : (sinner?.name || '');
      if (name) playersDB[userId].inventory[name] = 1;
    }
    playersDB[userId].starterGranted = true;
    scheduleSave();
  }

  const p = playersDB[userId];
  let changed = false;
  if (typeof p.lunacy !== 'number') { p.lunacy = 0; changed = true; }
  if (!p.inventory || typeof p.inventory !== 'object' || Array.isArray(p.inventory)) { p.inventory = {}; changed = true; }
  if (!p.egos || typeof p.egos !== 'object' || Array.isArray(p.egos)) { p.egos = {}; changed = true; }
  if (!Array.isArray(p.team)) { p.team = []; changed = true; }
  if (p.equipped === undefined) { p.equipped = null; changed = true; }
  if (typeof p.dailyStreak !== 'number') { p.dailyStreak = 0; changed = true; }
  if (typeof p.lastDailyClaimDate !== 'string') { p.lastDailyClaimDate = ''; changed = true; }
  if (typeof p.starterGranted !== 'boolean') { p.starterGranted = true; changed = true; }
  if (changed) scheduleSave();
  return p;
}

function getPlayer(userId) {
  return ensurePlayer(userId);
}

function getTaipeiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function safeTrim(text) {
  return String(text ?? '').trim();
}

function decodeHtmlEntities(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '>')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
  return decodeHtmlEntities(String(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTweetIdsFromText(text = '') {
  const raw = String(text || '');
  const ids = new Set();
  for (const m of raw.matchAll(/data-tweet-id="(\d{10,25})"/g)) ids.add(m[1]);
  for (const m of raw.matchAll(/status\/(\d{10,25})/g)) ids.add(m[1]);
  for (const m of raw.matchAll(/tweet_id[=:"'](\d{10,25})/g)) ids.add(m[1]);
  for (const m of raw.matchAll(/"id_str"\s*:\s*"(\d{10,25})"/g)) ids.add(m[1]);
  for (const m of raw.matchAll(/"id"\s*:\s*"(\d{10,25})"/g)) ids.add(m[1]);
  return [...ids];
}

function extractMetaValues(html = '', keys = []) {
  const raw = String(html || '');
  const out = [];
  const metaTagRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaTagRe.exec(raw)) !== null) {
    const tag = m[0];
    const key = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (!key || !content) continue;
    if (keys.some(k => k.toLowerCase() === key.toLowerCase())) out.push(decodeHtmlEntities(content));
  }
  return [...new Set(out.filter(Boolean))];
}

async function fetchCompat(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = typeof fetch === 'function'
    ? fetch.bind(globalThis)
    : (await import('node-fetch')).default;

  return fetchImpl(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timeout));
}

async function replyLike(target, payload) {
  if (!target) return null;
  if (typeof target.reply === 'function') return target.reply(payload);
  if (typeof target.send === 'function') return target.send(payload);
  return null;
}

function rarityToStars(rarity) {
  if (rarity === 'Color Fixer') return '⬛ [色彩收尾人]';
  if (rarity === 'Special') return '⚠️ [特殊]';
  if (rarity === '0000') return '👑 ★★★★';
  if (rarity === 'Egos') return '⚔️ E.G.O 同步';
  if (rarity === '000') return '★★★';
  if (rarity === '00') return '★★';
  return '★';
}

const RARITY_RATES = {
  'Color Fixer': 0.00000143,
  'Special': 0.0001,
  '0000': 0.0010,
  'Egos': 0.0130,
  '000': 0.0290,
  '00': 0.1500,
  '0': 0.80689857,
};

const GUARANTEE_RATES = { ...RARITY_RATES };
delete GUARANTEE_RATES['0'];
const totalGuaranteeWeight = Object.values(GUARANTEE_RATES).reduce((a, b) => a + b, 0);

function buildRarity() {
  let r = Math.random();
  for (const [rarity, rate] of Object.entries(RARITY_RATES)) {
    if ((r -= rate) < 0) return rarity;
  }
  return '0';
}

function buildRarityGuaranteed() {
  let r = Math.random() * totalGuaranteeWeight;
  for (const [rarity, rate] of Object.entries(GUARANTEE_RATES)) {
    if ((r -= rate) < 0) return rarity;
  }
  return '00';
}

function normalizeRateUpList(rarity) {
  const rateUpSource = identitiesData?.upTargets || identitiesData?.rateUpIds || identitiesData?.targetIdentities || {};
  const value = rateUpSource[rarity];
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return [value];
  if (typeof value === 'object') {
    if (Array.isArray(value.names)) return value.names.filter(Boolean);
    if (Array.isArray(value.ids)) return value.ids.filter(Boolean);
    if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
  }
  return [];
}

function pickRateUp(rarity) {
  const list = normalizeRateUpList(rarity);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function pullIdentity(rarity) {
  if (typeof identitiesData?.pullIdentity === 'function') return identitiesData.pullIdentity(rarity);
  return `（缺少 pullIdentity：${rarity}）`;
}

async function parseLatestItem(xml) {
  const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/i);
  if (!itemMatch) return null;
  const item = itemMatch[0];
  const link = item.match(/<link>(.*?)<\/link>/i)?.[1];
  const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1];
  const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!link || !guid) return null;
  return {
    link: link.trim().replace('http://', 'https://'),
    id: guid.trim(),
    title: title ? stripHtml(title) : '',
  };
}

async function fetchLatestTweetFromNode(nodeUrl) {
  const response = await fetchCompat(`${nodeUrl}/${TARGET_USER.username}/rss`, {}, 8000);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const data = await parseLatestItem(text);
  if (!data) throw new Error('RSS 解析失敗');
  const cleanLink = data.link.split('#')[0];
  const vxTweetLink = cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');
  return { id: data.id, link: vxTweetLink, title: data.title };
}

async function fetchLatestTweetFromXProfile() {
  const response = await fetchCompat(`https://x.com/${TARGET_USER.username}`, {}, 10000);
  if (!response.ok) throw new Error(`X profile HTTP ${response.status}`);
  const html = await response.text();
  const ids = [...new Set([...html.matchAll(/status\/(\d{10,25})/g)].map(m => m[1]))];
  if (!ids.length) throw new Error('X profile 解析失敗');
  const id = ids[0];
  return {
    id,
    link: `https://vxtwitter.com/${TARGET_USER.username}/status/${id}`,
    title: '',
  };
}

async function getLatestTweet() {
  const shuffled = [...NITTER_NODES].sort(() => Math.random() - 0.5);
  const errors = [];
  for (const nodeUrl of shuffled) {
    try {
      return await fetchLatestTweetFromNode(nodeUrl);
    } catch (err) {
      errors.push(`${nodeUrl} (${err.message})`);
    }
  }
  try {
    return await fetchLatestTweetFromXProfile();
  } catch (err) {
    errors.push(`X profile (${err.message})`);
  }
  throw new Error(errors.join('\n') || '所有節點無法連線');
}

function buildTweetContent(tweet) {
  const titleLine = tweet?.title ? `> ${tweet.title}\n` : '';
  return {
    content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${titleLine}${tweet.link}`,
    allowedMentions: { roles: [PING_ROLE_ID] },
  };
}

async function checkTwitterUpdates(manual = false, target = null) {
  console.log(`⏳ Angela 正在檢查官方 @${TARGET_USER.username} 的動態...`);
  totalTweetsChecked++;

  let latestTweet = null;
  let lastError = null;
  try {
    latestTweet = await getLatestTweet();
  } catch (err) {
    lastError = err;
  }

  if (!latestTweet?.id) {
    if (manual) {
      return replyLike(target, `❌ **觀測失敗**\n${lastError?.message || '所有節點無法連線'}`);
    }
    return;
  }

  if (lastFetchedId === null) {
    lastFetchedId = latestTweet.id;
    if (!manual) {
      console.log(`📦 成功建立 @${TARGET_USER.username} 的初始推文快取：${latestTweet.id}`);
      return;
    }
  }

  if (manual) return replyLike(target, buildTweetContent(latestTweet));

  if (latestTweet.id !== lastFetchedId) {
    lastFetchedId = latestTweet.id;
    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(buildTweetContent(latestTweet)).catch(() => {});
  }
}

async function checkSteamUpdates(manual = false, target = null) {
  try {
    const response = await fetchCompat('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=5&format=json', {}, 10000);
    if (!response.ok) throw new Error(`Steam API HTTP ${response.status}`);
    const data = await response.json();
    const newsItems = Array.isArray(data?.appnews?.newsitems) ? data.appnews.newsitems : [];
    const newsItem = newsItems[0];

    if (!newsItem) {
      if (manual) return replyLike(target, '❌ 沒有抓到 Steam 新聞。');
      return;
    }

    if (lastSteamNewsId === null) {
      lastSteamNewsId = String(newsItem.gid);
      if (!manual) {
        console.log(`🚂 Steam 新聞初始基線鎖定成功，當前最新 ID: ${newsItem.gid}`);
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🚂 [Steam新聞] ${newsItem.title}`)
      .setURL(newsItem.url)
      .setColor(0x00A8E8)
      .setTimestamp();

    if (manual) return replyLike(target, { embeds: [embed] });

    if (String(newsItem.gid) !== String(lastSteamNewsId)) {
      lastSteamNewsId = String(newsItem.gid);
      const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
      if (channel) {
        await channel.send({
          content: `🔔 ${PING_ROLE_MENTION}`,
          embeds: [embed],
          allowedMentions: { roles: [PING_ROLE_ID] },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('❌ [Steam] 觀測失敗：', err?.message || err);
    if (manual) return replyLike(target, '❌ **Steam API 錯誤**');
  }
}

async function checkSteamPlayerCount(manualTarget) {
  const response = await fetchCompat('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530', {}, 10000);
  if (!response.ok) throw new Error(`Steam player count HTTP ${response.status}`);
  const data = await response.json();
  if (data?.response?.result !== 1) throw new Error('Steam player count 回傳格式錯誤');
  return replyLike(manualTarget, `📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中進行探索。`);
}

async function performSystemChecks() {
  await checkTwitterUpdates(false, null).catch(() => {});
  await checkSteamUpdates(false, null).catch(() => {});
}

async function announceCurrentRateUps() {
  try {
    const currentSnapshot = JSON.stringify(identitiesData?.upTargets || identitiesData?.rateUpIds || identitiesData?.targetIdentities || {});
    if (lastRateUpSnapshot !== null && currentSnapshot === lastRateUpSnapshot) return;
    lastRateUpSnapshot = currentSnapshot;

    const channel = await client.channels.fetch(RATEUP_ANNOUNCE_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const r000 = normalizeRateUpList('000');
    const r00 = normalizeRateUpList('00');
    const r0 = normalizeRateUpList('0');
    const sections = [];
    if (r000.length) sections.push(`### 000\n${r000.map(v => `• ${v}`).join('\n')}`);
    if (r00.length) sections.push(`### 00\n${r00.map(v => `• ${v}`).join('\n')}`);
    if (r0.length) sections.push(`### 0\n${r0.map(v => `• ${v}`).join('\n')}`);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd166)
          .setTitle('📢 Rate Up 人格資料已載入')
          .setDescription(sections.length ? sections.join('\n\n') : '目前沒有設定任何 Rate Up 人格。')
          .setFooter({ text: '資料來源：identitiesData.js' })
          .setTimestamp(),
      ],
    }).catch(() => {});
  } catch (err) {
    console.error('Rate Up 公告失敗：', err);
  }
}

function buildPackEmbed(userId, page) {
  const pData = getPlayer(userId);
  const user = client.users.cache.get(userId);
  const username = user ? user.username : '主管';

  const allItems = [
    ...Object.entries(pData.inventory).map(([k, v]) => `👤 ${k} x${v}`),
    ...Object.entries(pData.egos).map(([k, v]) => `⚔️ ${k} x${v}`),
  ];

  const itemsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(allItems.length / itemsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * itemsPerPage;
  const pageItems = allItems.slice(start, start + itemsPerPage);

  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${username} 的檔案館 (頁數 ${safePage + 1}/${totalPages})`)
    .setColor(0xE63946)
    .addFields(
      { name: '💎 Lunacy', value: `${pData.lunacy}`, inline: true },
      { name: '🎖️ 裝備中', value: pData.equipped || '無', inline: true },
      { name: '👥 隊伍人數', value: `${pData.team.length}/7 人`, inline: true },
      { name: '📚 持有內容', value: pageItems.length > 0 ? pageItems.join('\n') : '空空如也' },
    );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage - 1}`).setLabel('◀上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1),
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pack_equip_${userId}`).setLabel('🎖️ 裝備').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pack_team_${userId}`).setLabel('👥 編隊').setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [navRow, actionRow] };
}

function buildListEmbed(rarity, page) {
  const baseRate = RARITY_RATES[rarity];
  const allPool = identitiesData?.identities?.[rarity] || [];
  const upPool = identitiesData?.upTargets?.[rarity] || [];
  const stdPool = allPool.filter(id => !upPool.includes(id) && id !== null);

  let desc = `**總基礎機率：** ${(baseRate * 100).toFixed(6)}%\n\n`;
  const validUp = upPool.filter(i => i !== null);
  if (validUp.length > 0) {
    desc += `✨ **[Rate Up]** (每隻 ${((baseRate * 0.25) / validUp.length * 100).toFixed(6)}%):\n${validUp.map(i => `• ${i}`).join('\n')}\n\n`;
  }

  const itemsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(stdPool.length / itemsPerPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * itemsPerPage;
  const pageItems = stdPool.slice(start, start + itemsPerPage);

  if (stdPool.length > 0) desc += `🔹 **[普通] (頁數 ${safePage + 1}/${totalPages})**:\n${pageItems.map(i => `• ${i}`).join('\n')}`;
  else desc += `🔹 (此卡池目前沒有一般對象)`;

  const embed = new EmbedBuilder()
    .setTitle(`📈 機率總覽 - ${rarityToStars(rarity)}`)
    .setColor(0x457B9D)
    .setDescription(desc);

  const selectMenuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('list_select')
      .setPlaceholder('切換查看其他卡池...')
      .addOptions(Object.keys(RARITY_RATES).map(r => ({ label: `${r} 卡池`, value: r })))
  );

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`list_nav_${rarity}_${safePage - 1}`).setLabel('◀上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId(`list_nav_${rarity}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1),
  );

  return { embeds: [embed], components: [selectMenuRow, navRow] };
}

function buildTradePanel(trade) {
  return new EmbedBuilder()
    .setTitle('🔄 交易終端')
    .setColor(0x2A9D8F)
    .addFields(
      { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '未選擇'}`, inline: true },
      { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '未選擇'}`, inline: true },
    );
}

async function refreshTradeMessage(trade) {
  const channel = await client.channels.fetch(trade.channelId).catch(() => null);
  if (!channel) return;
  const originalMsg = await channel.messages.fetch(trade.originalMsgId).catch(() => null);
  if (!originalMsg) return;
  await originalMsg.edit({ embeds: [buildTradePanel(trade)] }).catch(() => {});
}

function createTrade({ channelId, originalMsgId, p1, p2 }) {
  const tradeId = crypto.randomUUID();
  const trade = {
    channelId,
    originalMsgId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    p1: { id: p1.id, name: p1.name, offer: null, confirmed: false },
    p2: { id: p2.id, name: p2.name, offer: null, confirmed: false },
  };
  trade.timer = setTimeout(() => clearTrade(tradeId), 10 * 60 * 1000);
  activeTrades.set(tradeId, trade);
  return tradeId;
}

function clearTrade(tradeId) {
  const trade = activeTrades.get(tradeId);
  if (trade?.timer) clearTimeout(trade.timer);
  activeTrades.delete(tradeId);
}

function transferItem(fromDB, toDB, itemName) {
  if (fromDB.inventory[itemName]) {
    fromDB.inventory[itemName]--;
    if (fromDB.inventory[itemName] <= 0) {
      delete fromDB.inventory[itemName];
      if (fromDB.equipped === itemName) fromDB.equipped = null;
      fromDB.team = fromDB.team.filter(x => x !== itemName);
    }
    toDB.inventory[itemName] = (toDB.inventory[itemName] || 0) + 1;
    return true;
  }
  if (fromDB.egos[itemName]) {
    fromDB.egos[itemName]--;
    if (fromDB.egos[itemName] <= 0) delete fromDB.egos[itemName];
    toDB.egos[itemName] = (toDB.egos[itemName] || 0) + 1;
    return true;
  }
  return false;
}

function buildCommandsEmbed() {
  return new EmbedBuilder()
    .setTitle('📜 Angela 指令總覽')
    .setColor(0x457B9D)
    .setDescription([
      '**觀測 / 狀態**',
      '`!status` `!ping` `!testtweet` `!測試官方推文` `!teststeam` `!steam` `!steamnews` `!邊獄人數` `!limbusonline`',
      '',
      '**簽到 / 發放**',
      '`!claimdaily` `!daily` `!givelunacy @user 數量` `!updaterewards 數量`',
      '',
      '**抽卡 / 檔案館 / 戰鬥**',
      '`!pull` `!10pulls` `!pack` `!check` `!list` `!stages`',
      '',
      '**交易 / 其他**',
      '`!trade @user` `!checkrateupids` `!findbot` `!尋找機器人` `!ego` `!逆流`',
    ].join('\n'))
    .setFooter({ text: 'Angela 指令中心' })
    .setTimestamp();
}

function buildStatusEmbed() {
  const uptimeMs = Date.now() - client.readyTimestamp;
  const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);
  return new EmbedBuilder()
    .setTitle('🧠 認知心理學 - 情感共鳴與系統狀態報告')
    .setColor(0x5a189a)
    .setDescription('在當前社會標籤與認知扭曲下，個體的情感投影與核心控制室運行紀錄：')
    .addFields(
      { name: '🏷️ 當前標籤 (Label)', value: '「被觀測者」', inline: true },
      { name: '📊 心理狀態 (State)', value: '🛑 精神枯竭 (Burnout)', inline: true },
      { name: '⏳ 核心運作時間 (Uptime)', value: `${uptimeHours} 小時`, inline: true },
      { name: '📡 監聽機制', value: '1分鐘極速輪詢 (極簡優化版)', inline: true },
      { name: '📈 檢查次數', value: `${totalTweetsChecked}`, inline: true },
      { name: '💾 儲存位置', value: DB_FILE, inline: false },
      { name: '🚦 Twitter 基線', value: lastFetchedId ? `已鎖定 ID: \`${lastFetchedId}\`` : '尚未建立', inline: false },
      { name: '🚂 Steam 基線', value: lastSteamNewsId ? `已鎖定 ID: \`${lastSteamNewsId}\`` : '尚未建立', inline: false },
    )
    .setFooter({ text: 'Angela 心理與系統觀測核心' })
    .setTimestamp();
}

function buildDailyEmbed(reward, streak, todayKey) {
  return new EmbedBuilder()
    .setTitle('🎁 每日簽到完成')
    .setColor(0x2A9D8F)
    .addFields(
      { name: '💎 本日獎勵', value: `${reward} Lunacy`, inline: true },
      { name: '🔥 連續簽到', value: `${streak} 天`, inline: true },
      { name: '📅 今日日期', value: todayKey, inline: true },
    )
    .setDescription(streak >= 2 ? `連續簽到第 ${streak} 天，獎勵已提升。` : '今天是你的第一天簽到。')
    .setTimestamp();
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.sendStatus(200));
try {
  const server = app.listen(PORT, () => console.log(`網頁伺服器啟動於通訊埠 ${PORT}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`⚠️ [網路警告] 連接埠 ${PORT} 已被佔用，跳過網頁監聽，Discord 服務繼續啟動...`);
    } else {
      console.error('❌ 網頁伺服器發生異常：', err);
    }
  });
} catch (e) {
  console.error('❌ 網頁伺服器啟動失敗：', e);
}

client.once('ready', async () => {
  console.log(`🤖 Angela 已登入：${client.user.tag}`);
  loadDatabase();

  client.user.setPresence({
    status: 'idle',
    activities: [{ name: 'customstatus', type: 4, state: 'Sles被我吃掉了' }],
  });

  try {
    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
    if (channel) {
      const loginEmbed = new EmbedBuilder()
        .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
        .setColor(0x00b4d8)
        .setDescription('「主管，精神脈衝已重新對齊。廣播模組已調整完畢，隨時準備播報 Project Moon 的最新動態。」')
        .addFields(
          { name: '📡 觀測目標', value: `@${TARGET_USER.username}`, inline: true },
          { name: '⏱️ 監聽頻率', value: '每 1 分鐘 / 1 次', inline: true },
        )
        .setFooter({ text: '腦葉公司行政中心 - 核心AI系統' })
        .setTimestamp();
      await channel.send({ embeds: [loginEmbed] }).catch(() => {});
    }
  } catch (err) {
    console.error('❌ 啟動發送訊息失敗：', err?.message || err);
  }

  await announceCurrentRateUps().catch(() => {});
  setInterval(performSystemChecks, CHECK_INTERVAL_MS);
  performSystemChecks();
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const msg = safeTrim(message.content);
    if (!msg) return;

    const args = msg.split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (cmd === '!ping') return message.reply('pong！').catch(() => {});
    if (cmd === '!cmds') return message.reply({ embeds: [buildCommandsEmbed()] }).catch(() => {});

    if (cmd === '!claimdaily' || cmd === '!daily') {
      const player = getPlayer(message.author.id);
      const todayKey = getTaipeiDateKey();
      if (player.lastDailyClaimDate === todayKey) return message.reply('❌ 你今天已經領過了。\n下一次請等明天再來。').catch(() => {});

      if (player.lastDailyClaimDate) {
        const prev = new Date(`${player.lastDailyClaimDate}T00:00:00+08:00`);
        const now = new Date(`${todayKey}T00:00:00+08:00`);
        const diffDays = Math.round((now - prev) / 86400000);
        if (diffDays === 1) player.dailyStreak += 1;
        else player.dailyStreak = 1;
      } else {
        player.dailyStreak = 1;
      }

      const reward = DAILY_BASE_REWARD + (player.dailyStreak - 1) * DAILY_STREAK_BONUS;
      player.lunacy += reward;
      player.lastDailyClaimDate = todayKey;
      scheduleSave();
      return message.reply({ embeds: [buildDailyEmbed(reward, player.dailyStreak, todayKey)] }).catch(() => {});
    }

    if (msg === '管理員' || msg === '主管') return message.reply('主管，您好。我是您的 AI 助理 Angela。').catch(() => {});
    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。').catch(() => {});

    if (cmd === '!測試官方推文' || cmd === '!testtweet') {
      await message.channel.sendTyping().catch(() => {});
      console.log('🎯 主管手動觸發官方推文測試擷取...');
      return checkTwitterUpdates(true, message);
    }

    if (cmd === '!測試steam' || cmd === '!teststeam' || cmd === '!steam' || cmd === '!steamnews') {
      return checkSteamUpdates(true, message);
    }

    if (msg === '!邊獄人數' || msg === '!limbusonline') {
      try {
        return await checkSteamPlayerCount(message);
      } catch {
        return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。').catch(() => {});
      }
    }

    if (msg === '!狀態' || msg === '!status') return message.reply({ embeds: [buildStatusEmbed()] }).catch(() => {});

    if (msg === '!ego') {
      const egoList = [
        { name: '薄暮 (Twilight)', grade: 'ALEPH', desc: '調和所有矛盾與偏見的終極大劍。' },
        { name: '失樂園 (Paradise Lost)', grade: 'ALEPH', desc: '純白羽翼覆蓋的禁忌法杖。' },
        { name: '擬態 (Mimicry)', grade: 'ALEPH', desc: '由血肉扭曲而成的巨大刀刃。' },
      ];
      const randomEgo = egoList[Math.floor(Math.random() * egoList.length)];
      const egoEmbed = new EmbedBuilder()
        .setTitle('⚔️ 核心共鳴：E.G.O 同步觀測報告')
        .setColor(0xd90429)
        .setDescription(`**${message.author.username}** 主管，提取出以下同步率最高的 E.G.O 武裝：`)
        .addFields(
          { name: '✨ 裝備名稱', value: `**${randomEgo.name}**`, inline: true },
          { name: '🔱 危險等級', value: `\`${randomEgo.grade}\``, inline: true },
          { name: '🧠 標籤與認知心理學解析', value: randomEgo.desc, inline: false },
        )
        .setFooter({ text: 'Angela 心理提取模組' })
        .setTimestamp();
      return message.reply({ embeds: [egoEmbed] }).catch(() => {});
    }

    if (msg === '!逆流') {
      const alarmEmbed = new EmbedBuilder()
        .setTitle('⚠️ [WARNING] 腦葉公司核心控制室緊急通告')
        .setColor(0xff0000)
        .setDescription('警告：當前頻道內觀測到嚴重的「心理逆流」現象！')
        .addFields({ name: '🚨 逆流狀態', value: '第 3 階能障逆流 (Qliphoth Meltdown)', inline: false })
        .setImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')
        .setFooter({ text: '腦葉公司最高行政控制中心' })
        .setTimestamp();
      return message.reply({ embeds: [alarmEmbed] }).catch(() => {});
    }

    if (cmd === '!pull' || cmd === '!10pulls') {
      const count = cmd === '!10pulls' ? 10 : 1;
      const cost = count === 10 ? 1300 : 130;
      const player = getPlayer(message.author.id);
      if (player.lunacy < cost) return message.reply(`❌ **Lunacy 不足** (餘額: ${player.lunacy})`).catch(() => {});
      player.lunacy -= cost;

      const results = [];
      for (let i = 0; i < count; i++) {
        const rarity = (count === 10 && i === 9) ? buildRarityGuaranteed() : buildRarity();
        const rateUpName = pickRateUp(rarity);
        let result = pullIdentity(rarity);
        if (rateUpName && Math.random() < 0.25) result = `✨ **[PICK-UP!]** ${rateUpName}`;
        if (rarity === 'Egos') player.egos[result] = (player.egos[result] || 0) + 1;
        else player.inventory[result] = (player.inventory[result] || 0) + 1;
        results.push(`${result} (${rarityToStars(rarity)})`);
      }
      scheduleSave();
      return message.reply(count === 10 ? `✨ **十連抽結果：**\n${results.join('\n')}` : `🎯 **單抽結果：**\n${results[0]}`).catch(() => {});
    }

    if (cmd === '!checkrateupids') {
      const r000 = normalizeRateUpList('000');
      const r00 = normalizeRateUpList('00');
      const r0 = normalizeRateUpList('0');
      if (r000.length === 0 && r00.length === 0 && r0.length === 0) return message.reply('📭 目前沒有設定任何機率提升中的人格。').catch(() => {});
      const lines = [];
      if (r000.length > 0) lines.push(`**000**\n${r000.map(v => `• ${v}`).join('\n')}`);
      if (r00.length > 0) lines.push(`**00**\n${r00.map(v => `• ${v}`).join('\n')}`);
      if (r0.length > 0) lines.push(`**0**\n${r0.map(v => `• ${v}`).join('\n')}`);
      return message.reply(`📈 **目前機率提升人格**\n\n${lines.join('\n\n')}`).catch(() => {});
    }

    if (cmd === '!pack' || cmd === '!check') {
      const targetUser = message.mentions.users.first() || message.author;
      return message.reply(buildPackEmbed(targetUser.id, 0)).catch(() => {});
    }

    if (cmd === '!list') {
      const embed = new EmbedBuilder().setTitle('📈 提取機率總覽').setColor(0x457B9D).setDescription('選擇稀有度查看：');
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('list_select').setPlaceholder('選擇稀有度...').addOptions(Object.keys(RARITY_RATES).map(r => ({ label: `${r} 卡池`, value: r }))),
      );
      return message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (cmd === '!stages') {
      const player = getPlayer(message.author.id);
      if (!player.team || player.team.length === 0) return message.reply('⚠️ 主管，請先透過 `!pack` 編排作戰隊伍才能出擊！').catch(() => {});
      const embed = new EmbedBuilder()
        .setTitle('🗺️ 選擇作戰難度區域')
        .setDescription(`**當前出戰小隊 (${player.team.length}/7)：**\n${player.team.map(t => `• ${t}`).join('\n')}`)
        .setColor(0x1D3557);
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`stage_select_${message.author.id}`)
          .setPlaceholder('選擇戰鬥難度...')
          .addOptions([
            { label: '邊境後巷流浪漢 (極易) ➔ 獎勵 50 Lunacy', value: '80_50' },
            { label: '後巷在地幫派成員 (輕鬆) ➔ 獎勵 100 Lunacy', value: '250_100' },
            { label: '收尾人協會成員 (中等) ➔ 獎勵 300 Lunacy', value: '500_300' },
            { label: '危險級別異想體 (困難) ➔ 獎勵 600 Lunacy', value: '1000_600' },
            { label: '核心高階收尾人 (地獄) ➔ 獎勵 1500 Lunacy', value: '2000_1500' },
          ])
      );
      return message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (cmd === '!trade') {
      const target = message.mentions.users.first();
      if (!target || target.id === message.author.id) return message.reply('📝 用法: `!trade @目標玩家`').catch(() => {});
      if (target.bot) return message.reply('❌ 無法與 AI 交易。').catch(() => {});

      const tradeId = crypto.randomUUID();
      const tradeEmbed = new EmbedBuilder()
        .setTitle('🔄 交易請求')
        .setDescription(`<@${target.id}>，**${message.author.username}** 發起交易。是否接受？`)
        .setColor(0xF4A261);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('✅ 接受').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger),
      );

      const tradeMsg = await message.reply({ content: `<@${target.id}>`, embeds: [tradeEmbed], components: [row] }).catch(() => null);
      if (tradeMsg) {
        activeTrades.set(tradeId, {
          channelId: tradeMsg.channel.id,
          originalMsgId: tradeMsg.id,
          expiresAt: Date.now() + 10 * 60 * 1000,
          p1: { id: message.author.id, name: message.author.username, offer: null, confirmed: false },
          p2: { id: target.id, name: target.username, offer: null, confirmed: false },
        });
        setTimeout(() => clearTrade(tradeId), 10 * 60 * 1000);
      }
      return;
    }

    if (cmd === '!givelunacy') {
      if (message.author.id !== OWNER_ID) return message.reply('❌ 權限不足。').catch(() => {});
      const target = message.mentions.users.first();
      const amount = parseInt(args[2], 10);
      if (!target || Number.isNaN(amount)) return message.reply('📝 `!givelunacy @user 數量`').catch(() => {});
      getPlayer(target.id).lunacy += amount;
      scheduleSave();
      return message.reply(`✅ 已給予 <@${target.id}> ${amount} Lunacy。`).catch(() => {});
    }

    if (cmd === '!updaterewards') {
      if (message.author.id !== OWNER_ID) return message.reply('❌ 權限不足。').catch(() => {});
      const amount = parseInt(args[1], 10);
      if (Number.isNaN(amount)) return message.reply('📝 `!updaterewards 數量`').catch(() => {});
      if (!message.guild) return message.reply('❌ 只能在伺服器內使用。').catch(() => {});

      const members = await message.guild.members.fetch().catch(() => null);
      if (!members) return message.reply('❌ 無法讀取伺服器成員。').catch(() => {});

      let count = 0;
      for (const member of members.values()) {
        if (member.user.bot) continue;
        getPlayer(member.id).lunacy += amount;
        count++;
      }
      scheduleSave();
      return message.reply(`✅ 已為 **${count}** 位伺服器成員各發放 **${amount}** Lunacy。`).catch(() => {});
    }

    if (cmd === '!尋找機器人' || cmd === '!findbot') {
      const searchTerm = args.slice(1).join(' ').toLowerCase();
      if (!searchTerm) return message.reply('❌ 請輸入要尋找的機器人名稱！').catch(() => {});
      if (!message.guild) return message.reply('❌ 只能在伺服器內使用此指令。').catch(() => {});
      const members = await message.guild.members.fetch();
      const foundBots = members.filter(member => member.user.bot && member.user.username.toLowerCase().includes(searchTerm));
      if (foundBots.size === 0) return message.reply('🔍 找不到機器人。').catch(() => {});
      let responseList = '📌 **找到相關機器人：**\n';
      foundBots.forEach(bot => { responseList += `🤖 **${bot.user.username}** (<@${bot.id}>)\n`; });
      return message.reply(responseList).catch(() => {});
    }
  } catch (err) {
    console.error('⚠️ messageCreate 錯誤：', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const customId = interaction.customId;
    if (!customId) return;

    if (interaction.isButton() && customId.startsWith('pack_')) {
      const parts = customId.split('_');
      const action = parts[1];
      const targetId = parts[2];
      const arg = parts[3];

      if (interaction.user.id !== targetId && interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true }).catch(() => {});
      }

      if (action === 'nav') return interaction.update(buildPackEmbed(targetId, parseInt(arg, 10))).catch(() => {});
      if (action === 'back') return interaction.update(buildPackEmbed(targetId, 0)).catch(() => {});

      if (action === 'equip' || action === 'team') {
        const pData = getPlayer(targetId);
        const invKeys = Object.keys(pData.inventory);
        if (invKeys.length === 0) return interaction.reply({ content: '❌ 背包為空。', ephemeral: true }).catch(() => {});

        const embed = new EmbedBuilder()
          .setTitle(action === 'equip' ? '🎖️ 選擇裝備' : '👥 編隊')
          .setDescription(action === 'team' ? `隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}` : '請選擇。')
          .setColor(0x457B9D);

        const rows = [];
        for (let i = 0; i < invKeys.length && rows.length < 4; i += 25) {
          const chunk = invKeys.slice(i, i + 25);
          rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`do_${action}_${targetId}_${i}`)
              .setPlaceholder(`選擇 (第 ${Math.floor(i / 25) + 1} 頁)...`)
              .addOptions(chunk.map(k => ({ label: k.substring(0, 100), value: k })))
          ));
        }

        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`pack_back_${targetId}`).setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
        ));

        return interaction.update({ embeds: [embed], components: rows }).catch(() => {});
      }
    }

    if (interaction.isStringSelectMenu() && customId.startsWith('do_')) {
      const parts = customId.split('_');
      const action = parts[1];
      const targetId = parts[2];
      if (interaction.user.id !== targetId && interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true }).catch(() => {});

      const pData = getPlayer(targetId);
      const selection = interaction.values[0];
      if (action === 'equip') {
        pData.equipped = selection;
        scheduleSave();
        return interaction.update(buildPackEmbed(targetId, 0)).catch(() => {});
      }
      if (action === 'team') {
        if (pData.team.includes(selection)) pData.team = pData.team.filter(x => x !== selection);
        else if (pData.team.length < 7) pData.team.push(selection);
        scheduleSave();
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('👥 編隊').setDescription(`隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}`).setColor(0x457B9D)] }).catch(() => {});
      }
    }

    if (interaction.isStringSelectMenu() && customId === 'list_select') {
      return interaction.update(buildListEmbed(interaction.values[0], 0)).catch(() => {});
    }
    if (interaction.isButton() && customId.startsWith('list_nav_')) {
      const parts = customId.split('_');
      return interaction.update(buildListEmbed(parts[2], parseInt(parts[3], 10))).catch(() => {});
    }

    if (interaction.isStringSelectMenu() && customId.startsWith('stage_select_')) {
      const expectedUserId = customId.split('_')[2];
      if (interaction.user.id !== expectedUserId && interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ 這不是你的作戰面板！', ephemeral: true }).catch(() => {});
      }

      const player = getPlayer(interaction.user.id);
      const [powerStr, rewardStr] = interaction.values[0].split('_');
      const eFinal = parseInt(powerStr, 10) * (0.9 + Math.random() * 0.2);
      let pClash = 0;
      if (player.team && Array.isArray(player.team)) {
        player.team.forEach(() => { pClash += Math.floor(Math.random() * 25 + 15); });
      }
      const pFinal = pClash * (0.8 + Math.random() * 0.4);
      const isWin = pFinal >= eFinal;

      const embed = new EmbedBuilder()
        .setTitle('⚔️ 戰鬥結算報告')
        .addFields(
          { name: '🔹 我方小隊戰力判定', value: `${Math.floor(pFinal)}`, inline: true },
          { name: '🔸 敵方區域威脅判定', value: `${Math.floor(eFinal)}`, inline: true },
          { name: '🏆 戰役結果', value: isWin ? `✅ 壓制成功！獲得 **${rewardStr}** Lunacy` : '❌ 壓制失敗，小隊全滅回溯。', inline: false },
        )
        .setColor(isWin ? 0x2A9D8F : 0xE63946);

      if (isWin) {
        player.lunacy += parseInt(rewardStr, 10);
        scheduleSave();
      }
      return interaction.update({ embeds: [embed], components: [] }).catch(() => {});
    }

    if (customId.startsWith('trade_')) {
      const parts = customId.split('_');
      const act = parts[1];
      const tId = parts[2];
      const trade = activeTrades.get(tId);

      if (!trade) return interaction.reply({ content: '❌ 交易過期。', ephemeral: true }).catch(() => {});
      if (Date.now() > trade.expiresAt) {
        clearTrade(tId);
        return interaction.reply({ content: '❌ 交易已過期。', ephemeral: true }).catch(() => {});
      }

      if (act === 'acc') {
        if (interaction.user.id !== trade.p2.id && interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ 僅限被邀請者。', ephemeral: true }).catch(() => {});
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`trade_pick_${tId}_p1`).setLabel(`${trade.p1.name} 選物`).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`trade_pick_${tId}_p2`).setLabel(`${trade.p2.name} 選物`).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`trade_ok_${tId}`).setLabel('✅ 確認交易').setStyle(ButtonStyle.Success),
        );
        return interaction.update({ content: null, embeds: [buildTradePanel(trade)], components: [row] }).catch(() => {});
      }

      if (act === 'dec') {
        if (interaction.user.id !== trade.p2.id && interaction.user.id !== OWNER_ID) return;
        clearTrade(tId);
        return interaction.update({ content: '❌ 交易拒絕。', embeds: [], components: [] }).catch(() => {});
      }

      if (act === 'pick') {
        const playerKey = parts[3];
        if (interaction.user.id !== trade[playerKey].id && interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: '❌ 非您的按鈕。', ephemeral: true }).catch(() => {});
        }

        const pData = getPlayer(trade[playerKey].id);
        const allItems = [...Object.keys(pData.inventory), ...Object.keys(pData.egos)];
        if (allItems.length === 0) return interaction.reply({ content: '❌ 背包空。', ephemeral: true }).catch(() => {});

        const rows = [];
        for (let i = 0; i < allItems.length && rows.length < 5; i += 25) {
          rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`trade_sel_${tId}_${playerKey}_${i}`)
              .setPlaceholder(`選擇 (第 ${Math.floor(i / 25) + 1} 頁)...`)
              .addOptions(allItems.slice(i, i + 25).map(item => ({ label: item.substring(0, 100), value: item })))
          ));
        }
        return interaction.reply({ content: '請選擇物品：', components: rows, ephemeral: true }).catch(() => {});
      }

      if (act === 'sel') {
        const playerKey = parts[3];
        if (interaction.user.id !== trade[playerKey].id && interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: '❌ 非您的選單。', ephemeral: true }).catch(() => {});
        }
        trade[playerKey].offer = interaction.values[0];
        trade.p1.confirmed = false;
        trade.p2.confirmed = false;
        await refreshTradeMessage(trade);
        return interaction.update({ content: '✅ 選擇完畢，請回到原對話框按確認。', components: [] }).catch(() => {});
      }

      if (act === 'ok') {
        const isP1 = interaction.user.id === trade.p1.id;
        const isP2 = interaction.user.id === trade.p2.id;
        if (!isP1 && !isP2 && interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ 無權限。', ephemeral: true }).catch(() => {});
        if (!trade.p1.offer || !trade.p2.offer) return interaction.reply({ content: '❌ 雙方皆須放物品。', ephemeral: true }).catch(() => {});

        if (isP1) trade.p1.confirmed = true;
        if (isP2) trade.p2.confirmed = true;
        if (interaction.user.id === OWNER_ID) {
          trade.p1.confirmed = true;
          trade.p2.confirmed = true;
        }

        if (trade.p1.confirmed && trade.p2.confirmed) {
          const p1Data = getPlayer(trade.p1.id);
          const p2Data = getPlayer(trade.p2.id);
          const p1OK = transferItem(p1Data, p2Data, trade.p1.offer);
          const p2OK = transferItem(p2Data, p1Data, trade.p2.offer);
          if (!p1OK || !p2OK) return interaction.reply({ content: '❌ 其中一方的物品已不存在，交易已取消。', ephemeral: true }).catch(() => {});
          scheduleSave();
          await refreshTradeMessage(trade);

          const channel = await client.channels.fetch(trade.channelId).catch(() => null);
          if (channel) {
            const originalMsg = await channel.messages.fetch(trade.originalMsgId).catch(() => null);
            if (originalMsg) {
              await originalMsg.edit({
                embeds: [new EmbedBuilder().setTitle('✅ 交易成功').setColor(0x2A9D8F).setDescription(`**${trade.p1.name}** 得 ${trade.p2.offer}\n**${trade.p2.name}** 得 ${trade.p1.offer}`)],
                components: [],
              }).catch(() => {});
            }
          }
          clearTrade(tId);
          return interaction.update({ content: '✅ 交易完成。', embeds: [], components: [] }).catch(() => {});
        }

        return interaction.reply({ content: '✅ 您已確認。等待對方...', ephemeral: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('⚠️ 互動異常：', err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: '❌ 互動處理失敗。', ephemeral: true }).catch(() => {});
      }
    } catch (_) {}
  }
});

if (!TOKEN) {
  console.error('❌ 缺少 DISCORD_TOKEN。');
  process.exit(1);
}

client.login(TOKEN).catch(err => console.error('❌ 登入失敗：', err));
