// Functions/Newscheck.js
const { EmbedBuilder } = require('discord.js');

const fetchImpl =
    typeof global.fetch === 'function'
        ? global.fetch.bind(global)
        : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TARGET_USER = process.env.TARGET_USER || 'LimbusCompany_B';
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID || '1402282604165730348';
const PING_ROLE_MENTION = process.env.PING_ROLE_MENTION || '<@&1406984068725211177>';
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || '';
const STEAM_APP_ID = process.env.STEAM_APP_ID || '1973530';

const RSSHUB_NODES = [
    'https://rsshub.app',
    'https://rsshub.rssforever.com',
    'https://rsshub.moeyy.xyz',
    'https://rss.fatpandadev.com',
];

const NITTER_NODES = [
    'https://nitter.poast.org',
    'https://nitter.cz',
    'https://nitter.net',
    'https://nitter.1d4.us',
];

let lastTweetId = null;
let newsLoopTimer = null;
const CHECK_INTERVAL_MS = 60 * 1000;

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetchImpl(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ...(options.headers || {}),
        },
    }).finally(() => clearTimeout(timeout));
}

function decodeHtmlEntities(str = '') {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripHtml(str = '') {
    return str
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .trim();
}

function cleanText(str = '') {
    return decodeHtmlEntities(stripHtml(str)).replace(/\s+/g, ' ').trim();
}

function normalizeTweetLink(link = '') {
    if (!link) return null;
    let out = link.trim().replace('http://', 'https://');
    out = out.replace(/^https:\/\/(twitter\.com|x\.com)/i, 'https://vxtwitter.com');
    out = out.replace(/^https:\/\/[^/]+\/([A-Za-z0-9_]+)\/status\/(\d+).*/i, 'https://vxtwitter.com/$1/status/$2');
    return out;
}

function extractFirstMatch(text, regex) {
    return text.match(regex)?.[1]?.trim() ?? null;
}

function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item[\s\S]*?<\/item>/i);
    if (!itemMatch) return null;
    const item = itemMatch[0];
    const link =
        extractFirstMatch(item, /<link>([\s\S]*?)<\/link>/i) ||
        extractFirstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const guid = extractFirstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const title =
        extractFirstMatch(item, /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        extractFirstMatch(item, /<title>([\s\S]*?)<\/title>/i);
    const desc =
        extractFirstMatch(item, /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        extractFirstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    if (!link && !guid) return null;
    return {
        id: (guid || link || title || '').trim(),
        link: link ? link.trim().replace('http://', 'https://') : null,
        title: title || '',
        desc: desc || '',
    };
}

function extractLatestTweetFromVx(data) {
    if (!data) return null;
    if (Array.isArray(data?.tweets) && data.tweets.length > 0) return data.tweets[0];
    if (Array.isArray(data?.data) && data.data.length > 0) return data.data[0];
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data?.tweet) return data.tweet;
    return null;
}

async function sendNotification(client, embed, isManual = false, messageContext = null) {
    if (isManual && messageContext) {
        return messageContext.reply({
            content: PING_ROLE_MENTION,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] },
        });
    }
    const channel =
        client.channels.cache.get(NOTIFY_CHANNEL_ID) ||
        (await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null));
    if (!channel) throw new Error(`找不到通知頻道：${NOTIFY_CHANNEL_ID}`);
    return channel.send({
        content: PING_ROLE_MENTION,
        embeds: [embed],
        allowedMentions: { parse: ['roles'] },
    });
}

async function fetchOfficialXLatestTweet() {
    if (!X_BEARER_TOKEN) return null;
    try {
        const headers = { Authorization: `Bearer ${X_BEARER_TOKEN}` };
        const userRes = await fetchWithTimeout(
            `https://api.x.com/2/users/by/username/${encodeURIComponent(TARGET_USER)}?user.fields=id,username,name`,
            { headers }
        );
        if (!userRes.ok) return null;
        const userJson = await userRes.json();
        const userId = userJson?.data?.id;
        if (!userId) return null;
        const tweetRes = await fetchWithTimeout(
            `https://api.x.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,text`,
            { headers }
        );
        if (!tweetRes.ok) return null;
        const tweetJson = await tweetRes.json();
        const tweet = tweetJson?.data?.[0];
        if (!tweet?.id) return null;
        return {
            id: String(tweet.id),
            text: tweet.text || '',
            link: `https://x.com/${TARGET_USER}/status/${tweet.id}`,
            source: 'X API v2',
        };
    } catch (e) {
        console.warn(`[Twitter監測] 官方 API 失敗: ${e.message}`);
        return null;
    }
}

async function fetchVxTwitterLatestTweet() {
    try {
        const res = await fetchWithTimeout(`https://api.vxtwitter.com/${encodeURIComponent(TARGET_USER)}`);
        if (!res.ok) return null;
        const data = await res.json();
        const latestTweet = extractLatestTweetFromVx(data);
        if (!latestTweet) return null;
        const id = latestTweet.id || latestTweet.tweetID || latestTweet.tweet_id;
        const text = latestTweet.text || latestTweet.full_text || latestTweet.content || '';
        if (!id) return null;
        return {
            id: String(id),
            text,
            link: `https://vxtwitter.com/${TARGET_USER}/status/${id}`,
            source: 'VxTwitter JSON API',
        };
    } catch (e) {
        console.warn(`[Twitter監測] VxTwitter 失敗: ${e.message}`);
        return null;
    }
}

async function fetchFromRssHub() {
    for (const node of RSSHUB_NODES) {
        try {
            const res = await fetchWithTimeout(`${node}/twitter/user/${encodeURIComponent(TARGET_USER)}`);
            if (!res.ok) continue;
            const xml = await res.text();
            const item = parseLatestItem(xml);
            if (!item?.link) continue;
            const normalizedLink = normalizeTweetLink(item.link);
            const idMatch = normalizedLink?.match(/status\/(\d+)/i);
            const id = idMatch?.[1] || item.id || normalizedLink;
            return {
                id,
                text: cleanText(item.title || item.desc || ''),
                link: normalizedLink,
                source: `RSSHub (${new URL(node).hostname})`,
            };
        } catch (e) {
            console.warn(`[Twitter監測] RSSHub 節點 ${node} 異常: ${e.message}`);
        }
    }
    return null;
}

async function fetchFromNitterRss() {
    for (const node of NITTER_NODES) {
        try {
            const res = await fetchWithTimeout(`${node}/${encodeURIComponent(TARGET_USER)}/rss`);
            if (!res.ok) continue;
            const xml = await res.text();
            const item = parseLatestItem(xml);
            if (!item?.link) continue;
            const normalizedLink = normalizeTweetLink(item.link);
            const idMatch = normalizedLink?.match(/status\/(\d+)/i);
            const id = idMatch?.[1] || item.id || normalizedLink;
            return {
                id,
                text: cleanText(item.desc || item.title || ''),
                link: normalizedLink,
                source: `Nitter RSS (${new URL(node).hostname})`,
            };
        } catch (e) {
            console.warn(`[Twitter監測] Nitter 節點 ${node} 異常: ${e.message}`);
        }
    }
    return null;
}

async function getLatestTweet() {
    const strategies = [
        fetchOfficialXLatestTweet,
        fetchVxTwitterLatestTweet,
        fetchFromRssHub,
        fetchFromNitterRss,
    ];
    for (const strategy of strategies) {
        const result = await strategy();
        if (result?.link) return result;
    }
    return null;
}

async function checkTwitterUpdates(client, isManual = false, messageContext = null) {
    let latestTweet = null;
    try {
        console.log(`[Twitter監測] 開始抓取：@${TARGET_USER}`);
        latestTweet = await getLatestTweet();
    } catch (e) {
        console.error(`[Twitter監測] 抓取流程異常: ${e.message}`);
    }

    if (!latestTweet) {
        console.error('❌ [Twitter監測] 所有抓取策略均失敗，無法取得最新推文。');
        if (isManual && messageContext) {
            return messageContext.reply(
                '❌ 目前所有監測線路（官方 API / VxTwitter / RSSHub / Nitter）都不可用，請稍後再試。\n' +
                '💡 提示：若要啟用官方 API，請在 Render 環境變數中設定 `X_BEARER_TOKEN`。'
            );
        }
