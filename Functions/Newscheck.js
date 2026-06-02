// Functions/Newscheck.js
const { EmbedBuilder } = require('discord.js');

const fetchImpl =
    typeof global.fetch === 'function'
        ? global.fetch.bind(global)
        : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const TARGET_USER     = process.env.TARGET_USER        || 'LimbusCompany_B';
const NOTIFY_CHANNEL  = process.env.NOTIFY_CHANNEL_ID  || '1402282604165730348';
const PING_ROLE       = process.env.PING_ROLE_MENTION  || '<@&1406984068725211177>';
const X_BEARER        = process.env.X_BEARER_TOKEN     || '';
const STEAM_APP_ID    = process.env.STEAM_APP_ID       || '1973530';
const CHECK_INTERVAL  = 60 * 1000;

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

let lastTweetId   = null;
let loopTimer     = null;

function fetchWithTimeout(url, options = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetchImpl(url, {
        ...options,
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) },
    }).finally(() => clearTimeout(t));
}

function clean(str = '') {
    return str
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function normLink(link = '') {
    if (!link) return null;
    let s = link.trim().replace(/^http:\/\//, 'https://');
    s = s.replace(/^https:\/\/(twitter\.com|x\.com)/i, 'https://vxtwitter.com');
    s = s.replace(/^https:\/\/[^/]+\/([A-Za-z0-9_]+)\/status\/(\d+).*/i,
        'https://vxtwitter.com/$1/status/$2');
    return s;
}

function firstMatch(text, re) {
    return text.match(re)?.[1]?.trim() ?? null;
}

function parseItem(xml) {
    const m = xml.match(/<item[\s\S]*?<\/item>/i);
    if (!m) return null;
    const item = m[0];
    const link  = firstMatch(item, /<link>([\s\S]*?)<\/link>/i)
               || firstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const guid  = firstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const title = firstMatch(item, /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)
               || firstMatch(item, /<title>([\s\S]*?)<\/title>/i);
    const desc  = firstMatch(item, /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)
               || firstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    if (!link && !guid) return null;
    return {
        id:    (guid || link || title || '').trim(),
        link:  link ? link.trim().replace(/^http:/, 'https:') : null,
        title: title || '',
        desc:  desc  || '',
    };
}

function vxExtract(data) {
    if (!data) return null;
    if (Array.isArray(data?.tweets) && data.tweets.length) return data.tweets[0];
    if (Array.isArray(data?.data)   && data.data.length)   return data.data[0];
    if (Array.isArray(data)         && data.length)        return data[0];
    if (data?.tweet) return data.tweet;
    return null;
}

async function notify(client, embed, isManual, ctx) {
    if (isManual && ctx) {
        return ctx.reply({
            content: PING_ROLE,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] },
        });
    }
    const ch = client.channels.cache.get(NOTIFY_CHANNEL)
        || await client.channels.fetch(NOTIFY_CHANNEL).catch(() => null);
    if (!ch) throw new Error(`找不到通知頻道：${NOTIFY_CHANNEL}`);
    return ch.send({ content: PING_ROLE, embeds: [embed], allowedMentions: { parse: ['roles'] } });
}

async function tryXApi() {
    if (!X_BEARER) return null;
    try {
        const h = { Authorization: `Bearer ${X_BEARER}` };
        const ur = await fetchWithTimeout(
            `https://api.x.com/2/users/by/username/${TARGET_USER}?user.fields=id`,
            { headers: h }
        );
        if (!ur.ok) return null;
        const uid = (await ur.json())?.data?.id;
        if (!uid) return null;
        const tr = await fetchWithTimeout(
            `https://api.x.com/2/users/${uid}/tweets?max_results=5&tweet.fields=created_at,text`,
            { headers: h }
        );
        if (!tr.ok) return null;
        const tweet = (await tr.json())?.data?.[0];
        if (!tweet?.id) return null;
        return {
            id:     String(tweet.id),
            text:   tweet.text || '',
            link:   `https://x.com/${TARGET_USER}/status/${tweet.id}`,
            source: 'X API v2',
        };
    } catch (e) {
        console.warn(`[Twitter] 官方 API: ${e.message}`);
        return null;
    }
}

async function tryVxTwitter() {
    try {
        const res = await fetchWithTimeout(`https://api.vxtwitter.com/${TARGET_USER}`);
        if (!res.ok) return null;
        const t = vxExtract(await res.json());
        if (!t) return null;
        const id = t.id || t.tweetID || t.tweet_id;
        if (!id) return null;
        return {
            id:     String(id),
            text:   t.text || t.full_text || '',
            link:   `https://vxtwitter.com/${TARGET_USER}/status/${id}`,
            source: 'VxTwitter',
        };
    } catch (e) {
        console.warn(`[Twitter] VxTwitter: ${e.message}`);
        return null;
    }
}

async function tryRssHub() {
    for (const node of RSSHUB_NODES) {
        try {
            const res = await fetchWithTimeout(`${node}/twitter/user/${TARGET_USER}`);
            if (!res.ok) continue;
            const item = parseItem(await res.text());
            if (!item?.link) continue;
            const link = normLink(item.link);
            const id   = link?.match(/status\/(\d+)/i)?.[1] || item.id || link;
            return { id, text: clean(item.title || item.desc), link, source: `RSSHub (${new URL(node).hostname})` };
        } catch (e) {
            console.warn(`[Twitter] RSSHub ${node}: ${e.message}`);
        }
    }
    return null;
}

async function tryNitter() {
    for (const node of NITTER_NODES) {
        try {
            const res = await fetchWithTimeout(`${node}/${TARGET_USER}/rss`);
            if (!res.ok) continue;
            const item = parseItem(await res.text());
            if (!item?.link) continue;
            const link = normLink(item.link);
            const id   = link?.match(/status\/(\d+)/i)?.[1] || item.id || link;
            return { id, text: clean(item.desc || item.title), link, source: `Nitter (${new URL(node).hostname})` };
        } catch (e) {
            console.warn(`[Twitter] Nitter ${node}: ${e.message}`);
        }
    }
    return null;
}

async function getLatestTweet() {
    for (const fn of [tryXApi, tryVxTwitter, tryRssHub, tryNitter]) {
        const r = await fn();
        if (r?.link) return r;
    }
    return null;
}

async function checkTwitterUpdates(client, isManual = false, ctx = null) {
    console.log(`[Twitter] 開始抓取：@${TARGET_USER}`);
    let tweet = null;
    try { tweet = await getLatestTweet(); }
    catch (e) { console.error(`[Twitter] 異常: ${e.message}`); }

    if (!tweet) {
        console.error('❌ [Twitter] 所有線路均失敗。');
        if (isManual && ctx) {
            return ctx.reply(
                '❌ 所有監測線路（官方 API / VxTwitter / RSSHub / Nitter）均不可用。\n' +
                '💡 提示：在 Render 環境變數設定 `X_BEARER_TOKEN` 可啟用官方 API。'
            );
        }
        return;
    }

    const uid = tweet.id || tweet.link;
    if (!isManual && lastTweetId === uid) return;
    if (!isManual) lastTweetId = uid;

    const text = clean(tweet.text || '').slice(0, 300) || '點擊連結查看內容';
    const embed = new EmbedBuilder()
        .setTitle('📢 Project Moon 官方 Twitter 最新情報')
        .setDescription(`**內文摘要：**\n${text}\n\n**連結：** [點擊此處查看原文](${tweet.link})`)
        .setColor(0x5865f2)
        .setFooter({ text: `來源：${tweet.source || 'Unknown'}` })
        .setTimestamp();

    return notify(client, embed, isManual, ctx);
}

async function checkSteamUpdates(client, isManual = false, ctx = null) {
    try {
        const url = `https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/?appid=${STEAM_APP_ID}&count_before=0&count_after=5&lang=tchinese`;
        const res = await fetchWithTimeout(url, {}, 10000);
        if (!res.ok) throw new Error(`Steam API 異常: ${res.status}`);
        const events = (await res.json())?.events;
        if (!Array.isArray(events) || !events.length) {
            if (isManual && ctx) return ctx.reply('ℹ️ Steam 目前沒有新公告。');
            return;
        }
        const ev    = events[0];
        const title = ev?.announcement_body?.headline || '（無標題）';
        const body  = clean(ev?.announcement_body?.body || '').slice(0, 300);
        const gid   = ev?.announcement_body?.gid;
        const link  = gid
            ? `https://store.steampowered.com/news/app/${STEAM_APP_ID}/view/${gid}`
            : `https://store.steampowered.com/app/${STEAM_APP_ID}/`;
        const embed = new EmbedBuilder()
            .setTitle(`🎮 Steam 最新公告：${title}`)
            .setDescription(`${body}\n\n**連結：** [點擊此處查看原文](${link})`)
            .setColor(0x1b2838)
            .setTimestamp();
        return notify(client, embed, isManual, ctx);
    } catch (e) {
        console.error(`[Steam] 失敗: ${e.message}`);
        if (isManual && ctx) return ctx.reply(`❌ Steam 抓取失敗：${e.message}`);
    }
}

function startNewsCheckLoop(client) {
    if (loopTimer) clearInterval(loopTimer);
    checkTwitterUpdates(client).catch(e => console.error('[Newscheck] 初次:', e.message));
    loopTimer = setInterval(
        () => checkTwitterUpdates(client).catch(e => console.error('[Newscheck] 定期:', e.message)),
        CHECK_INTERVAL
    );
    console.log(`✅ [Newscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = { checkTwitterUpdates, checkSteamUpdates, startNewsCheckLoop };
