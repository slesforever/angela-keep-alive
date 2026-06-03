// Functions/Newscheck.js — 新聞監測（Twitter Nitter RSS + Steam官方API）
const { EmbedBuilder } = require('discord.js');

const fetchImpl =
    typeof global.fetch === 'function'
        ? global.fetch.bind(global)
        : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const TARGET_USER    = process.env.TARGET_USER        || 'LimbusCompany_B';
const NOTIFY_CHANNEL = process.env.NOTIFY_CHANNEL_ID  || '1402282604165730348';
const PING_ROLE      = process.env.PING_ROLE_MENTION  || '<@&1406984068725211177>';
const STEAM_APP_ID   = '1973530';
const CHECK_INTERVAL = 60 * 1000;

// ── Nitter 備援節點（依優先順序嘗試）──────────────────────────
const NITTER_NODES = [
    'https://nitter.poast.org',
    'https://nitter.cz',
    'https://nitter.net',
    'https://nitter.1d4.us',
    'https://nitter.privacydev.net',
];

let lastTweetId   = null;
let lastSteamId   = null;
let loopTimer     = null;

// ─── 工具 ─────────────────────────────────────────────────────
function fetchWithTimeout(url, options = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetchImpl(url, {
        ...options,
        signal: ctrl.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ...(options.headers || {}),
        },
    }).finally(() => clearTimeout(t));
}

// ── 解析 RSS XML 第一個 <item> ─────────────────────────────────
function parseLatestItem(xml) {
    const m = xml.match(/<item>([\s\S]*?)<\/item>/);
    if (!m) return null;
    const item = m[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1]?.trim();
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim();
    if (!link || !guid) return null;
    return {
        id:   guid,
        link: link.replace(/^http:\/\//, 'https://')
                  .replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com')
                  .split('#')[0],
    };
}

async function fetchFromNitterNode(nodeUrl) {
    const res = await fetchWithTimeout(`${nodeUrl}/${TARGET_USER}/rss`, {}, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseLatestItem(await res.text());
    if (!data?.link) throw new Error('RSS 解析失敗');
    return data;
}

// ─── Twitter 監測 ─────────────────────────────────────────────
async function checkTwitterUpdates(client, isManual = false, ctx = null) {
    if (!isManual) console.log(`⏳ [Twitter] 正在掃描 @${TARGET_USER}...`);

    let data = null;
    let usedNode = null;

    for (const node of NITTER_NODES) {
        try {
            data = await fetchFromNitterNode(node);
            usedNode = node;
            break;
        } catch (e) {
            console.warn(`⚠️ [Twitter] 節點 ${node} 失敗：${e.message}`);
        }
    }

    if (!data) {
        console.error('❌ [Twitter] 所有節點均不可用。');
        if (isManual && ctx) return ctx.reply('❌ 報告主管，當前所有備援節點暫時連線超時，無法完成擷取。');
        return;
    }

    // 初次啟動時只快取 ID，不通知
    if (!lastTweetId && !isManual) {
        lastTweetId = data.id;
        console.log(`📦 [Twitter] 初始快取建立：${data.id} (節點：${usedNode})`);
        return;
    }

    if (!isManual && data.id === lastTweetId) return; // 無新推文
    if (!isManual) lastTweetId = data.id;

    const content = `🔔 ${PING_ROLE} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`;

    if (isManual && ctx) {
        return ctx.reply({ content: `🔔 ${PING_ROLE} **[手動測試成功]** 最新訊息：\n${data.link}`, allowedMentions: { parse: ['roles'] } });
    }

    try {
        const ch = client.channels.cache.get(NOTIFY_CHANNEL) || await client.channels.fetch(NOTIFY_CHANNEL);
        await ch.send({ content, allowedMentions: { parse: ['roles'] } });
    } catch (e) {
        console.error(`[Twitter] 發送失敗：${e.message}`);
    }
}

// ─── Steam 監測（使用官方 API，比 store events 更穩定）────────
async function checkSteamUpdates(client, isManual = false, ctx = null) {
    try {
        const res = await fetchWithTimeout(
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&count=1&format=json`,
            {}, 10000
        );
        if (!res.ok) {
            if (isManual && ctx) return ctx.reply(`❌ Steam API 回應異常，狀態碼：${res.status}`);
            return;
        }

        const newsItem = (await res.json())?.appnews?.newsitems?.[0];
        if (!newsItem) {
            if (isManual && ctx) return ctx.reply('❌ 未能獲取到 Steam 任何有效公告。');
            return;
        }

        // 初次啟動只快取
        if (!lastSteamId && !isManual) {
            lastSteamId = newsItem.gid;
            console.log(`📦 [Steam] 初始快取建立：${newsItem.gid}`);
            return;
        }

        if (!isManual && newsItem.gid === lastSteamId) return;
        if (!isManual) lastSteamId = newsItem.gid;

        const clean = (s = '') => s.replace(/<\/?[^>]+(>|$)/g, '').replace(/\s+/g, ' ').trim().slice(0, 450);
        const embed = new EmbedBuilder()
            .setTitle(`📢 Limbus Company Steam 官方公告${isManual ? '（手動測試）' : ''}`)
            .setURL(newsItem.url)
            .setDescription(`### **${newsItem.title}**\n\n${clean(newsItem.contents)}...`)
            .setColor(0x1a3a6c)
            .setFooter({ text: `來源：Steam 官方新聞中心 | ID：${newsItem.gid}` })
            .setTimestamp();

        if (isManual && ctx) {
            return ctx.reply({
                content: `🔔 ${PING_ROLE} **管理員發動手動測試，成功同步最新 Steam 節點！**`,
                embeds: [embed],
                allowedMentions: { parse: ['roles'] },
            });
        }

        const ch = client.channels.cache.get(NOTIFY_CHANNEL) || await client.channels.fetch(NOTIFY_CHANNEL);
        await ch.send({
            content: `🔔 ${PING_ROLE} **監測到邊獄巴士有全新 Steam 公告發布！**`,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] },
        });
    } catch (e) {
        console.warn(`⚠️ [Steam] 失敗：${e.message}`);
        if (isManual && ctx) return ctx.reply(`❌ Steam 協定中斷：${e.message}`);
    }
}

// ─── 啟動定時循環 ─────────────────────────────────────────────
function startNewsCheckLoop(client) {
    if (loopTimer) clearInterval(loopTimer);

    // 立即執行一次（建立初始快取）
    checkTwitterUpdates(client).catch(e => console.error('[Newscheck] 初次Twitter:', e.message));
    checkSteamUpdates(client).catch(e => console.error('[Newscheck] 初次Steam:', e.message));

    loopTimer = setInterval(() => {
        checkTwitterUpdates(client).catch(e => console.error('[Newscheck] Twitter:', e.message));
        checkSteamUpdates(client).catch(e => console.error('[Newscheck] Steam:', e.message));
    }, CHECK_INTERVAL);

    console.log(`✅ [Newscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = { checkTwitterUpdates, checkSteamUpdates, startNewsCheckLoop };
