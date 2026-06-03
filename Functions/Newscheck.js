// Functions/Newscheck.js
// Twitter Nitter RSS + Steam 官方新聞 API（完全仿照參考腳本方法）
const { EmbedBuilder } = require('discord.js');

// 與參考腳本完全相同的 fetch 模式（node-fetch 動態 import）
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TARGET_USER     = process.env.TARGET_USER        || 'LimbusCompany_B';
const NOTIFY_CHANNEL  = process.env.NOTIFY_CHANNEL_ID  || '1402282604165730348';
const PING_ROLE       = process.env.PING_ROLE_MENTION  || '<@&1406984068725211177>';
const STEAM_APP_ID    = '1973530';
const CHECK_INTERVAL  = 60 * 1000;

// Nitter 備援節點（更多選擇）
const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz',
    'https://nitter.privacydev.net',
    'https://nitter.1d4.us',
    'https://nitter.fdn.fr',
];

let lastFetchedId   = null;
let lastSteamNewsId = null;
let loopTimer       = null;

// ── 完全仿照參考腳本的 fetchWithTimeout ───────────────────────
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

// ── 完全仿照參考腳本的 RSS 解析 ───────────────────────────────
function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;
    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];
    if (!link || !guid) return null;
    return {
        link: link.trim().replace('http://', 'https://'),
        id:   guid.trim()
    };
}

// ── 完全仿照參考腳本的節點抓取 ───────────────────────────────
async function fetchLatestTweetFromNode(nodeUrl) {
    const url = `${nodeUrl}/${TARGET_USER}/rss`;
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    const text = await response.text();
    const data = parseLatestItem(text);
    if (!data) throw new Error('RSS 解析失敗');
    const cleanLink = data.link.split('#')[0];
    return {
        id:   data.id,
        link: cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com')
    };
}

// ── Twitter 監測（完全仿照參考腳本邏輯）─────────────────────
async function checkTwitterUpdates(client, isManual = false, messageContext = null) {
    if (!isManual) {
        console.log(`⏳ Angela 正在發射高速觀測脈衝，檢查官方 @${TARGET_USER} 的動態...`);
    }

    let fetchSuccess = false;
    for (const nodeUrl of NITTER_NODES) {
        try {
            const data = await fetchLatestTweetFromNode(nodeUrl);

            // 首次啟動只建立快取，不通知
            if (!lastFetchedId && !isManual) {
                lastFetchedId = data.id;
                console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER} 的初始推文快取：${data.id}`);
                fetchSuccess = true;
                break;
            }

            if (data.id !== lastFetchedId || isManual) {
                if (!isManual) lastFetchedId = data.id;

                if (isManual && messageContext) {
                    await messageContext.reply({
                        content: `🔔 ${PING_ROLE} **[推特手動測試成功]** 收到來自 Project Moon 的最新訊息：\n${data.link}`,
                        allowedMentions: { parse: ['roles'] }
                    });
                } else {
                    try {
                        const channel = await client.channels.fetch(NOTIFY_CHANNEL);
                        if (channel) {
                            await channel.send({
                                content: `🔔 ${PING_ROLE} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`,
                                allowedMentions: { parse: ['roles'] }
                            });
                        }
                    } catch (e) {
                        console.error(`[Twitter] 發送訊息失敗：${e.message}`);
                    }
                }
            }
            fetchSuccess = true;
            break;
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})`);
        }
    }

    if (isManual && !fetchSuccess && messageContext) {
        await messageContext.reply('❌ **報告主管，當前所有備援節點暫時連線超時，無法完成手動擷取。**\n_提示：Nitter 節點可能被封鎖，請稍後再試。_');
    }
}

// ── Steam 官方新聞 API（仿照參考腳本）────────────────────────
async function checkSteamUpdates(client, isManual = false, messageContext = null) {
    try {
        const response = await fetchWithTimeout(
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP_ID}&count=1`
        );
        if (!response.ok) {
            if (isManual && messageContext) await messageContext.reply(`❌ Steam API 回應異常，狀態碼: ${response.status}`);
            return;
        }
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) {
            if (isManual && messageContext) await messageContext.reply('❌ 未能獲取到 Steam 任何有效公告。');
            return;
        }

        // 首次啟動只建立快取
        if (!lastSteamNewsId && !isManual) {
            lastSteamNewsId = newsItem.gid;
            console.log(`📦 [Steam News] 成功建立初始公告快取識別碼：${newsItem.gid}`);
            return;
        }

        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if (!isManual) lastSteamNewsId = newsItem.gid;

            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, '').substring(0, 450) + '...';
            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company Steam 官方發布重大變更${isManual ? ' (手動測試)' : ''}`)
                .setURL(newsItem.url)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${newsItem.gid}` })
                .setTimestamp();

            if (isManual && messageContext) {
                await messageContext.reply({
                    content: `🔔 ${PING_ROLE} **管理員發動手動測試，成功同步最新 Steam 觀測節點！**`,
                    embeds: [steamEmbed],
                    allowedMentions: { parse: ['roles'] }
                });
            } else {
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
            }
        }
    } catch (err) {
        console.warn(`⚠️ Steam 公告同步故障 (${err.message})`);
        if (isManual && messageContext) await messageContext.reply(`❌ 系統執行 Steam 協定中斷：${err.message}`);
    }
}

// ── 啟動定時循環 ─────────────────────────────────────────────
function startNewsCheckLoop(client) {
    if (loopTimer) clearInterval(loopTimer);

    // 立即執行一次（建立初始快取）
    checkTwitterUpdates(client, false, null);
    checkSteamUpdates(client, false, null);

    loopTimer = setInterval(() => {
        checkTwitterUpdates(client, false, null);
        checkSteamUpdates(client, false, null);
    }, CHECK_INTERVAL);

    console.log(`✅ [Newscheck] 監測循環啟動，間隔 ${CHECK_INTERVAL / 1000}s`);
}

module.exports = { checkTwitterUpdates, checkSteamUpdates, startNewsCheckLoop };
