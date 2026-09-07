// Functions/LimbusNewscheck.js
// Twitter Nitter RSS + Steam 官方新聞 API + YouTube 頻道網址動態監測
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
const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL_MS || 2 * 60 * 1000);
const TWITTER_MIN_FETCH_GAP_MS = Number(process.env.TWITTER_MIN_FETCH_GAP_MS || 90 * 1000);
const TWITTER_CACHE_TTL_MS = Number(process.env.TWITTER_CACHE_TTL_MS || 10 * 60 * 1000);

// 自動監測預設抓少一點，速度更快；手動測試可多抓
const STEAM_NEWS_COUNT_AUTO = Number(process.env.STEAM_NEWS_COUNT_AUTO || 3);
const STEAM_NEWS_COUNT_MANUAL = Number(process.env.STEAM_NEWS_COUNT_MANUAL || 5);
const STEAM_FETCH_TIMEOUT_MS = Number(process.env.STEAM_FETCH_TIMEOUT_MS || 5000);

// Steam 圖片前綴
const STEAM_CLAN_IMAGE_BASE = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/clans/';

// 🎯 YouTube 設定：完全使用頻道網址進行解析與監測
const YOUTUBE_HANDLE = (process.env.YOUTUBE_HANDLE || 'ProjectMoonOfficial').replace(/^@/, '');
const YOUTUBE_PAGE_URL = process.env.YOUTUBE_PAGE_URL || `https://www.youtube.com/@${YOUTUBE_HANDLE}`;

// X 公開 syndication timeline。Nitter 已大規模停止服務，改用 X 自己提供的公開時間線端點。
// 可用 X_TIMELINE_ENDPOINTS 以逗號分隔覆寫，方便未來切換自架 proxy。
const TIMELINE_ENDPOINTS = (process.env.X_TIMELINE_ENDPOINTS ||
    'https://syndication.twitter.com/srv/timeline-profile/screen-name')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

const STATE_FILE = path.join(process.cwd(), 'data', 'newscheck-state.json');
const RECENT_TTL_MS = 30 * 60 * 1000;

let loopTimer = null;
let twitterLock = false;
let steamLock = false;
let youtubeLock = false;

const userStates = new Map(); // userId -> { lastFetchedId, recentIds: Map<id, ts> }
const feedCache = new Map(); // userId -> { fetchedAt, items }
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
        console.warn(`[LimbusNewscheck] 儲存狀態失敗：${err.message}`);
    }
}

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

function compareTweetFreshness(a, b) {
    const aTime = Date.parse(a?.createdAt || '');
    const bTime = Date.parse(b?.createdAt || '');

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return bTime - aTime;
    }

    return compareSnowflakeIds(b?.id || '', a?.id || '');
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

function extractTweetKey(urlOrId) {
    if (!urlOrId) return null;

    const text = String(urlOrId).trim();

    const statusMatch = text.match(/status\/(\d+)/i);
    if (statusMatch) return statusMatch[1];

    const numericMatch = text.match(/\b(\d{10,})\b/);
    if (numericMatch) return numericMatch[1];

    return text.replace(/^https:\/\/[^/]+/, '').split('?')[0].split('#')[0];
}

function extractJsonObjectsByMarker(html, marker) {
    const objects = [];
    let cursor = 0;

    while (true) {
        const start = html.indexOf(marker, cursor);
        if (start < 0) break;

        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

        for (let index = start; index < html.length; index += 1) {
            const char = html[index];

            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }

            if (char === '"') inString = true;
            else if (char === '{') depth += 1;
            else if (char === '}' && --depth === 0) {
                end = index + 1;
                break;
            }
        }

        if (end < 0) break;

        try {
            objects.push(JSON.parse(html.slice(start, end)));
        } catch (_) {
            // Ignore unrelated or truncated embedded objects.
        }

        cursor = end;
    }

    return objects;
}

function parseSyndicationTimeline(raw, fallbackUserId) {
    const marker = '{"type":"tweet","entry_id":"tweet-';
    const entries = extractJsonObjectsByMarker(String(raw || ''), marker);
    const seen = new Set();

    return entries
        .map(entry => entry?.content?.tweet)
        .filter(tweet => tweet?.id_str)
        .map(tweet => {
            const id = String(tweet.id_str);
            const screenName = tweet.user?.screen_name || fallbackUserId;
            const text = decodeXmlEntities(tweet.full_text || tweet.text || '').trim();

            return {
                id,
                link: `https://x.com/${screenName}/status/${id}`,
                title: text || `@${screenName} 發布了新訊息`,
                createdAt: tweet.created_at || null,
            };
        })
        .filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
}

function decodeXEmbeddedString(value) {
    try {
        return JSON.parse(`"${value}"`);
    } catch (_) {
        return String(value || '')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
}

function parseXProfilePage(raw, fallbackUserId) {
    const html = String(raw || '');
    const detailStart = /"client:VHdlZXQ6([^\"]+):details"\s*:\$R\[\d+\]=\{/g;
    const items = [];
    let match;

    while ((match = detailStart.exec(html))) {
        const blockStart = detailStart.lastIndex;
        const nextBlock = html.indexOf('},"client:', blockStart);
        const block = html.slice(blockStart, nextBlock >= 0 ? nextBlock : html.length);
        const textMatch = block.match(/full_text:"((?:\\.|[^"\\])*)"/);
        const timeMatch = block.match(/created_at_ms:(\d+)/);
        if (!textMatch) continue;

        let id = '';
        try {
            id = Buffer.from(match[1], 'base64').toString('utf8');
        } catch (_) {
            continue;
        }
        if (!/^\d+$/.test(id)) continue;

        items.push({
            id,
            link: `https://x.com/${fallbackUserId}/status/${id}`,
            title: decodeXEmbeddedString(textMatch[1]).trim() || `@${fallbackUserId} 發布了新訊息`,
            createdAt: timeMatch ? new Date(Number(timeMatch[1])).toUTCString() : null,
        });
    }

    const videoVariantsByTweet = new Map();
    const variantPattern = /"client:VHdlZXQ6([^"]+):media_entities2:(\d+):video_info:variants:\d+":\$R\[\d+\]=\{([^}]*)\}/g;
    let variantMatch;
    while ((variantMatch = variantPattern.exec(html))) {
        let tweetId = '';
        try {
            tweetId = Buffer.from(variantMatch[1], 'base64').toString('utf8');
        } catch (_) {
            continue;
        }
        if (!/^\d+$/.test(tweetId)) continue;
        const block = variantMatch[3];
        const contentType = block.match(/content_type:"([^"]+)"/)?.[1] || '';
        const url = block.match(/url:"([^"]+)"/)?.[1] || '';
        const bitrate = Number(block.match(/bitrate:(\d+)/)?.[1] || 0);
        if (!url || !/^video\/mp4$/i.test(contentType)) continue;
        if (!videoVariantsByTweet.has(tweetId)) videoVariantsByTweet.set(tweetId, []);
        videoVariantsByTweet.get(tweetId).push({ url, bitrate });
    }

    for (const item of items) {
        const variants = [...new Map((videoVariantsByTweet.get(item.id) || []).map(v => [v.url, v])).values()]
            .sort((a, b) => b.bitrate - a.bitrate);
        if (variants.length) {
            item.videoVariants = variants;
            item.videoUrl = variants[0].url;
        }
    }

    const unique = [...new Map(items.map(item => [item.id, item])).values()];
    unique.sort(compareTweetFreshness);
    return unique;
}

async function downloadTweetVideo(item) {
    const variants = Array.isArray(item?.videoVariants) && item.videoVariants.length
        ? item.videoVariants
        : (item?.videoUrl ? [{ url: item.videoUrl, bitrate: 0 }] : []);
    if (!variants.length) return null;

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'angela-x-video-'));
    try {
        for (const [index, variant] of variants.entries()) {
            const outputPath = path.join(tempDir, `tweet-${item.id}-${index}.mp4`);
            try {
                await execFileAsync('curl', [
                    '--fail',
                    '--silent',
                    '--show-error',
                    '--location',
                    '--connect-timeout', '5',
                    '--max-time', '45',
                    '--max-filesize', '24000000',
                    '--user-agent', 'Mozilla/5.0',
                    '--output', outputPath,
                    variant.url,
                ], {
                    timeout: 50000,
                    killSignal: 'SIGKILL',
                });
                const stat = await fs.promises.stat(outputPath);
                if (!stat.size || stat.size > 24 * 1024 * 1024) continue;
                const buffer = await fs.promises.readFile(outputPath);
                return new AttachmentBuilder(buffer, { name: `x-${item.id}.mp4` });
            } catch (_) {
                // 高畫質超過 Discord 附件上限或下載失敗時，嘗試下一個較低畫質。
            }
        }
        return null;
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function fetchTweetItemsFromXPage(userId) {
    const url = `https://x.com/${encodeURIComponent(userId)}?f=live&fresh=${Date.now()}`;
    const result = await execFileAsync('curl', [
        '--silent',
        '--show-error',
        '--location',
        '--compressed',
        '--connect-timeout', '4',
        '--max-time', '7',
        '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        '--header', 'Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        url,
    ], {
        maxBuffer: 4 * 1024 * 1024,
        timeout: 8000,
        killSignal: 'SIGKILL',
    });
    const items = parseXProfilePage(result.stdout, userId);
    if (!items.length) throw new Error('x.com 頁面沒有可解析的最新推文');
    return items;
}

async function fetchTweetItemsFromNode(nodeUrl, userId) {
    const url = `${nodeUrl}/${encodeURIComponent(userId)}?format=html&dnt=true&fresh=${Date.now()}`;
    const errors = [];

    // 先使用 curl。X syndication 對 Node HTTP client 較容易回 429，
    // 但同一個公開端點透過 curl 可以正常取得內容。
    try {
        const result = await execFileAsync('curl', [
            '--silent',
            '--show-error',
            '--location',
            '--compressed',
            '--connect-timeout', '4',
            '--max-time', '7',
            '--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            '--header', 'Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            url,
        ], {
            maxBuffer: 3 * 1024 * 1024,
        });
        const items = parseSyndicationTimeline(result.stdout, userId);
        if (items.length) return items;
        errors.push('curl 回應沒有可解析的推文');
    } catch (error) {
        const detail = error.stderr ? String(error.stderr).trim().slice(0, 180) : error.message;
        errors.push(`curl ${detail}`);
    }

    // curl 不可用時保留 Node fetch fallback。
    try {
        const response = await fetchWithTimeout(url, {
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            },
        }, 4500);

        if (!response.ok) {
            errors.push(`node-fetch HTTP ${response.status}`);
        } else {
            const text = await response.text();
            const items = parseSyndicationTimeline(text, userId);
            if (items.length) return items;
            errors.push('node-fetch 回應沒有可解析的推文');
        }
    } catch (error) {
        errors.push(`node-fetch ${error.message}`);
    }

    throw new Error(`${nodeUrl}：${errors.join('；')}`);
}

async function fetchTweetItemsFromAllNodes(userId) {
    const sourceErrors = [];

    // x.com 個人頁面是主來源：它包含最新的 4 則貼文，
    // syndication endpoint 有時會停留在數月前的舊快取。
    try {
        const currentItems = await withTimeout(
            fetchTweetItemsFromXPage(userId),
            10000,
            `@${userId} x.com page`
        );
        if (currentItems.length) return currentItems;
    } catch (error) {
        sourceErrors.push(`x.com：${error.message}`);
    }

    const results = await Promise.allSettled(
        TIMELINE_ENDPOINTS.map(async (nodeUrl) => ({
            nodeUrl,
            items: await fetchTweetItemsFromNode(nodeUrl, userId)
        }))
    );

    const merged = [];
    const seen = new Set();
    const failures = [...sourceErrors];

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
        throw new Error(`所有 X timeline 來源都失敗：${failures.join(' | ') || '沒有有效回應'}`);
    }

    merged.sort(compareTweetFreshness);
    return merged;
}

// 🌐 直接從 YouTube 頻道網址 (https://www.youtube.com/@ProjectMoonOfficial) 動態解析 Channel ID
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
                state.lastFetchedId = feedItems[0].id;
                rememberRecent(state.recentIds, feedItems[0].id);
                saveState();
                console.log(`📦 [Twitter][${userId}] 建立初始推文快取：${feedItems[0].id}`);
                continue;
            }

            if (isManual) {
                const previewItems = feedItems.slice(0, 3);
                const preview = previewItems.map((item, idx) => {
                    const titlePart = item.title ? `**${truncateText(item.title, 100)}**\n` : '';
                    const datePart = item.createdAt ? `\n🕒 ${item.createdAt}` : '';
                    return `${idx + 1}. ${titlePart}${item.link}${datePart}`;
                });
                for (const item of previewItems) {
                    const file = await downloadTweetVideo(item);
                    if (file) manualFiles.push(file);
                }
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
            newItems.sort((a, b) => compareSnowflakeIds(a.id, b.id));

            if (!newItems.length) {
                console.log(`ℹ️ [Twitter][${userId}] 沒有新推文`);
                continue;
            }

            state.lastFetchedId = feedItems[0].id;
            for (const item of newItems) rememberRecent(state.recentIds, item.id);
            saveState();

            try {
                const channel = await client.channels.fetch(notifyChannelId);
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

// ── Steam 官方新聞 API ─────────────────────────────────────
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

        const uniqueUnseen = [...new Map(unseen.map(item => [String(item.gid), item])).values()];
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
async function checkYouTubeUpdates(client, isManual = false, messageContext = null) {
    if (youtubeLock) {
        if (!isManual) console.log('⏳ [YouTube] 上一輪尚未完成，略過本輪');
        return;
    }

    youtubeLock = true;

    try {
        // 🎯 1. 每次皆從 YouTube 頻道網址動態抓取 Channel ID
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

        // 🎯 2. 獲取 RSS，若失效則自動重新連線網址重新解析 ID
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

        newItems = [...new Map(newItems.map(item => [item.id, item])).values()];
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

    void checkTwitterUpdates(client, false, null);
    void checkSteamUpdates(client, false, null);
    void checkYouTubeUpdates(client, false, null);

    loopTimer = setInterval(() => {
        void checkTwitterUpdates(client, false, null);
        void checkSteamUpdates(client, false, null);
        void checkYouTubeUpdates(client, false, null);
    }, CHECK_INTERVAL);

    console.log(`✅ [LimbusNewscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = {
    checkTwitterUpdates,
    checkSteamUpdates,
    checkYouTubeUpdates,
    startNewsCheckLoop,
    setNotifyChannel,
    getNotifyChannel
};
