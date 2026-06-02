// Functions/Newscheck.js
const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TARGET_USER = { username: 'LimbusCompany_B' };
const NITTER_NODES = ['https://nitter.net', 'https://nitter.poast.org', 'https://nitter.cz'];
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

let lastFetchedId = null;
let lastSteamNewsId = null;

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function checkSteamUpdates(client, isManual = false, messageContext = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1');
        if (!response.ok) return;
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) return;

        if (!lastSteamNewsId && !isManual) {
            lastSteamNewsId = newsItem.gid;
            return;
        }

        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if (!isManual) lastSteamNewsId = newsItem.gid;
            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 300) + '...';
            const embed = new EmbedBuilder()
                .setTitle(`📢 Steam 官方變更：${newsItem.title}`)
                .setURL(newsItem.url)
                .setDescription(cleanContent)
                .setColor(0x1a3a6c)
                .setTimestamp();

            if (isManual && messageContext) {
                await messageContext.reply({ content: `🔔 手動同步成功！`, embeds: [embed] });
            } else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} Steam 新聞發布！`, embeds: [embed] });
            }
        }
    } catch (err) { console.warn(err.message); }
}

async function checkTwitterUpdates(client, isManual = false, messageContext = null) {
    for (const nodeUrl of NITTER_NODES) {
        try {
            const response = await fetchWithTimeout(`${nodeUrl}/${TARGET_USER.username}/rss`);
            if (!response.ok) continue;
            const text = await response.text();
            const itemMatch = text.match(/<item>[\s\S]*?<\/item>/);
            if (!itemMatch) continue;
            
            const guid = itemMatch[0].match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim();
            const link = itemMatch[0].match(/<link>(.*?)<\/link>/)?.[1]?.trim().replace('http://', 'https://');
            
            if (!guid || !link) continue;

            if (!lastFetchedId && !isManual) {
                lastFetchedId = guid;
                break;
            }

            if (guid !== lastFetchedId || isManual) {
                if (!isManual) lastFetchedId = guid;
                const vxtwitterLink = link.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');
                
                if (isManual && messageContext) {
                    await messageContext.reply({ content: `🔔 推特手動測試成功：\n${vxtwitterLink}` });
                } else {
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} 收到最新訊息：\n${vxtwitterLink}` });
                }
            }
            break;
        } catch (e) { console.warn(e.message); }
    }
}

function startNewsCheckLoop(client) {
    checkTwitterUpdates(client);
    checkSteamUpdates(client);
    setInterval(() => {
        checkTwitterUpdates(client);
        checkSteamUpdates(client);
    }, 60 * 1000);
}

module.exports = { checkSteamUpdates, checkTwitterUpdates, startNewsCheckLoop };
