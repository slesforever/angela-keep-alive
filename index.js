// ==================== 🛡️ 全域防崩潰守護神系統 ====================
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [全域安全攔截] 未處理的 Promise 拒絕，已自動隔離防崩潰：', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.error('❌ [全域安全攔截] 未捕獲的例外事件，已自動全面護航：', err);
});

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
const identitiesData = require('./identitiesData.js');

// ==================== 💾 檔案館持久化資料庫系統 ====================
const DB_FILE = './players.json';
let playersDB = {};

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8').trim();
            playersDB = data ? JSON.parse(data) : {};
            console.log('💾 檔案館 (players.json) 讀取成功！');
        } catch (e) {
            console.error('❌ 資料庫讀取失敗，已重置全新檔案庫：', e);
            playersDB = {};
        }
    } else {
        saveDatabase();
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(playersDB, null, 4), 'utf8');
    } catch (e) {
        console.error('❌ 資料寫入失敗:', e);
    }
}

function getPlayer(userId) {
    if (!playersDB[userId]) {
        playersDB[userId] = {};
    }
    if (typeof playersDB[userId].lunacy !== 'number') playersDB[userId].lunacy = 0;
    if (!playersDB[userId].inventory || typeof playersDB[userId].inventory !== 'object') playersDB[userId].inventory = {};
    if (!playersDB[userId].egos || typeof playersDB[userId].egos !== 'object') playersDB[userId].egos = {};
    if (!playersDB[userId].team || !Array.isArray(playersDB[userId].team)) playersDB[userId].team = [];
    if (playersDB[userId].equipped === undefined) playersDB[userId].equipped = null;

    if (Object.keys(playersDB[userId].inventory).length === 0) {
        const baseSinners = identitiesData?.identities?.['0'] || [];
        baseSinners.forEach(sinner => {
            const name = typeof sinner === 'string' ? sinner : (sinner?.name || '');
            if (name) playersDB[userId].inventory[name] = 1;
        });
    }
    saveDatabase();
    return playersDB[userId];
}

// ==================== 🌐 網頁伺服器設定 (防撞 Port 安全版) ====================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.sendStatus(200));

const server = app.listen(PORT, () => console.log(`網頁伺服器啟動於通訊埠 ${PORT}`));
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`⚠️ [網路警告] 連接埠 ${PORT} 已被佔用。機器人將跳過網頁監聽，繼續啟動核心 Discord 服務...`);
    } else {
        console.error('❌ 網頁伺服器發生其他異常:', err);
    }
});

// ==================== 📡 系統常數與觀測設定 ====================
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_ID = '1406984068725211177';
const PING_ROLE_MENTION = `<@&${PING_ROLE_ID}>`;
const TARGET_USER = { username: 'LimbusCompany_B' };

let lastTweetId = null;
let lastSteamNewsId = null;
const activeTrades = new Map();

// ==================== 🎲 機率與抽卡核心 ====================
const RARITY_RATES = {
    'Color Fixer': 0.00000143,
    'Special': 0.0001,
    '0000': 0.0010,
    'Egos': 0.0130,
    '000': 0.0290,
    '00': 0.1500,
    '0': 0.80689857
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

function rarityToStars(rarity) {
    if (rarity === 'Color Fixer') return '⬛ [色彩收尾人]';
    if (rarity === 'Special') return '⚠️ [特殊]';
    if (rarity === '0000') return '👑 ★★★★';
    if (rarity === 'Egos') return '⚔️ E.G.O 同步';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

// ==================== 📡 X / Twitter Syndication 觀測系統 ====================
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    }).finally(() => clearTimeout(timeout));
}

function decodeHtmlEntities(text = '') {
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
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

function parseMaybeJsonp(text) {
    const raw = String(text).trim();

    try {
        return JSON.parse(raw);
    } catch (_) {
        // fall through
    }

    const jsonpMatch = raw.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
    if (!jsonpMatch) {
        throw new Error('無法解析 JSON / JSONP');
    }

    return JSON.parse(jsonpMatch[1]);
}

async function fetchTwitterTimelineProfile(screenName) {
    const url = `https://syndication.twitter.com/timeline/profile?screen_name=${encodeURIComponent(screenName)}&dnt=false&lang=zh-hant&suppress_response_codes=true&callback=__twttrf.callback&rnd=${Math.random()}`;
    const response = await fetchWithTimeout(url, {}, 10000);

    if (!response.ok) {
        throw new Error(`timeline/profile HTTP ${response.status}`);
    }

    const text = await response.text();
    const data = parseMaybeJsonp(text);
    const body = String(data?.body || '');

    const tweetIds = [];
    const seen = new Set();
    const re = /data-tweet-id="(\d+)"/g;
    let match;

    while ((match = re.exec(body)) !== null) {
        const tweetId = match[1];
        if (seen.has(tweetId)) continue;

        const start = Math.max(0, match.index - 900);
        const end = Math.min(body.length, match.index + 1400);
        const context = body.slice(start, end);

        if (/pinned tweet|isPinned|置頂|已置頂/i.test(context)) continue;

        seen.add(tweetId);
        tweetIds.push(tweetId);
    }

    return { data, body, tweetIds };
}

async function fetchTweetResult(tweetId) {
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh`;
    const response = await fetchWithTimeout(url, {}, 10000);

    if (!response.ok) {
        throw new Error(`tweet-result HTTP ${response.status}`);
    }

    return await response.json();
}

function collectUrlCandidates(input) {
    const results = [];
    const seenObjects = new WeakSet();

    const walk = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value)) {
                results.push({ url: value, path });
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                walk(value[i], path.concat(String(i)));
            }
            return;
        }

        if (typeof value === 'object') {
            if (seenObjects.has(value)) return;
            seenObjects.add(value);

            for (const [k, v] of Object.entries(value)) {
                walk(v, path.concat(k));
            }
        }
    };

    walk(input);
    return results;
}

function splitMediaUrls(candidates) {
    const images = [];
    const videos = [];
    const others = [];

    for (const { url, path } of candidates) {
        const u = url.toLowerCase();
        const key = path.join('.').toLowerCase();

        if (/profile_images|emoji/i.test(u)) continue;

        const looksLikeVideo =
            u.includes('video.twimg.com') ||
            u.endsWith('.mp4') ||
            u.endsWith('.mov') ||
            u.endsWith('.webm') ||
            key.includes('video') ||
            key.includes('mp4') ||
            key.includes('variant') ||
            key.includes('playback');

        const looksLikeImage =
            u.includes('pbs.twimg.com/media') ||
            u.endsWith('.jpg') ||
            u.endsWith('.jpeg') ||
            u.endsWith('.png') ||
            u.endsWith('.gif') ||
            u.endsWith('.webp') ||
            key.includes('photo') ||
            key.includes('image') ||
            key.includes('poster') ||
            key.includes('thumb') ||
            key.includes('thumbnail');

        if (looksLikeVideo) videos.push(url);
        else if (looksLikeImage) images.push(url);
        else others.push(url);
    }

    return {
        images: [...new Set(images)],
        videos: [...new Set(videos)],
        others: [...new Set(others)]
    };
}

function pickBestVideoUrl(tweet) {
    const candidates = [];

    const addCandidate = (url, bitrate = 0) => {
        if (!url || !/^https?:\/\//i.test(url)) return;
        if (!/video\.twimg\.com/i.test(url) && !/\.(mp4|mov|webm)(\?|$)/i.test(url)) return;
        candidates.push({ url, bitrate: Number(bitrate) || 0 });
    };

    const scan = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            const pathStr = path.join('.').toLowerCase();
            if (/(video|variant|mp4|playback)/i.test(pathStr)) {
                addCandidate(value, 0);
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) scan(value[i], path.concat(String(i)));
            return;
        }

        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                const nextPath = path.concat(k);
                const pathStr = nextPath.join('.').toLowerCase();

                if (k === 'url' && typeof v === 'string' && /(video|variant|playback)/i.test(pathStr)) {
                    addCandidate(v, value?.bitrate || 0);
                } else if (k === 'variants' && Array.isArray(v)) {
                    for (const item of v) {
                        if (item?.url) addCandidate(item.url, item?.bitrate || 0);
                    }
                } else {
                    scan(v, nextPath);
                }
            }
        }
    };

    scan(tweet);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.bitrate - a.bitrate);
    return candidates[0].url;
}

function extractTweetMedia(tweet) {
    const rawCandidates = [];

    const walk = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value)) {
                const pathStr = path.join('.').toLowerCase();
                if (/(photo|photos|media|mediadetails|video|variant|thumb|thumbnail|poster|preview|image|card|gallery)/i.test(pathStr)) {
                    rawCandidates.push({ url: value, path });
                }
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) walk(value[i], path.concat(String(i)));
            return;
        }

        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                walk(v, path.concat(k));
            }
        }
    };

    walk(tweet);

    const { images, videos } = splitMediaUrls(rawCandidates);
    const bestVideo = pickBestVideoUrl(tweet);
    if (bestVideo && !videos.includes(bestVideo)) videos.unshift(bestVideo);

    // 確保不把 profile images 帶進來
    const cleanImages = images.filter(u => !/profile_images|emoji/i.test(u));
    const cleanVideos = videos.filter(u => !/profile_images|emoji/i.test(u));

    return {
        images: [...new Set(cleanImages)],
        videos: [...new Set(cleanVideos)]
    };
}

function buildTwitterPayload(tweet) {
    const tweetId = tweet?.id_str || tweet?.id || '';
    const screenName = tweet?.user?.screen_name || TARGET_USER.username;
    const authorName = tweet?.user?.name || screenName;
    const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

    const rawText =
        tweet?.text ||
        tweet?.full_text ||
        tweet?.legacy?.full_text ||
        tweet?.legacy?.text ||
        '';
    const text = stripHtml(rawText);

    const { images, videos } = extractTweetMedia(tweet);

    const mainEmbed = new EmbedBuilder()
        .setTitle(`🐦 ${authorName} 發布新推文`)
        .setURL(tweetUrl)
        .setColor(0x1DA1F2)
        .setTimestamp(tweet?.created_at ? new Date(tweet.created_at) : new Date());

    if (text) {
        mainEmbed.setDescription(text.slice(0, 4000));
    } else {
        mainEmbed.setDescription('（沒有文字內容）');
    }

    if (images[0]) {
        mainEmbed.setImage(images[0]);
    }

    const fields = [];

    if (images.length > 1) {
        fields.push({
            name: '📷 其他圖片',
            value: images.slice(1, 5).map((u, i) => `[圖片 ${i + 2}](${u})`).join('\n')
        });
    }

    if (videos.length > 0) {
        fields.push({
            name: '🎬 影片',
            value: videos.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')
        });
    }

    if (fields.length > 0) {
        mainEmbed.addFields(fields);
    }

    const embeds = [mainEmbed];

    for (const img of images.slice(1, 5)) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setImage(img)
        );
    }

    if (videos.length > 0) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setDescription(`🎬 影片連結：\n${videos.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')}`)
        );
    }

    return {
        content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}`,
        embeds,
        allowedMentions: { roles: [PING_ROLE_ID] }
    };
}

async function deliverTwitterTweet(tweet, manual = false, interaction = null) {
    const payload = buildTwitterPayload(tweet);

    if (manual && interaction) {
        await interaction.reply(payload).catch(() => {});
        return;
    }

    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
    if (channel) {
        await channel.send(payload).catch(() => {});
    }
}

async function checkTwitterUpdates(manual = false, interaction = null) {
    try {
        const timeline = await fetchTwitterTimelineProfile(TARGET_USER.username);
        const latestTweetId = timeline.tweetIds?.[0];

        if (!latestTweetId) {
            if (manual && interaction) {
                await interaction.reply('❌ 沒抓到任何推文 ID。').catch(() => {});
            }
            return;
        }

        // 第一次跑先鎖定基線
        if (lastTweetId === null) {
            lastTweetId = latestTweetId;
            if (!manual) {
                console.log(`📡 [觀測系統] X/Syndication 初始基線鎖定成功，最新 ID: ${latestTweetId}`);
                return;
            }
        }

        // 手動測試：直接回傳最新一則，不管有沒有新內容
        if (manual) {
            const tweet = await fetchTweetResult(latestTweetId);
            await deliverTwitterTweet(tweet, true, interaction);
            return;
        }

        // 自動輪詢：只有新 ID 才推送
        if (latestTweetId !== lastTweetId) {
            const tweet = await fetchTweetResult(latestTweetId);
            lastTweetId = latestTweetId;
            await deliverTwitterTweet(tweet, false, null);
        }
    } catch (e) {
        console.error('❌ [X/Syndication] 觀測失敗：', e?.message || e);

        if (manual && interaction) {
            await interaction.reply(`❌ **X/Syndication 觀測失敗**\n\`${e?.message || e}\``).catch(() => {});
        }
    }
}

// ==================== 🚂 Steam 觀測系統 ====================
async function checkSteamUpdates(manual = false, interaction = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=1');
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];

        if (newsItem) {
            if (lastSteamNewsId === null) {
                lastSteamNewsId = newsItem.gid;
                if (!manual) {
                    console.log(`🚂 [觀測系統] Steam 新聞初始基線鎖定成功，當前最新 ID: ${newsItem.gid}`);
                    return;
                }
            }

            if (newsItem.gid !== lastSteamNewsId || manual) {
                if (!manual) lastSteamNewsId = newsItem.gid;

                const embed = new EmbedBuilder()
                    .setTitle(`🚂 [Steam新聞] ${newsItem.title}`)
                    .setURL(newsItem.url)
                    .setColor(0x00A8E8)
                    .setTimestamp();

                if (manual && interaction) {
                    await interaction.reply({ embeds: [embed] }).catch(() => {});
                } else {
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                    if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION}`, embeds: [embed] }).catch(() => {});
                }
            } else {
                if (manual && interaction) await interaction.reply('✅ 目前無新公告。').catch(() => {});
            }
        }
    } catch (e) {
        if (manual && interaction) await interaction.reply('❌ **Steam API 錯誤**').catch(() => {});
    }
}

async function performSystemChecks() {
    await checkTwitterUpdates();
    await checkSteamUpdates();
}

// ==================== 🛠️ UI 構建器 ====================
function buildPackEmbed(userId, page) {
    const pData = getPlayer(userId);
    const user = client.users.cache.get(userId);
    const username = user ? user.username : '主管';
    const allItems = [
        ...Object.entries(pData.inventory).map(([k, v]) => `👤 ${k} x${v}`),
        ...Object.entries(pData.egos).map(([k, v]) => `⚔️ ${k} x${v}`)
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
            { name: '📚 持有內容', value: pageItems.length > 0 ? pageItems.join('\n') : '空空如也' }
        );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage - 1}`).setLabel('◀上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1)
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pack_equip_${userId}`).setLabel('🎖️ 裝備').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pack_team_${userId}`).setLabel('👥 編隊').setStyle(ButtonStyle.Success)
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

    if (stdPool.length > 0) {
        desc += `🔹 **[普通] (頁數 ${safePage + 1}/${totalPages})**:\n${pageItems.map(i => `• ${i}`).join('\n')}`;
    } else {
        desc += `🔹 (此卡池目前沒有一般對象)`;
    }

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
        new ButtonBuilder().setCustomId(`list_nav_${rarity}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1)
    );

    return { embeds: [embed], components: [selectMenuRow, navRow] };
}

// ==================== 🤖 Discord Bot 核心事件 ====================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 已登入：${client.user.tag}`);
    loadDatabase();
    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: '基線鎖定與狀態監控版' }]
    });
    setInterval(performSystemChecks, 60 * 1000);
    performSystemChecks();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const msg = message.content.trim();
    if (!msg) return;
    const args = msg.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ⚙️ 狀態觀測指令
    if (cmd === '!status') {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Angela 系統觀測核心狀態')
            .setColor(0x457B9D)
            .addFields(
                { name: '🟢 運行時間', value: `${hrs} 小時 ${mins} 分鐘 ${secs} 秒`, inline: true },
                { name: '⚡ 系統延遲', value: `${client.ws.ping}ms`, inline: true },
                { name: '💾 資料庫連線', value: `已連線 (${Object.keys(playersDB).length} 位主管紀錄)`, inline: true },
                { name: '𝕏 Syndication 觀測基線', value: lastTweetId ? `🔒 已鎖定 ID: ${lastTweetId}` : '⏳ 正在建立...', inline: false },
                { name: '🚂 Steam 新聞基線', value: lastSteamNewsId ? `🔒 已鎖定 ID: ${lastSteamNewsId}` : '⏳ 正在建立...', inline: false }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] }).catch(() => {});
    }

    if (cmd === '!testtweet') return checkTwitterUpdates(true, message);
    if (cmd === '!teststeam') return checkSteamUpdates(true, message);

    if (cmd === '!givelunacy') {
        if (message.author.username !== 'sles_forever') return message.reply('❌ 權限不足。').catch(() => {});
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return message.reply('📝 !givelunacy @user 數量').catch(() => {});

        getPlayer(target.id).lunacy += amount;
        saveDatabase();
        return message.reply(`✅ 给予 ${amount} Lunacy。`).catch(() => {});
    }

    if (cmd === '!pull' || cmd === '!10pulls') {
        const player = getPlayer(message.author.id);
        const isTen = (cmd === '!10pulls');
        const cost = isTen ? 1300 : 130;

        if (player.lunacy < cost) return message.reply(`❌ **Lunacy 不足** (餘額: ${player.lunacy})`).catch(() => {});
        player.lunacy -= cost;

        const results = [];
        const count = isTen ? 10 : 1;

        for (let i = 0; i < count; i++) {
            const rarity = (isTen && i === 9) ? buildRarityGuaranteed() : buildRarity();
            let finalName = identitiesData?.pullUpIdentity?.(rarity);
            let display;

            if (finalName && Math.random() < 0.25) {
                display = `✨ **[PICK-UP!]** ${finalName}`;
            } else {
                finalName = identitiesData?.pullIdentity?.(rarity);
                display = finalName || '未知記憶碎片';
            }

            if (rarity === 'Egos') player.egos[finalName] = (player.egos[finalName] || 0) + 1;
            else player.inventory[finalName] = (player.inventory[finalName] || 0) + 1;

            results.push(`${display} (${rarityToStars(rarity)})`);
        }

        saveDatabase();
        return message.reply(
            isTen
                ? `✨ **十連提取 (剩餘 ${player.lunacy})：**\n${results.join('\n')}`
                : `🎯 **單抽 (剩餘 ${player.lunacy})：**\n${results[0]}`
        ).catch(() => {});
    }

    // 修復確保 !pack 指令有反應
    if (cmd === '!pack' || cmd === '!check') {
        const targetUser = message.mentions.users.first() || message.author;
        return message.reply(buildPackEmbed(targetUser.id, 0)).catch(() => {});
    }

    // 修復確保 !list 指令有反應
    if (cmd === '!list') {
        const embed = new EmbedBuilder()
            .setTitle('📈 提取機率總覽')
            .setColor(0x457B9D)
            .setDescription('選擇稀有度查看：');
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('list_select')
                .setPlaceholder('選擇稀有度...')
                .addOptions(Object.keys(RARITY_RATES).map(r => ({ label: `${r} 卡池`, value: r })))
        );
        return message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (cmd === '!stages') {
        const player = getPlayer(message.author.id);
        if (!player.team || player.team.length === 0) return message.reply('⚠️ 主管，請先透過 !pack 編排作戰隊伍才能出擊！').catch(() => {});

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
                    { label: '核心高階收尾人 (地獄) ➔ 獎勵 1500 Lunacy', value: '2000_1500' }
                ])
        );
        return message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (cmd === '!trade') {
        const target = message.mentions.users.first();
        if (!target || target.id === message.author.id) return message.reply('📝 用法: !trade @目標玩家').catch(() => {});
        if (target.bot) return message.reply('❌ 無法與 AI 交易。').catch(() => {});

        const embed = new EmbedBuilder()
            .setTitle('🔄 交易請求')
            .setDescription(`<@${target.id}>，**${message.author.username}** 發起交易。是否接受？`)
            .setColor(0xF4A261);
        const tradeId = Date.now().toString();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('✅ 接受').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );

        const tradeMsg = await message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] }).catch(() => {});

        if (tradeMsg) {
            activeTrades.set(tradeId, {
                originalMsgId: tradeMsg.id,
                channelId: tradeMsg.channel.id,
                p1: { id: message.author.id, name: message.author.username, offer: null, confirmed: false },
                p2: { id: target.id, name: target.username, offer: null, confirmed: false }
            });
        }
    }
});

// ==================== 🎛️ 全域互動處理核心 ====================
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        const customId = interaction.customId;
        if (!customId) return;

        // --- 🎒 檔案館導覽 ---
        if (interaction.isButton() && customId.startsWith('pack_')) {
            const parts = customId.split('_');
            const action = parts[1];
            const targetId = parts[2];
            const arg = parts[3];

            if (interaction.user.id !== targetId && interaction.user.id !== 'sles_forever') {
                return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true }).catch(() => {});
            }

            if (action === 'nav') return interaction.update(buildPackEmbed(targetId, parseInt(arg))).catch(() => {});
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
            if (interaction.user.id !== targetId) return;

            const pData = getPlayer(targetId);
            const selection = interaction.values[0];

            if (action === 'equip') {
                pData.equipped = selection;
                saveDatabase();
                return interaction.update(buildPackEmbed(targetId, 0)).catch(() => {});
            }

            if (action === 'team') {
                if (pData.team.includes(selection)) pData.team = pData.team.filter(x => x !== selection);
                else if (pData.team.length < 7) pData.team.push(selection);
                saveDatabase();
                return interaction.update({
                    embeds: [new EmbedBuilder().setTitle('👥 編隊').setDescription(`隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}`).setColor(0x457B9D)]
                }).catch(() => {});
            }
        }

        // --- 📈 List 翻頁 ---
        if (interaction.isStringSelectMenu() && customId === 'list_select') return interaction.update(buildListEmbed(interaction.values[0], 0)).catch(() => {});
        if (interaction.isButton() && customId.startsWith('list_nav_')) return interaction.update(buildListEmbed(customId.split('_')[2], parseInt(customId.split('_')[3]))).catch(() => {});

        // --- ⚔️ 戰鬥系統結算處理 ---
        if (interaction.isStringSelectMenu() && customId.startsWith('stage_select_')) {
            const expectedUserId = customId.split('_')[2];
            if (interaction.user.id !== expectedUserId) {
                return interaction.reply({ content: '❌ 這不是你的作戰面板！', ephemeral: true }).catch(() => {});
            }

            const player = getPlayer(interaction.user.id);
            const [powerStr, rewardStr] = interaction.values[0].split('_');
            const eFinal = parseInt(powerStr) * (0.9 + Math.random() * 0.2);
            let pClash = 0;

            if (player.team && Array.isArray(player.team)) {
                player.team.forEach(() => {
                    pClash += Math.floor(Math.random() * 25 + 15);
                });
            }
            const pFinal = pClash * (0.8 + Math.random() * 0.4);
            const isWin = pFinal >= eFinal;

            const embed = new EmbedBuilder()
                .setTitle('⚔️ 戰鬥結算報告')
                .addFields(
                    { name: '🔹 我方小隊戰力判定', value: `${Math.floor(pFinal)}`, inline: true },
                    { name: '🔸 敵方區域威脅判定', value: `${Math.floor(eFinal)}`, inline: true },
                    { name: '🏆 戰役結果', value: isWin ? `✅ 壓制成功！獲得 **${rewardStr}** Lunacy` : '❌ 壓制失敗，小隊全滅回溯。', inline: false }
                )
                .setColor(isWin ? 0x2A9D8F : 0xE63946);

            if (isWin) {
                player.lunacy += parseInt(rewardStr);
                saveDatabase();
            }
            return interaction.update({ embeds: [embed], components: [] }).catch(() => {});
        }

        // --- 🔄 交易系統 ---
        if (customId.startsWith('trade_')) {
            const parts = customId.split('_');
            const act = parts[1];
            const tId = parts[2];
            const trade = activeTrades.get(tId);

            if (!trade) return interaction.reply({ content: '❌ 交易過期。', ephemeral: true }).catch(() => {});

            if (act === 'acc') {
                if (interaction.user.id !== trade.p2.id) return interaction.reply({ content: '❌ 僅限被邀請者。', ephemeral: true }).catch(() => {});
                const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F).addFields(
                    { name: `P1: ${trade.p1.name}`, value: '提供: 未選擇', inline: true },
                    { name: `P2: ${trade.p2.name}`, value: '提供: 未選擇', inline: true }
                );
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p1`).setLabel(`${trade.p1.name} 選物`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p2`).setLabel(`${trade.p2.name} 選物`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_ok_${tId}`).setLabel('✅ 確認交易').setStyle(ButtonStyle.Success)
                );
                return interaction.update({ content: null, embeds: [embed], components: [row] }).catch(() => {});
            }

            if (act === 'dec') {
                if (interaction.user.id !== trade.p2.id) return;
                activeTrades.delete(tId);
                return interaction.update({ content: '❌ 交易拒絕。', embeds: [], components: [] }).catch(() => {});
            }

            if (act === 'pick') {
                const playerKey = parts[3];
                if (interaction.user.id !== trade[playerKey].id) return interaction.reply({ content: '❌ 非您的按鈕。', ephemeral: true }).catch(() => {});

                const pData = getPlayer(interaction.user.id);
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
                trade[playerKey].offer = interaction.values[0];
                trade.p1.confirmed = trade.p2.confirmed = false;

                const channel = await client.channels.fetch(trade.channelId).catch(() => {});
                if (channel) {
                    const originalMsg = await channel.messages.fetch(trade.originalMsgId).catch(() => {});
                    if (originalMsg) {
                        const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F).addFields(
                            { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '未選擇'}`, inline: true },
                            { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '未選擇'}`, inline: true }
                        );
                        await originalMsg.edit({ embeds: [embed] }).catch(() => {});
                    }
                }
                return interaction.update({ content: '✅ 選擇完畢，請在原對話框按確認。', components: [] }).catch(() => {});
            }

            if (act === 'ok') {
                const isP1 = interaction.user.id === trade.p1.id;
                const isP2 = interaction.user.id === trade.p2.id;

                if (!isP1 && !isP2) return interaction.reply({ content: '❌ 無權限。', ephemeral: true }).catch(() => {});
                if (!trade.p1.offer || !trade.p2.offer) return interaction.reply({ content: '❌ 雙方皆須放物品。', ephemeral: true }).catch(() => {});

                if (isP1) trade.p1.confirmed = true;
                if (isP2) trade.p2.confirmed = true;

                if (trade.p1.confirmed && trade.p2.confirmed) {
                    const p1Data = getPlayer(trade.p1.id), p2Data = getPlayer(trade.p2.id);

                    function transferItem(fromDB, toDB, itemName) {
                        if (fromDB.inventory[itemName]) {
                            fromDB.inventory[itemName]--;
                            if (fromDB.inventory[itemName] <= 0) {
                                delete fromDB.inventory[itemName];
                                if (fromDB.equipped === itemName) fromDB.equipped = null;
                                fromDB.team = fromDB.team.filter(x => x !== itemName);
                            }
                            toDB.inventory[itemName] = (toDB.inventory[itemName] || 0) + 1;
                        } else if (fromDB.egos[itemName]) {
                            fromDB.egos[itemName]--;
                            if (fromDB.egos[itemName] <= 0) delete fromDB.egos[itemName];
                            toDB.egos[itemName] = (toDB.egos[itemName] || 0) + 1;
                        }
                    }

                    transferItem(p1Data, p2Data, trade.p1.offer);
                    transferItem(p2Data, p1Data, trade.p2.offer);
                    saveDatabase();
                    activeTrades.delete(tId);

                    return interaction.update({
                        embeds: [new EmbedBuilder().setTitle('✅ 交易成功').setColor(0x2A9D8F).setDescription(`**${trade.p1.name}** 得 ${trade.p2.offer}\n**${trade.p2.name}** 得 ${trade.p1.offer}`)],
                        components: []
                    }).catch(() => {});
                } else {
                    return interaction.reply({ content: '✅ 您已確認。等待對方...', ephemeral: true }).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('⚠️ 互動異常攔截處理成功。');
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => console.error('❌ 登入失敗：', err));
