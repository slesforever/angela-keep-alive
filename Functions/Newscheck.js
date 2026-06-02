// Functions/Newscheck.js
const { EmbedBuilder } = require('discord.js');

// Node 18+ 有全域 fetch；沒有的話才動態載入 node-fetch
const fetchImpl =
    typeof global.fetch === 'function'
        ? global.fetch.bind(global)
        : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TARGET_USER = 'LimbusCompany_B';
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

// 備援用的 RSSHub 及 Nitter 節點群
const RSSHUB_NODES = [
    'https://rsshub.app',
    'https://rsshub.moeyy.cn',
    'https://rsshub.rssforever.com',
];

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz',
    'https://nitter.privacydev.net',
];

let lastFetchedId = null;

// 帶有超時控制的 Fetch
function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetchImpl(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
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
    return decodeHtmlEntities(stripHtml(str))
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTweetLink(link = '') {
    if (!link) return null;

    let out = link.trim();

    if (out.startsWith('http://')) out = out.replace('http://', 'https://');
    out = out.replace(/^https:\/\/(twitter\.com|x\.com)/i, 'https://vxtwitter.com');
    out = out.replace(/^https:\/\/[^/]+\/([A-Za-z0-9_]+)\/status\/(\d+).*/i, 'https://vxtwitter.com/$1/status/$2');

    return out;
}

function extractLatestTweetFromVx(data) {
    if (!data) return null;

    if (Array.isArray(data?.tweets) && data.tweets.length > 0) return data.tweets[0];
    if (Array.isArray(data?.data) && data.data.length > 0) return data.data[0];
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data?.tweet) return data.tweet;

    return null;
}

function extractFirstMatch(text, regex) {
    return text.match(regex)?.[1]?.trim() ?? null;
}

function extractItemFromRss(xml) {
    const item = xml.match(/<item[\s\S]*?<\/item>/i)?.[0];
    if (!item) return null;

    const link =
        extractFirstMatch(item, /<link>([\s\S]*?)<\/link>/i) ||
        extractFirstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);

    const title =
        extractFirstMatch(item, /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        extractFirstMatch(item, /<title>([\s\S]*?)<\/title>/i);

    const desc =
        extractFirstMatch(item, /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        extractFirstMatch(item, /<description>([\s\S]*?)<\/description>/i);

    return { link, title, desc };
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

    if (!channel) {
        throw new Error(`找不到通知頻道：${NOTIFY_CHANNEL_ID}`);
    }

    return channel.send({
        content: PING_ROLE_MENTION,
        embeds: [embed],
        allowedMentions: { parse: ['roles'] },
    });
}

/**
 * Twitter / X 監測核心
 */
async function checkTwitterUpdates(client, isManual = false, messageContext = null) {
    let finalTweetLink = null;
    let finalTweetText = '點擊下方連結檢視最新公告內容';
    let strategyUsed = '';

    // 方案一：VxTwitter API
    try {
        console.log('[Twitter監測] 正在嘗試 方案一 (VxTwitter API)...');
        const vxUrl = `https://api.vxtwitter.com/${TARGET_USER}`;
        const res = await fetchWithTimeout(vxUrl);

        if (res.ok) {
            const data = await res.json();
            const latestTweet = extractLatestTweetFromVx(data);

            if (latestTweet) {
                const id = latestTweet.id || latestTweet.tweetID || latestTweet.tweet_id;
                const text = latestTweet.text || latestTweet.full_text || latestTweet.content || '';

                if (id) {
                    finalTweetLink = `https://vxtwitter.com/${TARGET_USER}/status/${id}`;
                    finalTweetText = cleanText(text).slice(0, 300) || finalTweetText;
                    strategyUsed = 'VxTwitter JSON API';
                }
            }
        }
    } catch (e) {
        console.warn(`[Twitter監測] 方案一失敗: ${e.message}`);
    }

    // 方案二：RSSHub
    if (!finalTweetLink) {
        for (const node of RSSHUB_NODES) {
            try {
                console.log(`[Twitter監測] 正在嘗試 方案二 (RSSHub: ${node})...`);
                const rssHubUrl = `${node}/twitter/user/${TARGET_USER}`;
                const res = await fetchWithTimeout(rssHubUrl);

                if (!res.ok) continue;

                const xml = await res.text();
                const item = extractItemFromRss(xml);
                if (!item?.link) continue;

                finalTweetLink = normalizeTweetLink(item.link);
                finalTweetText = cleanText(item.title || item.desc || finalTweetText).slice(0, 300) || finalTweetText;
                strategyUsed = `RSSHub (${new URL(node).hostname})`;
                break;
            } catch (e) {
                console.warn(`[Twitter監測] RSSHub 節點 ${node} 異常: ${e.message}`);
            }
        }
    }

    // 方案三：Nitter RSS
    if (!finalTweetLink) {
        for (const node of NITTER_NODES) {
            try {
                console.log(`[Twitter監測] 正在嘗試 方案三 (Nitter: ${node})...`);
                const nitterUrl = `${node}/${TARGET_USER}/rss`;
                const res = await fetchWithTimeout(nitterUrl);

                if (!res.ok) continue;

                const xml = await res.text();
                const item = extractItemFromRss(xml);
                if (!item?.link) continue;

                finalTweetLink = normalizeTweetLink(item.link);
                finalTweetText = cleanText(item.desc || item.title || finalTweetText).slice(0, 300) || finalTweetText;
                strategyUsed = `Nitter RSS (${new URL(node).hostname})`;
                break;
            } catch (e) {
                console.warn(`[Twitter監測] Nitter 節點 ${node} 異常: ${e.message}`);
            }
        }
    }

    if (!finalTweetLink) {
        console.error('❌ [Twitter監測] 所有抓取策略均失敗，無法取得最新推文。');

        if (isManual && messageContext) {
            return messageContext.reply('❌ 目前所有監測線路（API / RSSHub / Nitter）都不可用，請稍後再試。');
        }

        return;
    }

    const uniqueId = finalTweetLink;

    if (!isManual && lastFetchedId === uniqueId) {
        return;
    }

    if (!isManual) lastFetchedId = uniqueId;

    const tweetEmbed = new EmbedBuilder()
        .setTitle('📢 Project Moon 官方 Twitter 最新情報')
        .setDescription(
            `**內文摘要：**\n${finalTweetText}\n\n` +
            `**連結：** [點擊此處查看原文](${finalTweetLink})`
        )
        .setColor(0x5865f2)
        .setFooter({ text: `來源策略：${strategyUsed || 'Unknown'}` })
        .setTimestamp(new Date());

    return sendNotification(client, tweetEmbed, isManual, messageContext);
}

module.exports = {
    checkTwitterUpdates,
};
