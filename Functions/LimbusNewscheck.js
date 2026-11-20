// Functions/LimbusNewscheck.js
// Twitter Nitter RSS + Steam 官方新聞 API + YouTube 頻道網址動態監測
//
// 本版為優化版，與原版行為一致，差別在：
//   1. 狀態檔改存 PLAYER_DATA_DIR，重啟不再遺失去重進度
//   2. 狀態改為 debounce + 原子寫入（.tmp → rename），不再卡 event loop
//   3. Nitter 節點加入失敗退避，避免失敗時每輪硬打
//   4. Twitter / Steam / YouTube 各自獨立輪詢節奏
//   5. 影片改挑接近 2Mbps 的畫質，不再先抓最大檔
//   6. 手動測試不再下載影片，避免 interaction 逾時
//   7. 通知頻道只 fetch 一次，不再每個帳號抓一次
//   8. Steam 抓 10 則（靠 recentIds 去重），降低漏新聞機率
//   9. 移除已停用的 X 直抓解析程式碼
//  10. lastFetchedId 一律取最大 snowflake，避免排序不一致造成漏抓
//  11. 縮短延遲：Steam/YouTube 60s、Twitter 180s，快取與節點冷卻同步調短
//
// 可直接覆蓋 Functions/LimbusNewscheck.js

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const MONITORED_USERS = (process.env.TARGET_USERS || 'LimbusCompany_B,ProjMoonStudio')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

let notifyChannelId = process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const PING_ROLE = process.env.PING_ROLE_MENTION || '<@&1406984068725211177>';
const STEAM_APP_ID = '1973530';

// 各來源獨立節奏
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_MS || 60 * 1000);
const TWITTER_CHECK_INTERVAL = Number(process.env.TWITTER_CHECK_INTERVAL_MS || 3 * 60 * 1000);
// 必須小於輪詢間隔，否則每兩輪會被跳過一次，實際延遲直接翻倍
const TWITTER_MIN_FETCH_GAP_MS = Number(process.env.TWITTER_MIN_FETCH_GAP_MS || 2 * 60 * 1000);
const TWITTER_CACHE_TTL_MS = Number(process.env.TWITTER_CACHE_TTL_MS || 4 * 60 * 1000);

const STEAM_NEWS_COUNT_AUTO = Number(process.env.STEAM_NEWS_COUNT_AUTO || 10);
const STEAM_NEWS_COUNT_MANUAL = Number(process.env.STEAM_NEWS_COUNT_MANUAL || 5);
const STEAM_FETCH_TIMEOUT_MS = Number(process.env.STEAM_FETCH_TIMEOUT_MS || 5000);

// 影片目標碼率：挑最接近這個值的變體，避免先抓最大檔而超限失敗
const TARGET_VIDEO_BITRATE = Number(process.env.TARGET_VIDEO_BITRATE || 2000000);
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

const STEAM_CLAN_IMAGE_BASE = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/clans/';

const YOUTUBE_HANDLE = (process.env.YOUTUBE_HANDLE || 'ProjectMoonOfficial').replace(/^@/, '');
const YOUTUBE_PAGE_URL = process.env.YOUTUBE_PAGE_URL || `https://www.youtube.com/@${YOUTUBE_HANDLE}`;

const TIMELINE_ENDPOINTS = (process.env.X_TIMELINE_ENDPOINTS ||
    'https://nitter.meowing.monster/{user}/rss,https://shitter.thepixora.com/{user}/rss,https://nitter.netbub.com/{user}/rss,https://xcancel.com/{user}/rss,https://nitter.poast.org/{user}/rss')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

// 狀態檔跟著其他玩家資料一起走，Render 重啟不會清空
const DATA_DIR = process.env.PLAYER_DATA_DIR || path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'newscheck-state.json');
const RECENT_TTL_MS = 30 * 60 * 1000;

const TWITTER_NODE_MIN_COOLDOWN_MS = Number(process.env.TWITTER_NODE_MIN_COOLDOWN_MS || 30 * 1000);
const TWITTER_NODE_MAX_COOLDOWN_MS = Number(process.env.TWITTER_NODE_MAX_COOLDOWN_MS || 5 * 60 * 1000);

let loopTimer = null;
let twitterTimer = null;
let twitterLock = false;
let steamLock = false;
let youtubeLock = false;

const userStates = new Map(); // userId -> { lastFetchedId, recentIds, lastRequestAt }
const feedCache = new Map(); // userId -> { fetchedAt, items }

// Nitter 節點退避
const nodeFailures = new Map();
const nodeCooldownUntil = new Map();

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
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, {
            lastFetchedId: null,
            recentIds: new Map(),
            lastRequestAt: 0
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

function truncateText(str, maxLen = 100) {
    if (!str) return '';
    const clean = String(str).trim();
    return clean.length > maxLen ? clean.slice(0, maxLen) + '...' : clean;
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

function normalizeSteamContents(raw = '') {
    return String(raw).replace(/\{STEAM_CLAN_IMAGE\}/g, STEAM_CLAN_IMAGE_BASE);
}

function extractSteamImages(raw = '') {
    const text = normalizeSteamContents(raw);
    const images = [];

    for (const m of text.matchAll(/\[img\]([\s\S]*?)\[\/img\]/gi)) {
        const url = m[1].trim();
        if (/^https?:\/\//i.test(url)) images.push(url);
    }

    return [...new Set(images)];
}

function stripSteamContent(raw = '') {
    return normalizeSteamContents(raw)
        .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function guessFileExtension(contentType = '', url = '') {
    const ct = String(contentType).toLowerCase();
    if (ct.includes('image/png')) return 'png';
    if (ct.includes('image/jpeg')) return 'jpg';
    if (ct.includes('image/jpg')) return 'jpg';
    if (ct.includes('image/gif')) return 'gif';
    if (ct.includes('image/webp')) return 'webp';

    const cleanUrl = String(url).split('?')[0].toLowerCase();
    const match = cleanUrl.match(/\.([a-z0-9]{3,4})$/);
    if (match?.[1]) return match[1];

    return 'png';
}

async function downloadSteamImage(url, itemGid, index) {
    try {
        const response = await fetchWithTimeout(url, {}, STEAM_FETCH_TIMEOUT_MS);
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type') || '';
        const ext = guessFileExtension(contentType, url);
        const filename = `steam-${itemGid}-${index + 1}.${ext}`;
        const buffer = Buffer.from(await response.arrayBuffer());

        return new AttachmentBuilder(buffer, { name: filename });
    } catch (_) {
        return null;
    }
}

async function buildSteamAnnouncementPayload(item) {
    const imageUrls = extractSteamImages(item.contents || '');
    const cleanContent = stripSteamContent(item.contents || '');

    const summary = cleanContent.length > 900
        ? `${cleanContent.slice(0, 900)}...`
        : (cleanContent || '（沒有內容）');

    const attachments = [];
    const downloaded = await Promise.all(
        imageUrls.slice(0, 10).map((url, idx) => downloadSteamImage(url, item.gid, idx))
    );

    for (const file of downloaded) {
        if (file) attachments.push(file);
    }

    const embeds = [];

    const firstEmbed = new EmbedBuilder()
        .setTitle(`📢 ${item.title}`)
        .setURL(item.url)
        .setDescription(summary)
        .setColor(0x1a3a6c)
        .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${item.gid}` })
        .setTimestamp();

    if (attachments[0]) {
        firstEmbed.setImage(`attachment://${attachments[0].name}`);
    }

    embeds.push(firstEmbed);

    for (let i = 1; i < attachments.length && embeds.length < 10; i++) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1a3a6c)
                .setImage(`attachment://${attachments[i].name}`)
                .setFooter({ text: `圖片 ${i + 1}/${attachments.length}` })
        );
    }

    return { embeds, files: attachments };
}

// ── 狀態持久化 ───────────────────────────────────────────────

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
        console.warn(`[LimbusNewscheck] 載入狀態失敗：${err.message}`);
    }
}

function serializeState() {
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

    return {
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
}

// debounce：一輪內多次呼叫只寫一次，且不阻塞 event loop
let saveTimer = null;
let savePending = false;

function saveState() {
    savePending = true;
    if (saveTimer) return;

    saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushState();
    }, 1500);

    if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

async function flushState() {
    if (!savePending) return;
    savePending = false;

    const tmpFile = `${STATE_FILE}.tmp`;
    try {
        ensureStateDir();
        await fs.promises.writeFile(tmpFile, JSON.stringify(serializeState(), null, 2), 'utf8');
        await fs.promises.rename(tmpFile, STATE_FILE);
    } catch (err) {
        console.warn(`[LimbusNewscheck] 儲存狀態失敗：${err.message}`);
    }
}

// ── 共用工具 ─────────────────────────────────────────────────

function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...(options.headers || {})
        }
    }).finally(() => clearTimeout(timeout));
}

function withTimeout(promise, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

function compareTweetFreshness(a, b) {
    const aTime = Date.parse(a?.createdAt || '');
    const bTime = Date.parse(b?.createdAt || '');

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return bTime - aTime;
    }

    return compareSnowflakeIds(b?.id || '', a?.id || '');
}

// 一律取最大 snowflake，不依賴排序結果
function pickNewestId(items) {
    if (!items?.length) return null;
    return items
        .map(item => String(item.id))
        .reduce((a, b) => (compareSnowflakeIds(a, b) >= 0 ? a : b));
}

// ── Nitter 節點退避 ──────────────────────────────────────────

function isNodeReady(nodeTemplate) {
    return (nodeCooldownUntil.get(nodeTemplate) || 0) <= Date.now();
}

function markNodeOk(nodeTemplate) {
    nodeFailures.delete(nodeTemplate);
    nodeCooldownUntil.delete(nodeTemplate);
}

function markNodeFailed(nodeTemplate) {
    const failures = (nodeFailures.get(nodeTemplate) || 0) + 1;
    nodeFailures.set(nodeTemplate, failures);

    const backoff = Math.min(
        TWITTER_NODE_MAX_COOLDOWN_MS,
        TWITTER_NODE_MIN_COOLDOWN_MS * 2 ** (failures - 1)
    );

    nodeCooldownUntil.set(nodeTemplate, Date.now() + backoff);
    console.warn(`⚠️ [Twitter] ${nodeTemplate} 失敗 ${failures} 次，冷卻 ${Math.round(backoff / 1000)}s`);
}

// ── 解析 ─────────────────────────────────────────────────────

function parseTwitterItems(xml) {
    const blocks = extractBlock(xml, 'item');
    const items = [];

    for (const block of blocks) {
        const link = extractTag(block, 'link');
        const guid = extractTag(block, 'guid');
        const title = extractTag(block, 'title');
        const pubDate = extractTag(block, 'pubDate');

        const rawLink = (link || guid || title || '').trim();
        const cleanLink = rawLink.replace(/^http:\/\//i, 'https://').split('#')[0].split('?')[0];
        const tweetKey = extractTweetKey(cleanLink) || extractTweetKey(guid) || extractTweetKey(title);

        if (!tweetKey) continue;

        const xLink = cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');

        items.push({
            id: String(tweetKey),
            link: xLink,
            title: title ? decodeXmlEntities(title) : null,
            createdAt: pubDate || null,
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

function extractTweetKey(urlOrId) {
    if (!urlOrId) return null;

    const text = String(urlOrId).trim();

    const statusMatch = text.match(/status\/(\d+)/i);
    if (statusMatch) return statusMatch[1];

    const numericMatch = text.match(/\b(\d{10,})\b/);
    if (numericMatch) return numericMatch[1];

    return text.replace(/^https:\/\/[^/]+/, '').split('?')[0].split('#')[0];
}

// ── 影片下載 ─────────────────────────────────────────────────

async function downloadTweetVideo(item) {
    const variants = Array.isArray(item?.videoVariants) && item.videoVariants.length
        ? item.videoVariants
        : (item?.videoUrl ? [{ url: item.videoUrl, bitrate: 0 }] : []);
    if (!variants.length) return null;

    // 由接近目標碼率排起，避免先抓最大檔而超限
    const ordered = [...new Map(variants.map(v => [v.url, v])).values()]
        .sort((a, b) => Math.abs((a.bitrate || 0) - TARGET_VIDEO_BITRATE) - Math.abs((b.bitrate || 0) - TARGET_VIDEO_BITRATE));

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'angela-x-video-'));
    try {
        for (const [index, variant] of ordered.entries()) {
            const outputPath = path.join(tempDir, `tweet-${item.id}-${index}.mp4`);
            try {
                await execFileAsync('curl', [
                    '--fail',
                    '--silent',
                    '--show-error',
                    '--location',
                    '--connect-timeout', '5',
                    '--max-time', '45',
                    '--max-filesize', String(MAX_VIDEO_BYTES),
                    '--user-agent', 'Mozilla/5.0',
                    '--output', outputPath,
                    variant.url,
                ], {
                    timeout: 50000,
                    killSignal: 'SIGKILL',
                });
                const stat = await fs.promises.stat(outputPath);
                if (!stat.size || stat.size > MAX_VIDEO_BYTES) continue;
                const buffer = await fs.promises.readFile(outputPath);
                return new AttachmentBuilder(buffer, { name: `x-${item.id}.mp4` });
            } catch (_) {
                // 這個畫質失敗就試下一個
            }
        }
        return null;
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

// ── Twitter 抓取 ─────────────────────────────────────────────

async function fetchTweetItemsFromNode(nodeTemplate, userId) {
    const url = nodeTemplate.replace('{user}', encodeURIComponent(userId));
    const errors = [];

    try {
        const result = await execFileAsync('curl', [
            '--silent',
            '--show-error',
            '--location',
            '--compressed',
            '--connect-timeout', '4',
            '--max-time', '7',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--header', 'Accept: application/rss+xml,application/xml,text/xml,*/*;q=0.8',
            url,
        ], {
            maxBuffer: 3 * 1024 * 1024,
        });
        const items = parseTwitterItems(result.stdout);
        if (items.length) return items;
        errors.push('curl 回應沒有可解析的推文');
    } catch (error) {
        const detail = error.stderr ? String(error.stderr).trim().slice(0, 180) : error.message;
        errors.push(`curl ${detail}`);
    }

    try {
        const response = await fetchWithTimeout(url, {
            headers: {
                Accept: 'application/rss+xml,application/xml,text/xml,*/*;q=0.8',
            },
        }, 4500);

        if (!response.ok) {
            errors.push(`node-fetch HTTP ${response.status}`);
        } else {
            const text = await response.text();
            const items = parseTwitterItems(text);
            if (items.length) return items;
            errors.push('node-fetch 回應沒有可解析的推文');
        }
    } catch (error) {
        errors.push(`node-fetch ${error.message}`);
    }

    throw new Error(`${nodeTemplate}：${errors.join('；')}`);
}

async function fetchTweetItemsFromAllNodes(userId) {
    const ready = TIMELINE_ENDPOINTS.filter(isNodeReady);

    if (!ready.length) {
        throw new Error('所有 Nitter 來源都在冷卻中');
    }

    const results = await Promise.allSettled(
        ready.map(async (nodeTemplate) => {
            try {
                const items = await fetchTweetItemsFromNode(nodeTemplate, userId);
                markNodeOk(nodeTemplate);
                return { nodeTemplate, items };
            } catch (error) {
                markNodeFailed(nodeTemplate);
                throw error;
            }
        })
    );

    const merged = [];
    const seen = new Set();
    const failures = [];

    for (const result of results) {
        if (result.status !== 'fulfilled') {
            failures.push(result.reason?.message || '未知來源錯誤');
            continue;
        }

        for (const item of result.value.items || []) {
            if (!item?.id || !item?.link) continue;
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
        }
    }

    if (!merged.length) {
        throw new Error(`所有 Nitter RSS 來源都失敗：${failures.join(' | ') || '沒有有效回應'}`);
    }

    merged.sort(compareTweetFreshness);
    return merged;
}

// ── Twitter 監測 ─────────────────────────────────────────────

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
        const manualFiles = [];
        const manualErrors = [];

        let channel = null;

        for (const userId of usersToCheck) {
            const state = getUserState(userId);

            let feedItems;
            const now = Date.now();
            const cached = feedCache.get(userId);

            if (!isManual && state.lastRequestAt && now - state.lastRequestAt < TWITTER_MIN_FETCH_GAP_MS) {
                continue;
            }
            state.lastRequestAt = now;

            try {
                feedItems = await withTimeout(
                    fetchTweetItemsFromAllNodes(userId),
                    10000,
                    `@${userId} X timeline`
                );
                feedCache.set(userId, { fetchedAt: Date.now(), items: feedItems });
            } catch (err) {
                const cachedIsUsable = cached && now - cached.fetchedAt <= TWITTER_CACHE_TTL_MS && cached.items?.length;
                if (cachedIsUsable) {
                    feedItems = cached.items;
                    console.warn(`⚠️ [Twitter] @${userId} 最新來源失敗，使用最近成功快取：${err.message}`);
                } else {
                    const msg = `@${userId}：${err.message}`;
                    console.warn(`⚠️ [Twitter] ${msg}`);
                    if (isManual) manualErrors.push(msg);
                    continue;
                }
            }

            if (!feedItems?.length) {
                const msg = `@${userId}：推文資料不完整`;
                if (isManual) manualErrors.push(msg);
                continue;
            }

            if (!state.lastFetchedId && !isManual) {
                state.lastFetchedId = pickNewestId(feedItems);
                rememberRecent(state.recentIds, state.lastFetchedId);
                saveState();
                console.log(`📦 [Twitter][${userId}] 建立初始推文快取：${state.lastFetchedId}`);
                continue;
            }

            if (isManual) {
                // 手動測試不下載影片，避免 interaction 逾時
                const previewItems = feedItems.slice(0, 3);
                const preview = previewItems.map((item, idx) => {
                    const titlePart = item.title ? `**${truncateText(item.title, 100)}**\n` : '';
                    const datePart = item.createdAt ? `\n🕒 ${item.createdAt}` : '';
                    return `${idx + 1}. ${titlePart}${item.link}${datePart}`;
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

            newItems = [...new Map(newItems.map(item => [item.id, item])).values()]
                .filter(item => !isRecent(state.recentIds, item.id));
            newItems.sort((a, b) => compareSnowflakeIds(a.id, b.id));

            if (!newItems.length) {
                console.log(`ℹ️ [Twitter][${userId}] 沒有新推文`);
                continue;
            }

            state.lastFetchedId = pickNewestId(feedItems);
            for (const item of newItems) rememberRecent(state.recentIds, item.id);
            saveState();

            try {
                if (!channel) {
                    channel = await client.channels.fetch(notifyChannelId);
                }
                if (channel) {
                    let isFirst = true;
                    for (const item of newItems) {
                        const videoFile = await downloadTweetVideo(item);
                        const titleLine = item.title ? `**${truncateText(item.title, 120)}**\n` : '';
                        const videoNote = videoFile ? '\n🎬 影片已附加，可在 Discord 直接完整播放。' : '';
                        await channel.send({
                            content: `${isFirst ? `🔔 ${PING_ROLE} **偵測到 @${userId} 發布了新訊息：**\n\n` : ''}${titleLine}${item.link}${videoNote}`,
                            files: videoFile ? [videoFile] : [],
                            allowedMentions: isFirst ? { parse: ['roles'] } : { parse: [] }
                        });
                        isFirst = false;
                    }
                }
            } catch (e) {
                console.error(`[Twitter][${userId}] 發送訊息失敗：${e.message}`);
            }
        }

        if (isManual && messageContext) {
            if (manualLines.length) {
                let fullText = `🔔 ${PING_ROLE} **[推特手動測試成功]**\n\n${manualLines.join('\n\n')}`;
                if (fullText.length > 1950) {
                    fullText = fullText.slice(0, 1900) + '\n\n*(部分預覽內容因長度限制已截斷)*';
                }

                await messageContext.reply({
                    content: fullText,
                    files: manualFiles,
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

// ── Steam 官方新聞 API ──────────────────────────────────────

async function checkSteamUpdates(client, isManual = false, messageContext = null) {
    if (steamLock) {
        if (!isManual) console.log('⏳ [Steam] 上一輪尚未完成，略過本輪');
        return;
    }

    steamLock = true;

    try {
        const newsCount = isManual ? STEAM_NEWS_COUNT_MANUAL : STEAM_NEWS_COUNT_AUTO;

        const response = await fetchWithTimeout(
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&count=${newsCount}&format=json`,
            {},
            STEAM_FETCH_TIMEOUT_MS
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

        const newestItem = newsItems[0];
        const currentId = String(newestItem.gid);

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

        const uniqueUnseen = [...new Map(unseen.map(item => [String(item.gid), item])).values()]
            .filter(item => !isRecent(steamState.recentIds, String(item.gid)));
        uniqueUnseen.sort((a, b) => compareSnowflakeIds(String(a.gid), String(b.gid)));

        if (isManual) {
            const preview = newsItems.slice(0, 3).map(item => {
                const images = extractSteamImages(item.contents || '');
                const cleanContent = stripSteamContent(item.contents || '').substring(0, 220);
                const imageNote = images.length ? `\n🖼 ${images.length} 張圖片` : '';
                return `**${item.title}**\n${cleanContent}${cleanContent.length >= 220 ? '...' : ''}${imageNote}\n${item.url}`;
            }).join('\n\n');

            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Steam 官方新聞 (手動測試)`)
                .setURL(newestItem.url)
                .setDescription(preview || `### **${newestItem.title}**`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 最新識別碼: ${newestItem.gid}` })
                .setTimestamp();

            const latestImages = extractSteamImages(newestItem.contents || '');
            const latestFiles = (await Promise.all(
                latestImages.slice(0, 10).map((url, idx) => downloadSteamImage(url, newestItem.gid, idx))
            )).filter(Boolean);

            if (latestFiles[0]) {
                steamEmbed.setImage(`attachment://${latestFiles[0].name}`);
            }

            if (messageContext) {
                await messageContext.reply({
                    content: `🔔 ${PING_ROLE} **Steam 手動測試成功**`,
                    embeds: [steamEmbed],
                    files: latestFiles,
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

        try {
            const channel = await client.channels.fetch(notifyChannelId);
            if (!channel) return;

            let firstMessage = true;

            for (const item of uniqueUnseen) {
                const payload = await buildSteamAnnouncementPayload(item);

                await channel.send({
                    content: firstMessage
                        ? `🔔 ${PING_ROLE} **監測到邊獄巴士有 ${uniqueUnseen.length} 則全新 Steam 公告發布！**`
                        : undefined,
                    embeds: payload.embeds,
                    files: payload.files,
                    allowedMentions: firstMessage ? { parse: ['roles'] } : { parse: [] }
                });

                firstMessage = false;
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

// ── YouTube 頻道監測 (透過網址進行) ────────────────────────

async function resolveYouTubeChannelId(pageUrl = YOUTUBE_PAGE_URL) {
    const candidates = [
        `${pageUrl}/videos`,
        pageUrl,
    ];

    const patterns = [
        /"channelId":"(UC[^"]+)"/,
        /"channelId\\":\\"(UC[^\\"]+)\\"/,
        /"externalId":"(UC[^"]+)"/,
        /"browseId":"(UC[^"]+)"/,
        /https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/,
        /canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/,
        /itemprop="identifier" content="(UC[\w-]+)"/
    ];

    for (const targetUrl of candidates) {
        try {
            const response = await fetchWithTimeout(targetUrl, {}, 12000);
            if (!response.ok) continue;

            const html = await response.text();
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match?.[1]) return match[1];
            }
        } catch (_) {}
    }

    return null;
}

async function fetchYouTubeItems(channelId) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const response = await fetchWithTimeout(url, {}, 12000);

    if (!response.ok) {
        throw new Error(`YouTube RSS HTTP 錯誤! 狀態碼: ${response.status} ( Channel ID: ${channelId} )`);
    }

    const xml = await response.text();
    const items = parseYouTubeItems(xml);

    if (!items.length) {
        throw new Error('YouTube RSS 解析失敗');
    }

    return items;
}

async function checkYouTubeUpdates(client, isManual = false, messageContext = null) {
    if (youtubeLock) {
        if (!isManual) console.log('⏳ [YouTube] 上一輪尚未完成，略過本輪');
        return;
    }

    youtubeLock = true;

    try {
        let channelId = youtubeState.channelId;

        if (!channelId) {
            console.log(`📡 [YouTube] 正在從網址解析頻道 ID：${YOUTUBE_PAGE_URL} ...`);
            channelId = await resolveYouTubeChannelId(YOUTUBE_PAGE_URL);
            if (channelId) {
                youtubeState.channelId = channelId;
                saveState();
                console.log(`✅ [YouTube] 從網址解析成功，頻道 ID 為：${channelId}`);
            }
        }

        if (!channelId) {
            throw new Error(`無法從網址 ${YOUTUBE_PAGE_URL} 取得頻道 ID`);
        }

        let feedItems;
        try {
            feedItems = await fetchYouTubeItems(channelId);
        } catch (rssErr) {
            console.warn(`⚠️ [YouTube] RSS 擷取失敗 (${rssErr.message})，重新從網址解析 Channel ID...`);
            channelId = await resolveYouTubeChannelId(YOUTUBE_PAGE_URL);
            if (channelId) {
                youtubeState.channelId = channelId;
                saveState();
                feedItems = await fetchYouTubeItems(channelId);
            } else {
                throw rssErr;
            }
        }

        if (!feedItems.length) {
            if (isManual && messageContext) {
                await messageContext.reply('❌ 未能獲取到 YouTube 頻道影片。');
            }
            return;
        }

        if (!youtubeState.lastVideoId && !isManual) {
            youtubeState.lastVideoId = feedItems[0].id;
            youtubeState.lastPublishedAt = feedItems[0].published || new Date().toISOString();
            rememberRecent(youtubeState.recentIds, feedItems[0].id);
            saveState();
            console.log(`📦 [YouTube] 成功建立初始影片快取：${feedItems[0].id}`);
            return;
        }

        if (isManual) {
            const preview = feedItems.slice(0, 3).map((item, idx) => {
                const titleLine = item.title ? `**${truncateText(item.title, 100)}**\n` : '';
                return `${idx + 1}. ${titleLine}${item.link}`;
            }).join('\n\n');

            let fullText = `📺 **YouTube 頻道測試 (${YOUTUBE_PAGE_URL})：**\n\n${preview}`;
            if (fullText.length > 1950) {
                fullText = fullText.slice(0, 1900) + '\n\n*(預覽內容已截斷)*';
            }

            if (messageContext) {
                await messageContext.reply({
                    content: fullText,
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

        newItems = [...new Map(newItems.map(item => [item.id, item])).values()]
            .filter(item => !isRecent(youtubeState.recentIds, item.id));
        newItems.reverse();

        if (!newItems.length) {
            console.log('ℹ️ [YouTube] 沒有新影片');
            return;
        }

        youtubeState.lastVideoId = feedItems[0].id;
        youtubeState.lastPublishedAt = feedItems[0].published || new Date().toISOString();
        for (const item of newItems) rememberRecent(youtubeState.recentIds, item.id);
        saveState();

        try {
            const channel = await client.channels.fetch(notifyChannelId);
            if (channel) {
                let currentMsg = `🔔 ${PING_ROLE} **@${YOUTUBE_HANDLE} 發布了 ${newItems.length} 部新影片：**\n\n`;
                let isFirst = true;

                for (const item of newItems) {
                    const titleLine = item.title ? `**${truncateText(item.title, 120)}**\n` : '';
                    const itemBlock = `${titleLine}${item.link}\n\n`;

                    if ((currentMsg + itemBlock).length > 1900) {
                        await channel.send({
                            content: currentMsg.trim(),
                            allowedMentions: isFirst ? { parse: ['roles'] } : { parse: [] }
                        });
                        currentMsg = itemBlock;
                        isFirst = false;
                    } else {
                        currentMsg += itemBlock;
                    }
                }

                if (currentMsg.trim()) {
                    await channel.send({
                        content: currentMsg.trim(),
                        allowedMentions: isFirst ? { parse: ['roles'] } : { parse: [] }
                    });
                }
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

// ── 頻道動態設定功能 ──────────────────────────────────────────

function setNotifyChannel(channelId) {
    if (!channelId) return false;
    notifyChannelId = String(channelId);
    return true;
}

function getNotifyChannel() {
    return notifyChannelId;
}

// ── 啟動定時循環 ─────────────────────────────────────────────

function startNewsCheckLoop(client) {
    if (globalThis.__NEWSCHECK_LOOP_STARTED__) {
        console.log('ℹ️ [LimbusNewscheck] 已啟動過，略過重複初始化');
        return;
    }
    globalThis.__NEWSCHECK_LOOP_STARTED__ = true;

    loadState();

    // 啟動時先各跑一次
    void checkSteamUpdates(client, false, null);
    void checkYouTubeUpdates(client, false, null);
    void checkTwitterUpdates(client, false, null);

    // Steam / YouTube 較便宜，維持 2 分鐘
    loopTimer = setInterval(() => {
        void checkSteamUpdates(client, false, null);
        void checkYouTubeUpdates(client, false, null);
    }, CHECK_INTERVAL);

    // Twitter 走 Nitter，拉長到 5 分鐘
    twitterTimer = setInterval(() => {
        void checkTwitterUpdates(client, false, null);
    }, TWITTER_CHECK_INTERVAL);

    if (typeof loopTimer.unref === 'function') loopTimer.unref();
    if (typeof twitterTimer.unref === 'function') twitterTimer.unref();

    console.log(`✅ [LimbusNewscheck] 監測循環啟動，Steam/YouTube ${CHECK_INTERVAL / 1000}s、Twitter ${TWITTER_CHECK_INTERVAL / 1000}s`);
}

module.exports = {
    checkTwitterUpdates,
    checkSteamUpdates,
    checkYouTubeUpdates,
    startNewsCheckLoop,
    setNotifyChannel,
    getNotifyChannel
};
