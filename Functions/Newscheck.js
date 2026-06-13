// Functions/Newscheck.js
// Twitter Nitter RSS + Steam 官方新聞 API + YouTube 頻道監測
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const MONITORED_USERS = (process.env.TARGET_USERS || 'LimbusCompany_B,ProjMoonStudio')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const NOTIFY_CHANNEL = process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const PING_ROLE = process.env.PING_ROLE_MENTION || '<@&1406984068725211177>';
const STEAM_APP_ID = '1973530';
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_MS || 20 * 1000);
const STEAM_NEWS_COUNT = Number(process.env.STEAM_NEWS_COUNT || 5);

const YOUTUBE_HANDLE = (process.env.YOUTUBE_HANDLE || 'ProjectMoonOfficial').replace(/^@/, '');
const YOUTUBE_PAGE_URL = `https://www.youtube.com/@${YOUTUBE_HANDLE}`;

// Nitter 備援節點
const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz',
    'https://nitter.privacydev.net',
    'https://nitter.1d4.us',
    'https://nitter.fdn.fr',
];

const STATE_FILE = path.join(process.cwd(), 'data', 'newscheck-state.json');
const RECENT_TTL_MS = 30 * 60 * 1000;

let loopTimer = null;
let twitterLock = false;
let steamLock = false;
let youtubeLock = false;

const userStates = new Map(); // userId -> { lastFetchedId, recentIds: Map<id, ts> }
const steamState = {
    lastSteamNewsId: null,
    recentIds: new Map()
};
const youtubeState = {
    channelId: null,
    lastVideoId: null,
    lastPublishedAt: null,
    recentIds: new Map()
};

function ensureStateDir() {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            lastFetchedId: null,
            recentIds: new Map()
        });
    }
    return userStates.get(userId);
}

function cleanupRecent(map) {
    const now = Date.now();
    for (const [id, ts] of map.entries()) {
        if (now - ts > RECENT_TTL_MS) {
            map.delete(id);
        }
    }
}

function rememberRecent(map, id) {
    cleanupRecent(map);
    map.set(String(id), Date.now());
}

function isRecent(map, id) {
    cleanupRecent(map);
    return map.has(String(id));
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBlock(xml, tagName) {
    const regex = new RegExp(`<${escapeRegExp(tagName)}\\b[\\s\\S]*?</${escapeRegExp(tagName)}>`, 'g');
    return [...xml.matchAll(regex)].map(m => m[0]);
}

function extractTag(block, tagName) {
    const regex = new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegExp(tagName)}>`, 'i');
    return block.match(regex)?.[1]?.trim() ?? null;
}

function extractAttr(block, tagName, attrName) {
    const regex = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*${escapeRegExp(attrName)}=["']([^"']+)["'][^>]*>`, 'i');
    return block.match(regex)?.[1]?.trim() ?? null;
}

function decodeXmlEntities(text) {
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;

        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const data = JSON.parse(raw);

        if (data?.users && typeof data.users === 'object') {
            for (const [userId, info] of Object.entries(data.users)) {
                const state = getUserState(userId);
                state.lastFetchedId = info?.lastFetchedId ? String(info.lastFetchedId) : null;
                state.recentIds.clear();

                if (Array.isArray(info?.recentIds)) {
                    for (const id of info.recentIds) {
                        state.recentIds.set(String(id), Date.now());
                    }
                }
            }
        }

        if (data?.steam) {
            steamState.lastSteamNewsId = data.steam.lastSteamNewsId ? String(data.steam.lastSteamNewsId) : null;
            steamState.recentIds.clear();

            if (Array.isArray(data.steam.recentIds)) {
                for (const id of data.steam.recentIds) {
                    steamState.recentIds.set(String(id), Date.now());
                }
            }
        }

        if (data?.youtube) {
            youtubeState.channelId = data.youtube.channelId ? String(data.youtube.channelId) : null;
            youtubeState.lastVideoId = data.youtube.lastVideoId ? String(data.youtube.lastVideoId) : null;
            youtubeState.lastPublishedAt = data.youtube.lastPublishedAt ? String(data.youtube.lastPublishedAt) : null;
            youtubeState.recentIds.clear();

            if (Array.isArray(data.youtube.recentIds)) {
                for (const id of data.youtube.recentIds) {
                    youtubeState.recentIds.set(String(id), Date.now());
                }
            }
        }
    } catch (err) {
        console.warn(`[Newscheck] 載入狀態失敗：${err.message}`);
    }
}

function saveState() {
    try {
        ensureStateDir();

        const users = {};
        for (const [userId, state] of userStates.entries()) {
            cleanupRecent(state.recentIds);
            users[userId] = {
                lastFetchedId: state.lastFetchedId,
                recentIds: [...state.recentIds.keys()].slice(-20)
            };
        }

        cleanupRecent(steamState.recentIds);
        cleanupRecent(youtubeState.recentIds);

        const data = {
            users,
            steam: {
                lastSteamNewsId: steamState.lastSteamNewsId,
                recentIds: [...steamState.recentIds.keys()].slice(-20)
            },
            youtube: {
                channelId: youtubeState.channelId,
                lastVideoId: youtubeState.lastVideoId,
                lastPublishedAt: youtubeState.lastPublishedAt,
                recentIds: [...youtubeState.recentIds.keys()].slice(-20)
            },
            savedAt: new Date().toISOString()
        };

        fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.warn(`[Newscheck] 儲存狀態失敗：${err.message}`);
    }
}

// ── fetchWithTimeout ─────────────────────────────────────────
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ...(options.headers || {})
        }
    }).finally(() => clearTimeout(timeout));
}

// ── 比較兩個 snowflake id ───────────────────────────────────
function compareSnowflakeIds(a, b) {
    if (a === b) return 0;

    const aNum = /^\d+$/.test(String(a));
    const bNum = /^\d+$/.test(String(b));

    if (aNum && bNum) {
        const aa = BigInt(a);
        const bb = BigInt(b);
        return aa > bb ? 1 : -1;
    }

    return String(a).localeCompare(String(b));
}

// ── 解析 RSS / Atom 項目 ────────────────────────────────────
function parseTwitterItems(xml) {
    const blocks = extractBlock(xml, 'item');
    const items = [];

    for (const block of blocks) {
        const link = extractTag(block, 'link');
        const guid = extractTag(block, 'guid');
        const title = extractTag(block, 'title');

        const rawLink = (link || guid || title || '').trim();
        const cleanLink = rawLink.replace(/^http:\/\//i, 'https://').split('#')[0].split('?')[0];
        const tweetKey = extractTweetKey(cleanLink) || extractTweetKey(guid) || extractTweetKey(title);

        if (!tweetKey) continue;

        items.push({
            id: String(tweetKey),
            link: cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com'),
            title: title ? decodeXmlEntities(title) : null,
        });
    }

    return items;
}

function parseYouTubeItems(xml) {
    const blocks = extractBlock(xml, 'entry');
    const items = [];

    for (const block of blocks) {
        const videoId = extractTag(block, 'yt:videoId') || extractTag(block, 'videoId');
        const title = extractTag(block, 'title');
        const published = extractTag(block, 'published');
        const link = extractAttr(block, 'link', 'href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

        if (!videoId || !link) continue;

        items.push({
            id: String(videoId),
            link,
            title: title ? decodeXmlEntities(title) : null,
            published: published ? new Date(published).toISOString() : null,
        });
    }

    return items;
}

// ── 從推文網址抽真正 ID ─────────────────────────────────────
function extractTweetKey(urlOrId) {
    if (!urlOrId) return null;

    const text = String(urlOrId).trim();

    const statusMatch = text.match(/status\/(\d+)/i);
    if (statusMatch) return statusMatch[1];

    const numericMatch = text.match(/\b(\d{10,})\b/);
    if (numericMatch) return numericMatch[1];

    return text.replace(/^https:\/\/[^/]+/, '').split('?')[0].split('#')[0];
}

// ── 抓單一 Nitter 節點所有推文 ──────────────────────────────
async function fetchTweetItemsFromNode(nodeUrl, userId) {
    const url = `${nodeUrl}/${userId}/rss`;
    const response = await fetchWithTimeout(url, {}, 8000);

    if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    }

    const text = await response.text();
    const items = parseTwitterItems(text);

    if (!items.length) {
        throw new Error('RSS 解析失敗');
    }

    return items;
}

// ── 同時抓所有節點，合併最新的一批項目 ───────────────────────
async function fetchTweetItemsFromAllNodes(userId) {
    const results = await Promise.allSettled(
        NITTER_NODES.map(async (nodeUrl) => ({
            nodeUrl,
            items: await fetchTweetItemsFromNode(nodeUrl, userId)
        }))
    );

    const merged = [];
    const seen = new Set();

    for (const result of results) {
        if (result.status !== 'fulfilled') continue;

        for (const item of result.value.items || []) {
            if (!item?.id || !item?.link) continue;
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
        }
    }

    if (!merged.length) {
        throw new Error('所有 Nitter 節點都失敗');
    }

    merged.sort((a, b) => compareSnowflakeIds(b.id, a.id)); // newest first
    return merged;
}

// ── 解析 YouTube 頻道 ID ───────────────────────────────────
async function resolveYouTubeChannelId() {
    const candidates = [
        `${YOUTUBE_PAGE_URL}/videos`,
        YOUTUBE_PAGE_URL,
    ];

    const patterns = [
        /"channelId":"(UC[^"]+)"/,
        /"channelId\\":\\"(UC[^\\"]+)\\"/,
        /"externalId":"(UC[^"]+)"/,
        /"browseId":"(UC[^"]+)"/,
        /channelId=?(UC[\w-]+)/,
    ];

    for (const url of candidates) {
        try {
            const response = await fetchWithTimeout(url, {}, 12000);
            if (!response.ok) continue;

            const html = await response.text();
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match?.[1]) return match[1];
            }
        } catch (_) {
            // continue
        }
    }

    throw new Error('無法解析 YouTube Channel ID');
}

async function fetchYouTubeItems(channelId) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await fetchWithTimeout(url, {}, 12000);

    if (!response.ok) {
        throw new Error(`YouTube RSS HTTP 錯誤! 狀態碼: ${response.status}`);
    }

    const xml = await response.text();
    const items = parseYouTubeItems(xml);

    if (!items.length) {
        throw new Error('YouTube RSS 解析失敗');
    }

    return items;
}

// ── Twitter 監測 ─────────────────────────────────────────────
// targetUserId 可選：
// - 不傳 => 監測所有 MONITORED_USERS
// - 傳入 => 只測該 user
async function checkTwitterUpdates(client, isManual = false, messageContext = null, targetUserId = null) {
    if (twitterLock) {
        if (!isManual) console.log('⏳ [Twitter] 上一輪尚未完成，略過本輪');
        return;
    }

    twitterLock = true;

    try {
        const usersToCheck = targetUserId ? [targetUserId] : MONITORED_USERS;

        if (!isManual) {
            console.log(`⏳ Angela 正在檢查官方帳號：${usersToCheck.map(u => '@' + u).join(', ')} ...`);
        }

        const manualLines = [];
        const manualErrors = [];

        for (const userId of usersToCheck) {
            const state = getUserState(userId);

            let feedItems;
            try {
                feedItems = await fetchTweetItemsFromAllNodes(userId);
            } catch (err) {
                const msg = `@${userId}：${err.message}`;
                console.warn(`⚠️ [Twitter] ${msg}`);
                if (isManual) manualErrors.push(msg);
                continue;
            }

            if (!feedItems?.length) {
                const msg = `@${userId}：推文資料不完整`;
                if (isManual) manualErrors.push(msg);
                continue;
            }

            // 首次啟動：只建立快取，不發送
            if (!state.lastFetchedId && !isManual) {
                state.lastFetchedId = feedItems[0].id;
                rememberRecent(state.recentIds, feedItems[0].id);
                saveState();
                console.log(`📦 [Twitter][${userId}] 建立初始推文快取：${feedItems[0].id}`);
                continue;
            }

            // 手動測試：只回最新幾則，不影響自動監測快取
            if (isManual) {
                const preview = feedItems.slice(0, 3).map((item, idx) => {
                    const titlePart = item.title ? `**${item.title}**\n` : '';
                    return `${idx + 1}. ${titlePart}${item.link}`;
                });
                manualLines.push(`**@${userId}**\n${preview.join('\n\n')}`);
                continue;
            }

            let newItems = [];
            const seenIndex = feedItems.findIndex(item => item.id === state.lastFetchedId);

            if (seenIndex >= 0) {
                newItems = feedItems.slice(0, seenIndex);
            } else if (state.lastFetchedId) {
                newItems = feedItems.filter(item => compareSnowflakeIds(item.id, state.lastFetchedId) > 0);
            }

            newItems = [...new Map(newItems.map(item => [item.id, item])).values()];
            newItems.sort((a, b) => compareSnowflakeIds(a.id, b.id)); // oldest -> newest

            if (!newItems.length) {
                console.log(`ℹ️ [Twitter][${userId}] 沒有新推文`);
                continue;
            }

            state.lastFetchedId = feedItems[0].id;
            for (const item of newItems) rememberRecent(state.recentIds, item.id);
            saveState();

            const body = newItems.map((item, idx) => {
                const titleLine = item.title ? `**${item.title}**\n` : '';
                return `${idx + 1}. ${titleLine}${item.link}`;
            }).join('\n\n');

            try {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE} **偵測到 @${userId} 發布了 ${newItems.length} 則新訊息：**\n${body}`,
                        allowedMentions: { parse: ['roles'] }
                    });
                }
            } catch (e) {
                console.error(`[Twitter][${userId}] 發送訊息失敗：${e.message}`);
            }
        }

        if (isManual && messageContext) {
            if (manualLines.length) {
                await messageContext.reply({
                    content: `🔔 ${PING_ROLE} **[推特手動測試成功]**\n${manualLines.join('\n\n')}`,
                    allowedMentions: { parse: ['roles'] }
                });
            } else {
                const extra = manualErrors.length ? `\n\n失敗項目：\n${manualErrors.join('\n')}` : '';
                await messageContext.reply(`❌ **手動測試未取得有效推文。**${extra}`);
            }
        }
    } catch (error) {
        console.warn(`⚠️ Twitter 擷取異常 (${error.message})`);
        if (isManual && messageContext) {
            await messageContext.reply(`❌ 系統執行 Twitter 協定中斷：${error.message}`);
        }
    } finally {
        twitterLock = false;
    }
}

// ── Steam 官方新聞 API ─────────────────────────────────────
async function checkSteamUpdates(client, isManual = false, messageContext = null) {
    if (steamLock) {
        if (!isManual) console.log('⏳ [Steam] 上一輪尚未完成，略過本輪');
        return;
    }

    steamLock = true;

    try {
        const response = await fetchWithTimeout(
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&count=${STEAM_NEWS_COUNT}`
        );

        if (!response.ok) {
            if (isManual && messageContext) {
                await messageContext.reply(`❌ Steam API 回應異常，狀態碼: ${response.status}`);
            }
            return;
        }

        const data = await response.json();
        const newsItems = Array.isArray(data?.appnews?.newsitems) ? data.appnews.newsitems : [];

        if (!newsItems.length) {
            if (isManual && messageContext) {
                await messageContext.reply('❌ 未能獲取到 Steam 任何有效公告。');
            }
            return;
        }

        // 依照 API 回傳順序，通常是最新在前
        const newestItem = newsItems[0];
        const currentId = String(newestItem.gid);

        // 首次啟動只建立快取
        if (!steamState.lastSteamNewsId && !isManual) {
            steamState.lastSteamNewsId = currentId;
            rememberRecent(steamState.recentIds, currentId);
            saveState();
            console.log(`📦 [Steam News] 成功建立初始公告快取識別碼：${newestItem.gid}`);
            return;
        }

        const unseen = [];
        const seenIndex = newsItems.findIndex(item => String(item.gid) === steamState.lastSteamNewsId);

        if (seenIndex >= 0) {
            unseen.push(...newsItems.slice(0, seenIndex));
        } else if (steamState.lastSteamNewsId) {
            for (const item of newsItems) {
                if (compareSnowflakeIds(String(item.gid), steamState.lastSteamNewsId) > 0) {
                    unseen.push(item);
                }
            }
        }

        const uniqueUnseen = [...new Map(unseen.map(item => [String(item.gid), item])).values()];
        uniqueUnseen.sort((a, b) => compareSnowflakeIds(String(a.gid), String(b.gid))); // oldest -> newest

        // 手動測試：永遠回最新，但不影響自動監測快取
        if (isManual) {
            const preview = newsItems.slice(0, 3).map(item => {
                const cleanContent = stripHtml(item.contents || '').substring(0, 220);
                return `**${item.title}**\n${cleanContent}${cleanContent.length >= 220 ? '...' : ''}\n${item.url}`;
            }).join('\n\n');

            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Steam 官方新聞 (手動測試)`)
                .setURL(newestItem.url)
                .setDescription(preview || `### **${newestItem.title}**`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 最新識別碼: ${newestItem.gid}` })
                .setTimestamp();

            if (messageContext) {
                await messageContext.reply({
                    content: `🔔 ${PING_ROLE} **Steam 手動測試成功**`,
                    embeds: [steamEmbed],
                    allowedMentions: { parse: ['roles'] }
                });
            }
            return;
        }

        if (!uniqueUnseen.length) {
            console.log(`ℹ️ [Steam] 沒有新公告`);
            return;
        }

        steamState.lastSteamNewsId = currentId;
        for (const item of uniqueUnseen) rememberRecent(steamState.recentIds, String(item.gid));
        saveState();

        const embeds = uniqueUnseen.slice(0, 10).map((item) => {
            const cleanContent = stripHtml(item.contents || '').substring(0, 450);
            return new EmbedBuilder()
                .setTitle(`📢 ${item.title}`)
                .setURL(item.url)
                .setDescription(cleanContent ? `${cleanContent}${cleanContent.length >= 450 ? '...' : ''}` : '（沒有內容）')
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${item.gid}` })
                .setTimestamp();
        });

        try {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL);
            if (channel) {
                await channel.send({
                    content: `🔔 ${PING_ROLE} **監測到邊獄巴士有 ${uniqueUnseen.length} 則全新 Steam 公告發布！**`,
                    embeds,
                    allowedMentions: { parse: ['roles'] }
                });
            }
        } catch (e) {
            console.error(`[Steam] 發送訊息失敗：${e.message}`);
        }
    } catch (err) {
        console.warn(`⚠️ Steam 公告同步故障 (${err.message})`);
        if (isManual && messageContext) {
            await messageContext.reply(`❌ Steam 同步失敗：${err.message}`);
        }
    } finally {
        steamLock = false;
    }
}

// ── YouTube 頻道監測 ────────────────────────────────────────
async function checkYouTubeUpdates(client, isManual = false, messageContext = null) {
    if (youtubeLock) {
        if (!isManual) console.log('⏳ [YouTube] 上一輪尚未完成，略過本輪');
        return;
    }

    youtubeLock = true;

    try {
        if (!youtubeState.channelId) {
            youtubeState.channelId = await resolveYouTubeChannelId();
            saveState();
            console.log(`📡 [YouTube] 已解析頻道 ID：${youtubeState.channelId}`);
        }

        const feedItems = await fetchYouTubeItems(youtubeState.channelId);
        if (!feedItems.length) {
            if (isManual && messageContext) {
                await messageContext.reply('❌ 未能獲取到 YouTube 頻道影片。');
            }
            return;
        }

        // 首次啟動：只建立快取，不發送
        if (!youtubeState.lastVideoId && !isManual) {
            youtubeState.lastVideoId = feedItems[0].id;
            youtubeState.lastPublishedAt = feedItems[0].published || new Date().toISOString();
            rememberRecent(youtubeState.recentIds, feedItems[0].id);
            saveState();
            console.log(`📦 [YouTube] 成功建立初始影片快取：${feedItems[0].id}`);
            return;
        }

        // 手動測試：顯示最新 3 部
        if (isManual) {
            const preview = feedItems.slice(0, 3).map((item, idx) => {
                const titleLine = item.title ? `**${item.title}**\n` : '';
                return `${idx + 1}. ${titleLine}${item.link}`;
            }).join('\n\n');

            if (messageContext) {
                await messageContext.reply({
                    content: `📺 **YouTube 頻道測試：@${YOUTUBE_HANDLE}**\n${preview}`,
                    allowedMentions: { parse: [] }
                });
            }
            return;
        }

        let newItems = [];
        const seenIndex = feedItems.findIndex(item => item.id === youtubeState.lastVideoId);

        if (seenIndex >= 0) {
            newItems = feedItems.slice(0, seenIndex);
        } else if (youtubeState.lastPublishedAt) {
            const lastTime = Date.parse(youtubeState.lastPublishedAt) || 0;
            newItems = feedItems.filter(item => {
                const t = item.published ? Date.parse(item.published) : 0;
                return t > lastTime;
            });
        }

        newItems = [...new Map(newItems.map(item => [item.id, item])).values()];
        newItems.reverse(); // oldest -> newest

        if (!newItems.length) {
            console.log('ℹ️ [YouTube] 沒有新影片');
            return;
        }

        youtubeState.lastVideoId = feedItems[0].id;
        youtubeState.lastPublishedAt = feedItems[0].published || new Date().toISOString();
        for (const item of newItems) rememberRecent(youtubeState.recentIds, item.id);
        saveState();

        const body = newItems.map((item, idx) => {
            const titleLine = item.title ? `**${item.title}**\n` : '';
            return `${idx + 1}. ${titleLine}${item.link}`;
        }).join('\n\n');

        try {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL);
            if (channel) {
                await channel.send({
                    content: `🔔 ${PING_ROLE} **@${YOUTUBE_HANDLE} 發布了 ${newItems.length} 部新影片：**\n${body}`,
                    allowedMentions: { parse: ['roles'] }
                });
            }
        } catch (e) {
            console.error(`[YouTube] 發送訊息失敗：${e.message}`);
        }
    } catch (err) {
        console.warn(`⚠️ YouTube 同步故障 (${err.message})`);
        if (isManual && messageContext) {
            await messageContext.reply(`❌ YouTube 同步失敗：${err.message}`);
        }
    } finally {
        youtubeLock = false;
    }
}

// ── 啟動定時循環 ─────────────────────────────────────────────
function startNewsCheckLoop(client) {
    if (globalThis.__NEWSCHECK_LOOP_STARTED__) {
        console.log('ℹ️ [Newscheck] 已啟動過，略過重複初始化');
        return;
    }
    globalThis.__NEWSCHECK_LOOP_STARTED__ = true;

    loadState();

    // 立即執行一次，只建立快取，不會重複發
    void checkTwitterUpdates(client, false, null);
    void checkSteamUpdates(client, false, null);
    void checkYouTubeUpdates(client, false, null);

    loopTimer = setInterval(() => {
        void checkTwitterUpdates(client, false, null);
        void checkSteamUpdates(client, false, null);
        void checkYouTubeUpdates(client, false, null);
    }, CHECK_INTERVAL);

    console.log(`✅ [Newscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = {
    checkTwitterUpdates,
    checkSteamUpdates,
    checkYouTubeUpdates,
    startNewsCheckLoop
};
