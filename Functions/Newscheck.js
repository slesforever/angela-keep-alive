// Functions/Newscheck.js
// Twitter Nitter RSS + Steam 官方新聞 API
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
const CHECK_INTERVAL = 60 * 1000;

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

const userStates = new Map(); // userId -> { lastFetchedId, recentIds: Map<id, ts> }
const steamState = {
    lastSteamNewsId: null,
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

        const data = {
            users,
            steam: {
                lastSteamNewsId: steamState.lastSteamNewsId,
                recentIds: [...steamState.recentIds.keys()].slice(-20)
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

// ── 解析 RSS 最新項目 ────────────────────────────────────────
function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;

    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];

    if (!link && !guid) return null;

    return {
        link: (link || guid || '').trim().replace('http://', 'https://'),
        id: (guid || link || '').trim()
    };
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

// ── 抓單一 Nitter 節點最新推文 ───────────────────────────────
async function fetchLatestTweetFromNode(nodeUrl, userId) {
    const url = `${nodeUrl}/${userId}/rss`;
    const response = await fetchWithTimeout(url, {}, 8000);

    if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    }

    const text = await response.text();
    const data = parseLatestItem(text);

    if (!data) {
        throw new Error('RSS 解析失敗');
    }

    const cleanLink = data.link.split('#')[0].split('?')[0];
    const tweetKey = extractTweetKey(cleanLink) || extractTweetKey(data.id);

    if (!tweetKey) {
        throw new Error('無法解析推文 ID');
    }

    return {
        id: tweetKey,
        link: cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com'),
        source: nodeUrl,
        userId
    };
}

// ── 同時抓所有節點，挑最新的一筆 ───────────────────────────
async function fetchLatestTweetFromAllNodes(userId) {
    const results = await Promise.allSettled(
        NITTER_NODES.map(async (nodeUrl) => fetchLatestTweetFromNode(nodeUrl, userId))
    );

    const success = results
        .filter(r => r.status === 'fulfilled' && r.value?.id && r.value?.link)
        .map(r => r.value);

    if (!success.length) {
        throw new Error('所有 Nitter 節點都失敗');
    }

    success.sort((a, b) => compareSnowflakeIds(a.id, b.id));
    return success[success.length - 1];
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

            let data;
            try {
                data = await fetchLatestTweetFromAllNodes(userId);
            } catch (err) {
                const msg = `@${userId}：${err.message}`;
                console.warn(`⚠️ [Twitter] ${msg}`);
                if (isManual) manualErrors.push(msg);
                continue;
            }

            if (!data?.id || !data?.link) {
                const msg = `@${userId}：推文資料不完整`;
                if (isManual) manualErrors.push(msg);
                continue;
            }

            const currentId = String(data.id);

            // 首次啟動：只建立快取，不發送
            if (!state.lastFetchedId && !isManual) {
                state.lastFetchedId = currentId;
                rememberRecent(state.recentIds, currentId);
                saveState();
                console.log(`📦 [Twitter][${userId}] 建立初始推文快取：${currentId} (${data.source})`);
                continue;
            }

            // 手動測試：永遠回最新，但不影響自動監測快取
            if (isManual) {
                manualLines.push(`**@${userId}**\n${data.link}`);
                continue;
            }

            // 重複貼文直接略過
            if (currentId === state.lastFetchedId || isRecent(state.recentIds, currentId)) {
                console.log(`ℹ️ [Twitter][${userId}] 重複貼文，略過：${currentId}`);
                continue;
            }

            // 避免舊貼文或異常回退造成重複 ping
            if (state.lastFetchedId && compareSnowflakeIds(currentId, state.lastFetchedId) <= 0) {
                console.log(`ℹ️ [Twitter][${userId}] 非更新內容，略過：${currentId}`);
                rememberRecent(state.recentIds, currentId);
                saveState();
                continue;
            }

            state.lastFetchedId = currentId;
            rememberRecent(state.recentIds, currentId);
            saveState();

            try {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE} **偵測到 @${userId} 發布了新訊息：**\n${data.link}`,
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
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&count=1`
        );

        if (!response.ok) {
            if (isManual && messageContext) {
                await messageContext.reply(`❌ Steam API 回應異常，狀態碼: ${response.status}`);
            }
            return;
        }

        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];

        if (!newsItem) {
            if (isManual && messageContext) {
                await messageContext.reply('❌ 未能獲取到 Steam 任何有效公告。');
            }
            return;
        }

        const currentId = String(newsItem.gid);

        // 首次啟動只建立快取
        if (!steamState.lastSteamNewsId && !isManual) {
            steamState.lastSteamNewsId = currentId;
            rememberRecent(steamState.recentIds, currentId);
            saveState();
            console.log(`📦 [Steam News] 成功建立初始公告快取識別碼：${newsItem.gid}`);
            return;
        }

        const cleanContent = (newsItem.contents || '')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 450);

        // 手動測試：永遠回最新，但不影響自動監測快取
        if (isManual) {
            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Steam 官方新聞 (手動測試)`)
                .setURL(newsItem.url)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}${cleanContent.length >= 450 ? '...' : ''}`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${newsItem.gid}` })
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

        // 重複公告直接略過
        if (currentId === steamState.lastSteamNewsId || isRecent(steamState.recentIds, currentId)) {
            console.log(`ℹ️ [Steam] 重複公告，略過：${currentId}`);
            return;
        }

        if (steamState.lastSteamNewsId && compareSnowflakeIds(currentId, steamState.lastSteamNewsId) <= 0) {
            console.log(`ℹ️ [Steam] 非更新內容，略過：${currentId}`);
            rememberRecent(steamState.recentIds, currentId);
            saveState();
            return;
        }

        steamState.lastSteamNewsId = currentId;
        rememberRecent(steamState.recentIds, currentId);
        saveState();

        const steamEmbed = new EmbedBuilder()
            .setTitle(`📢 Limbus Company Steam 官方發布重大變更`)
            .setURL(newsItem.url)
            .setDescription(`### **${newsItem.title}**\n\n${cleanContent}${cleanContent.length >= 450 ? '...' : ''}`)
            .setColor(0x1a3a6c)
            .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${newsItem.gid}` })
            .setTimestamp();

        try {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL);
            if (channel) {
                await channel.send({
                    content: `🔔 ${PING_ROLE} **監測到邊獄巴士有全新 Steam 公告發布！**`,
                    embeds: [steamEmbed],
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

    loopTimer = setInterval(() => {
        void checkTwitterUpdates(client, false, null);
        void checkSteamUpdates(client, false, null);
    }, CHECK_INTERVAL);

    console.log(`✅ [Newscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = {
    checkTwitterUpdates,
    checkSteamUpdates,
    startNewsCheckLoop
};
