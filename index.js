'use strict';

// ==================== 🛡️ 全域防崩潰守護神系統 ====================
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [全域安全攔截] 未處理的 Promise 拒絕：', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ [全域安全攔截] 未捕獲的例外事件：', err);
});

const crypto = require('crypto');
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const identitiesData = require('./identitiesData.js');

// ==================== 💾 暫存資料庫（Render 重啟會清空） ====================
let playersDB = {};
let saveTimer = null;

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        // 暫存版：只保留在記憶體，不寫檔
    }, 150);
}

function ensurePlayerSchema(userId) {
    if (!playersDB[userId]) playersDB[userId] = {};

    const p = playersDB[userId];
    let changed = false;

    if (typeof p.lunacy !== 'number') {
        p.lunacy = 0;
        changed = true;
    }
    if (!p.inventory || typeof p.inventory !== 'object' || Array.isArray(p.inventory)) {
        p.inventory = {};
        changed = true;
    }
    if (!p.egos || typeof p.egos !== 'object' || Array.isArray(p.egos)) {
        p.egos = {};
        changed = true;
    }
    if (!Array.isArray(p.team)) {
        p.team = [];
        changed = true;
    }
    if (p.equipped === undefined) {
        p.equipped = null;
        changed = true;
    }
    if (typeof p.starterGranted !== 'boolean') {
        p.starterGranted = false;
        changed = true;
    }

    if (!p.starterGranted && Object.keys(p.inventory).length === 0 && Object.keys(p.egos).length === 0) {
        const baseSinners = identitiesData?.identities?.['0'] || [];
        for (const sinner of baseSinners) {
            const name = typeof sinner === 'string' ? sinner : (sinner?.name || '');
            if (name) p.inventory[name] = 1;
        }
        p.starterGranted = true;
        changed = true;
    }

    if (changed) scheduleSave();
    return p;
}

function getPlayer(userId) {
    return ensurePlayerSchema(userId);
}

// ==================== 🌐 網頁伺服器設定 ====================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.sendStatus(200));

try {
    const server = app.listen(PORT, () => console.log(`網頁伺服器啟動於通訊埠 ${PORT}`));
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`⚠️ [網路警告] 連接埠 ${PORT} 已被佔用，跳過網頁監聽，Discord 服務繼續啟動...`);
        } else {
            console.error('❌ 網頁伺服器發生異常:', err);
        }
    });
} catch (e) {
    console.error('❌ 網頁伺服器啟動失敗:', e);
}

// ==================== 📡 系統常數與觀測設定 ====================
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const PING_ROLE_ID = process.env.PING_ROLE_ID || '1406984068725211177';
const PING_ROLE_MENTION = `<@&${PING_ROLE_ID}>`;
const OWNER_ID = process.env.OWNER_ID || '請填你的DiscordID';
const TARGET_USER = { username: process.env.TWITTER_USERNAME || 'LimbusCompany_B' };

const NITTER_NODES = (process.env.NITTER_NODES ||
    'https://nitter.net,https://nitter.poast.org,https://nitter.privacydev.net,https://nitter.lucabased.xyz,https://nitter.so,https://nitter.moomoo.me')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

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

// ==================== 🧰 工具 ====================
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

function readTimelineText(rawText = '') {
    const raw = String(rawText || '').trim();
    if (!raw) return '';
    try {
        const json = JSON.parse(raw);
        return String(json?.body ?? raw);
    } catch (_) {}

    const jsonpMatch = raw.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
    if (jsonpMatch) {
        try {
            const json = JSON.parse(jsonpMatch[1]);
            return String(json?.body ?? jsonpMatch[1]);
        } catch (_) {
            return jsonpMatch[1];
        }
    }
    return raw;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    }).finally(() => clearTimeout(timeout));
}

async function sendLike(target, payload) {
    if (!target) return null;
    if (typeof target.reply === 'function') return target.reply(payload);
    if (typeof target.send === 'function') return target.send(payload);
    return null;
}

function escapeRegExp(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

        if (keys.some(k => k.toLowerCase() === key.toLowerCase())) {
            out.push(decodeHtmlEntities(content));
        }
    }

    return [...new Set(out.filter(Boolean))];
}

// ==================== 📡 X / Twitter Syndication 觀測系統 ====================
async function fetchTwitterRssLatest(screenName) {
    const shuffled = [...NITTER_NODES].sort(() => Math.random() - 0.5);
    const errors = [];

    for (const nodeUrl of shuffled) {
        try {
            const response = await fetchWithTimeout(`${nodeUrl}/${encodeURIComponent(screenName)}/rss`, {}, 8000);
            if (!response.ok) {
                errors.push(`${nodeUrl} (${response.status})`);
                continue;
            }

            const text = await response.text();
            const itemMatch = text.match(/<item>([\s\S]*?)<\/item>/i);
            if (!itemMatch) {
                errors.push(`${nodeUrl} (no item)`);
                continue;
            }

            const itemBlock = itemMatch[1];
            const link = itemBlock.match(/<link>(.*?)<\/link>/i)?.[1];
            const id = itemBlock.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1];
            const title = itemBlock.match(/<title>([\s\S]*?)<\/title>/i)?.[1];

            if (link && id) {
                return {
                    source: 'rss',
                    link: link.replace(/^http:\/\//, 'https://'),
                    id: String(id).trim(),
                    title: title ? stripHtml(title) : ''
                };
            }

            errors.push(`${nodeUrl} (bad item)`);
        } catch (_) {
            errors.push(`${nodeUrl} (Error/Timeout)`);
        }
    }

    throw new Error(errors.length ? errors.join('\n') : '所有節點無法連線');
}

async function fetchTwitterTimelineProfile(screenName) {
    const attempts = [
        `https://syndication.twitter.com/timeline/profile?screen_name=${encodeURIComponent(screenName)}&lang=zh-hant&dnt=false&callback=__twttrf.callback&rnd=${Math.random()}`,
        `https://syndication.twitter.com/timeline/profile?screen_name=${encodeURIComponent(screenName)}&lang=en&dnt=false&callback=__twttrf.callback&rnd=${Math.random()}`
    ];

    let lastError = null;

    for (const url of attempts) {
        try {
            const response = await fetchWithTimeout(url, {}, 10000);
            if (!response.ok) {
                lastError = new Error(`timeline/profile HTTP ${response.status}`);
                continue;
            }

            const text = await response.text();
            const body = readTimelineText(text);
            const tweetIds = extractTweetIdsFromText(body);

            if (tweetIds.length > 0) {
                return {
                    source: 'timeline',
                    raw: text,
                    body,
                    tweetIds
                };
            }

            lastError = new Error('timeline/profile 沒有抓到 tweet id');
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('timeline/profile 失敗');
}

async function fetchTweetResult(tweetId) {
    const attempts = [
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh`,
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en`,
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh&token=!`
    ];

    let lastError = null;

    for (const url of attempts) {
        try {
            const response = await fetchWithTimeout(url, {}, 10000);
            if (!response.ok) {
                lastError = new Error(`tweet-result HTTP ${response.status}`);
                continue;
            }
            return await response.json();
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('tweet-result 失敗');
}

async function fetchTweetHtml(tweetUrl) {
    const response = await fetchWithTimeout(tweetUrl, {}, 10000);
    if (!response.ok) throw new Error(`tweet page HTTP ${response.status}`);
    return await response.text();
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
            for (const [k, v] of Object.entries(value)) walk(v, path.concat(k));
        }
    };

    walk(tweet);

    const images = [];
    const videos = [];

    for (const { url, path } of rawCandidates) {
        const u = String(url).toLowerCase();
        const key = path.join('.').toLowerCase();

        if (/profile_images|emoji/i.test(u)) continue;

        const looksLikeVideo =
            u.includes('video.twimg.com') ||
            u.endsWith('.mp4') ||
            u.endsWith('.mov') ||
            u.endsWith('.webm') ||
            u.endsWith('.m3u8') ||
            key.includes('video') ||
            key.includes('mp4') ||
            key.includes('variant') ||
            key.includes('playback') ||
            key.includes('stream');

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
    }

    return {
        images: [...new Set(images)],
        videos: [...new Set(videos)]
    };
}

function buildTwitterPayloadFromTweetResult(tweet, fallbackScreenName = TARGET_USER.username) {
    const tweetId = tweet?.id_str || tweet?.id || '';
    const screenName = tweet?.user?.screen_name || fallbackScreenName;
    const authorName = tweet?.user?.name || screenName;
    const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

    const rawText =
        tweet?.full_text ||
        tweet?.text ||
        tweet?.legacy?.full_text ||
        tweet?.legacy?.text ||
        tweet?.body ||
        '';

    const text = stripHtml(rawText);
    const { images, videos } = extractTweetMedia(tweet);

    const mainEmbed = new EmbedBuilder()
        .setTitle(`🐦 ${authorName} 發布新推文`)
        .setURL(tweetUrl)
        .setColor(0x1DA1F2)
        .setTimestamp(tweet?.created_at ? new Date(tweet.created_at) : new Date());

    mainEmbed.setDescription((text || '（沒有文字內容）').slice(0, 4000));
    if (images[0]) mainEmbed.setImage(images[0]);

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
    if (fields.length > 0) mainEmbed.addFields(fields);

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

function buildTwitterPayloadFromHtml(html, tweetUrl, fallbackTitle = '最新推文') {
    const titleValues = extractMetaValues(html, ['og:title', 'twitter:title']);
    const descValues = extractMetaValues(html, ['og:description', 'twitter:description']);
    const imageValues = extractMetaValues(html, ['og:image', 'twitter:image']);
    const videoValues = extractMetaValues(html, ['og:video', 'og:video:url', 'twitter:player:stream']);

    const title = titleValues[0] || fallbackTitle;
    const desc = descValues[0] || '（無法直接讀取文字內容）';

    const embed = new EmbedBuilder()
        .setTitle(`🐦 ${title}`)
        .setURL(tweetUrl)
        .setColor(0x1DA1F2)
        .setTimestamp();

    embed.setDescription(stripHtml(desc).slice(0, 4000));
    if (imageValues[0]) embed.setImage(imageValues[0]);

    const fields = [];
    if (imageValues.length > 1) {
        fields.push({
            name: '📷 其他圖片',
            value: imageValues.slice(1, 5).map((u, i) => `[圖片 ${i + 2}](${u})`).join('\n')
        });
    }
    if (videoValues.length > 0) {
        fields.push({
            name: '🎬 影片',
            value: videoValues.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')
        });
    }
    if (fields.length > 0) embed.addFields(fields);

    const embeds = [embed];
    for (const img of imageValues.slice(1, 5)) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setImage(img)
        );
    }

    return {
        content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}`,
        embeds,
        allowedMentions: { roles: [PING_ROLE_ID] }
    };
}

async function deliverTwitterTweetById(tweetId, manual = false, target = null, fallbackScreenName = TARGET_USER.username) {
    const tweetUrl = `https://x.com/${fallbackScreenName}/status/${tweetId}`;

    try {
        const tweet = await fetchTweetResult(tweetId);
        const payload = buildTwitterPayloadFromTweetResult(tweet, fallbackScreenName);
        if (manual) return sendLike(target, payload);
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
        if (channel) await channel.send(payload).catch(() => {});
        return;
    } catch (e1) {
        console.error('⚠️ tweet-result 失敗，改抓 X HTML：', e1?.message || e1);
    }

    try {
        const html = await fetchTweetHtml(tweetUrl);
        const payload = buildTwitterPayloadFromHtml(html, tweetUrl, '最新推文');
        if (manual) return sendLike(target, payload);
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
        if (channel) await channel.send(payload).catch(() => {});
        return;
    } catch (e2) {
        console.error('⚠️ X HTML 也失敗：', e2?.message || e2);

        const fallback = {
            content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}\n（內容抓取失敗，只能先丟連結）`,
            allowedMentions: { roles: [PING_ROLE_ID] }
        };

        if (manual) return sendLike(target, fallback);
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
        if (channel) await channel.send(fallback).catch(() => {});
    }
}

async function checkTwitterUpdates(manual = false, target = null) {
    try {
        let latest = null;

        try {
            latest = await fetchTwitterRssLatest(TARGET_USER.username);
        } catch (e) {
            console.error('⚠️ RSS 失敗，改用 syndication:', e?.message || e);
        }

        if (!latest) {
            const timeline = await fetchTwitterTimelineProfile(TARGET_USER.username);
            const latestTweetId = timeline.tweetIds?.[0];
            if (latestTweetId) {
                latest = {
                    source: 'timeline',
                    id: latestTweetId,
                    link: `https://x.com/${TARGET_USER.username}/status/${latestTweetId}`,
                    title: ''
                };
            }
        }

        if (!latest?.id) {
            if (manual) return sendLike(target, `❌ **觀測失敗**\n所有節點與備援來源都沒抓到推文。`);
            throw new Error('沒有抓到任何推文 ID');
        }

        if (lastTweetId === null) {
            lastTweetId = latest.id;
            if (!manual) {
                console.log(`📡 [觀測系統] Twitter 初始基線鎖定成功，最新 ID: ${latest.id}`);
                return;
            }
        }

        if (manual) {
            await deliverTwitterTweetById(latest.id, true, target);
            return;
        }

        if (latest.id !== lastTweetId) {
            lastTweetId = latest.id;
            await deliverTwitterTweetById(latest.id, false, null);
        }
    } catch (e) {
        console.error('❌ [X/Twitter] 觀測失敗：', e?.message || e);
        if (manual) return sendLike(target, `❌ **觀測失敗**\n${e?.message || e}`);
    }
}

// ==================== 🚂 Steam 觀測系統 ====================
async function checkSteamUpdates(manual = false, target = null) {
    try {
        const response = await fetchWithTimeout(
            'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=5&format=json',
            {},
            10000
        );
        if (!response.ok) throw new Error(`Steam API HTTP ${response.status}`);

        const data = await response.json();
        const newsItems = Array.isArray(data?.appnews?.newsitems) ? data.appnews.newsitems : [];
        const newsItem = newsItems[0];

        if (!newsItem) {
            if (manual) return sendLike(target, '❌ 沒有抓到 Steam 新聞。');
            return;
        }

        if (lastSteamNewsId === null) {
            lastSteamNewsId = String(newsItem.gid);
            if (!manual) {
                console.log(`🚂 [觀測系統] Steam 新聞初始基線鎖定成功，當前最新 ID: ${newsItem.gid}`);
                return;
            }
        }

        if (manual) {
            const embed = new EmbedBuilder()
                .setTitle(`🚂 [Steam新聞] ${newsItem.title}`)
                .setURL(newsItem.url)
                .setColor(0x00A8E8)
                .setTimestamp();

            return sendLike(target, { embeds: [embed] });
        }

        if (String(newsItem.gid) !== String(lastSteamNewsId)) {
            lastSteamNewsId = String(newsItem.gid);

            const embed = new EmbedBuilder()
                .setTitle(`🚂 [Steam新聞] ${newsItem.title}`)
                .setURL(newsItem.url)
                .setColor(0x00A8E8)
                .setTimestamp();

            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
            if (channel) {
                await channel.send({
                    content: `🔔 ${PING_ROLE_MENTION}`,
                    embeds: [embed],
                    allowedMentions: { roles: [PING_ROLE_ID] }
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('❌ [Steam] 觀測失敗：', e?.message || e);
        if (manual) return sendLike(target, '❌ **Steam API 錯誤**');
    }
}

async function performSystemChecks() {
    await checkTwitterUpdates(false, null);
    await checkSteamUpdates(false, null);
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

// ==================== 🔄 交易系統 ====================
function createTrade({ channelId, originalMsgId, p1, p2 }) {
    const tradeId = crypto.randomUUID();
    const timer = setTimeout(() => clearTrade(tradeId), 10 * 60 * 1000);

    activeTrades.set(tradeId, {
        timer,
        channelId,
        originalMsgId,
        p1: { id: p1.id, name: p1.name, offer: null, confirmed: false },
        p2: { id: p2.id, name: p2.name, offer: null, confirmed: false }
    });

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

async function refreshTradeMessage(trade) {
    const channel = await client.channels.fetch(trade.channelId).catch(() => null);
    if (!channel) return;

    const originalMsg = await channel.messages.fetch(trade.originalMsgId).catch(() => null);
    if (!originalMsg) return;

    const embed = new EmbedBuilder()
        .setTitle('🔄 交易終端')
        .setColor(0x2A9D8F)
        .addFields(
            { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '未選擇'}`, inline: true },
            { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '未選擇'}`, inline: true }
        );

    await originalMsg.edit({ embeds: [embed] }).catch(() => {});
}

// ==================== 🤖 Discord Bot 核心事件 ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 已登入：${client.user.tag}`);

    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: '基線鎖定與狀態監控版' }]
    });

    setInterval(performSystemChecks, 60 * 1000);
    performSystemChecks();
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;
        const msg = message.content.trim();
        if (!msg) return;

        const args = msg.split(/\s+/);
        const cmd = args[0].toLowerCase();

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
                    { name: '💾 資料庫連線', value: `暫存中 (${Object.keys(playersDB).length} 位主管紀錄)`, inline: true },
                    { name: '📡 Twitter 觀測基線', value: lastTweetId ? `🔒 已鎖定 ID: \`${lastTweetId}\`` : '⏳ 正在建立...', inline: false },
                    { name: '🚂 Steam 新聞基線', value: lastSteamNewsId ? `🔒 已鎖定 ID: \`${lastSteamNewsId}\`` : '⏳ 正在建立...', inline: false },
                    { name: '💾 儲存模式', value: '暫存記憶體（更新 / 重啟會清空）', inline: false }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] }).catch(() => {});
        }

        if (cmd === '!testtweet') return checkTwitterUpdates(true, message);
        if (cmd === '!teststeam') return checkSteamUpdates(true, message);

        if (cmd === '!givelunacy') {
            if (message.author.id !== OWNER_ID) return message.reply('❌ 權限不足。').catch(() => {});
            const target = message.mentions.users.first();
            const amount = parseInt(args[2], 10);
            if (!target || Number.isNaN(amount)) return message.reply('📝 `!givelunacy @user 數量`').catch(() => {});
            getPlayer(target.id).lunacy += amount;
            scheduleSave();
            return message.reply(`✅ 给予 ${amount} Lunacy。`).catch(() => {});
        }

        if (cmd === '!pull' || cmd === '!10pulls') {
            const player = getPlayer(message.author.id);
            const isTen = (cmd === '!10pulls');
            const cost = isTen ? 1300 : 130;

            if (player.lunacy < cost) {
                return message.reply(`❌ **Lunacy 不足** (餘額: ${player.lunacy})`).catch(() => {});
            }

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

            scheduleSave();
            return message.reply(
                isTen
                    ? `✨ **十連提取 (剩餘 ${player.lunacy})：**\n${results.join('\n')}`
                    : `🎯 **單抽 (剩餘 ${player.lunacy})：**\n${results[0]}`
            ).catch(() => {});
        }

        if (cmd === '!pack' || cmd === '!check') {
            const targetUser = message.mentions.users.first() || message.author;
            return message.reply(buildPackEmbed(targetUser.id, 0)).catch(() => {});
        }

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
            if (!player.team || player.team.length === 0) {
                return message.reply('⚠️ 主管，請先透過 `!pack` 編排作戰隊伍才能出擊！').catch(() => {});
            }

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
            if (!target || target.id === message.author.id) return message.reply('📝 用法: `!trade @目標玩家`').catch(() => {});
            if (target.bot) return message.reply('❌ 無法與 AI 交易。').catch(() => {});

            const tradeId = crypto.randomUUID();
            const embed = new EmbedBuilder()
                .setTitle('🔄 交易請求')
                .setDescription(`<@${target.id}>，**${message.author.username}** 發起交易。是否接受？`)
                .setColor(0xF4A261);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('✅ 接受').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
            );

            const tradeMsg = await message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] }).catch(() => {});
            if (tradeMsg) {
                activeTrades.set(tradeId, {
                    timer: setTimeout(() => clearTrade(tradeId), 10 * 60 * 1000),
                    channelId: tradeMsg.channel.id,
                    originalMsgId: tradeMsg.id,
                    p1: { id: message.author.id, name: message.author.username, offer: null, confirmed: false },
                    p2: { id: target.id, name: target.username, offer: null, confirmed: false }
                });
            }
        }
    } catch (e) {
        console.error('⚠️ messageCreate 內部錯誤：', e);
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

            if (interaction.user.id !== targetId && interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true }).catch(() => {});
            }

            if (action === 'nav') {
                return interaction.update(buildPackEmbed(targetId, parseInt(arg, 10))).catch(() => {});
            }

            if (action === 'back') {
                return interaction.update(buildPackEmbed(targetId, 0)).catch(() => {});
            }

            if (action === 'equip' || action === 'team') {
                const pData = getPlayer(targetId);
                const invKeys = Object.keys(pData.inventory);
                if (invKeys.length === 0) {
                    return interaction.reply({ content: '❌ 背包為空。', ephemeral: true }).catch(() => {});
                }

                const embed = new EmbedBuilder()
                    .setTitle(action === 'equip' ? '🎖️ 選擇裝備' : '👥 編隊')
                    .setDescription(action === 'team'
                        ? `隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}`
                        : '請選擇。')
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

            if (interaction.user.id !== targetId && interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true }).catch(() => {});
            }

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

                return interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('👥 編隊')
                            .setDescription(`隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}`)
                            .setColor(0x457B9D)
                    ]
                }).catch(() => {});
            }
        }

        // --- 📈 List 翻頁 ---
        if (interaction.isStringSelectMenu() && customId === 'list_select') {
            return interaction.update(buildListEmbed(interaction.values[0], 0)).catch(() => {});
        }

        if (interaction.isButton() && customId.startsWith('list_nav_')) {
            const parts = customId.split('_');
            return interaction.update(buildListEmbed(parts[2], parseInt(parts[3], 10))).catch(() => {});
        }

        // --- ⚔️ 戰鬥系統結算處理 ---
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
                player.lunacy += parseInt(rewardStr, 10);
                scheduleSave();
            }

            return interaction.update({ embeds: [embed], components: [] }).catch(() => {});
        }

        // --- 🔄 交易系統 ---
        if (customId.startsWith('trade_')) {
            const parts = customId.split('_');
            const act = parts[1];
            const tId = parts[2];
            const trade = activeTrades.get(tId);

            if (!trade) {
                return interaction.reply({ content: '❌ 交易過期。', ephemeral: true }).catch(() => {});
            }

            if (Date.now() > trade.timer?.expiresAt) {
                clearTrade(tId);
                return interaction.reply({ content: '❌ 交易已過期。', ephemeral: true }).catch(() => {});
            }

            if (act === 'acc') {
                if (interaction.user.id !== trade.p2.id && interaction.user.id !== OWNER_ID) {
                    return interaction.reply({ content: '❌ 僅限被邀請者。', ephemeral: true }).catch(() => {});
                }

                const embed = new EmbedBuilder()
                    .setTitle('🔄 交易終端')
                    .setColor(0x2A9D8F)
                    .addFields(
                        { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '未選擇'}`, inline: true },
                        { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '未選擇'}`, inline: true }
                    );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p1`).setLabel(`${trade.p1.name} 選物`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p2`).setLabel(`${trade.p2.name} 選物`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_ok_${tId}`).setLabel('✅ 確認交易').setStyle(ButtonStyle.Success)
                );

                return interaction.update({ content: null, embeds: [embed], components: [row] }).catch(() => {});
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
                if (allItems.length === 0) {
                    return interaction.reply({ content: '❌ 背包空。', ephemeral: true }).catch(() => {});
                }

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

                if (!isP1 && !isP2 && interaction.user.id !== OWNER_ID) {
                    return interaction.reply({ content: '❌ 無權限。', ephemeral: true }).catch(() => {});
                }

                if (!trade.p1.offer || !trade.p2.offer) {
                    return interaction.reply({ content: '❌ 雙方皆須放物品。', ephemeral: true }).catch(() => {});
                }

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

                    if (!p1OK || !p2OK) {
                        return interaction.reply({ content: '❌ 其中一方的物品已不存在，交易已取消。', ephemeral: true }).catch(() => {});
                    }

                    scheduleSave();
                    await refreshTradeMessage(trade);

                    const channel = await client.channels.fetch(trade.channelId).catch(() => null);
                    if (channel) {
                        const originalMsg = await channel.messages.fetch(trade.originalMsgId).catch(() => null);
                        if (originalMsg) {
                            await originalMsg.edit({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('✅ 交易成功')
                                        .setColor(0x2A9D8F)
                                        .setDescription(`**${trade.p1.name}** 得 ${trade.p2.offer}\n**${trade.p2.name}** 得 ${trade.p1.offer}`)
                                ],
                                components: []
                            }).catch(() => {});
                        }
                    }

                    clearTrade(tId);
                    return interaction.update({ content: '✅ 交易完成。', embeds: [], components: [] }).catch(() => {});
                }

                return interaction.reply({ content: '✅ 您已確認。等待對方...', ephemeral: true }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('⚠️ 互動異常：', e);
        try {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: '❌ 互動處理失敗。', ephemeral: true }).catch(() => {});
            }
        } catch (_) {}
    }
});

// ==================== 🚀 啟動 ====================
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ 缺少 DISCORD_TOKEN。');
    process.exit(1);
}

client.login(TOKEN).catch(err => console.error('❌ 登入失敗：', err));
