// Functions/Newscheck.js
const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TARGET_USER = 'LimbusCompany_B';
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

// 備援用的 RSSHub 及 Nitter 節點群
const RSSHUB_NODES = ['https://rsshub.app', 'https://rsshub.moeyy.cn', 'https://rsshub.rssforever.com'];
const NITTER_NODES = ['https://nitter.net', 'https://nitter.poast.org', 'https://nitter.cz', 'https://nitter.privacydev.net'];

let lastFetchedId = null;
let lastSteamNewsId = null;

// 帶有超時控制的 Fetch
function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

/**
 * 核心大改版：具備多重備援機制的 Twitter 觀測核心
 */
async function checkTwitterUpdates(client, isManual = false, messageContext = null) {
    let finalTweetLink = null;
    let finalTweetText = "點擊下方連結檢視最新公告內容";
    let strategyUsed = "";

    // ----------------------------------------------------
    // 【方案一：API 降維打擊】利用 VxTwitter API 獲取高結構 JSON (最推)
    // ----------------------------------------------------
    try {
        console.log(`[Twitter監測] 正在嘗試 方案一 (VxTwitter API)...`);
        const vxUrl = `https://api.vxtwitter.com/${TARGET_USER}`;
        const res = await fetchWithTimeout(vxUrl);
        
        if (res.ok) {
            const data = await res.json();
            // 抓取最新的一則推文
            const latestTweet = data?.tweets?.[0] || data?.[0]; 
            if (latestTweet && latestTweet.id) {
                finalTweetLink = `https://vxtwitter.com/${TARGET_USER}/status/${latestTweet.id}`;
                if (latestTweet.text) finalTweetText = latestTweet.text.substring(0, 300);
                strategyUsed = "VxTwitter JSON API";
            }
        }
    } catch (e) {
        console.warn(`[Twitter監測] 方案一失敗: ${e.message}，正切換至備援方案...`);
    }

    // ----------------------------------------------------
    // 【方案二：RSSHub 陣線】若方案一失敗，利用 RSSHub 公共節點讀取
    // ----------------------------------------------------
    if (!finalTweetLink) {
        for (const node of RSSHUB_NODES) {
            try {
                console.log(`[Twitter監測] 正在嘗試 方案二 (RSSHub 節點: ${node})...`);
                const rssHubUrl = `${node}/twitter/user/${TARGET_USER}`;
                const res = await fetchWithTimeout(rssHubUrl);
                if (!res.ok) continue;
                
                const text = await res.text();
                const itemMatch = text.match(/<item>[\s\S]*?<\/item>/);
                if (!itemMatch) continue;

                const link = itemMatch[0].match(/<link>(.*?)<\/link>/)?.[1]?.trim();
                const title = itemMatch[0].match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] || itemMatch[0].match(/<title>(.*?)<\/title>/)?.[1];
                
                if (link) {
                    finalTweetLink = link.replace('http://', 'https://').replace(/twitter\.com|x\.com/, 'vxtwitter.com');
                    if (title) finalTweetText = title.replace(/<!\[CDATA\[|\]\]>/g, "").substring(0, 300);
                    strategyUsed = `RSSHub (${new URL(node).hostname})`;
                    break;
                }
            } catch (e) {
                console.warn(`[Twitter監測] RSSHub 節點 ${node} 異常: ${e.message}`);
            }
        }
    }

    // ----------------------------------------------------
    // 【方案三：Nitter 傳統陣線】最後的防線，遍歷 Nitter 的 RSS 串流
    // ----------------------------------------------------
    if (!finalTweetLink) {
        for (const node of NITTER_NODES) {
            try {
                console.log(`[Twitter監測] 正在嘗試 方案三 (Nitter 節點: ${node})...`);
                const nitterUrl = `${node}/${TARGET_USER}/rss`;
                const res = await fetchWithTimeout(nitterUrl);
                if (!res.ok) continue;

                const text = await res.text();
                const itemMatch = text.match(/<item>[\s\S]*?<\/item>/);
                if (!itemMatch) continue;

                const link = itemMatch[0].match(/<link>(.*?)<\/link>/)?.[1]?.trim();
                const desc = itemMatch[0].match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] || itemMatch[0].match(/<description>(.*?)<\/description>/)?.[1];
                
                if (link) {
                    finalTweetLink = link.replace('http://', 'https://').replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');
                    if (desc) finalTweetText = desc.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 300);
                    strategyUsed = `Nitter RSS (${new URL(node).hostname})`;
                    break;
                }
            } catch (e) {
                console.warn(`[Twitter監測] Nitter 節點 ${node} 異常: ${e.message}`);
            }
        }
    }

    // =================【 成果結算與發送機制 】=================
    if (!finalTweetLink) {
        console.error("❌ [Twitter監測] 所有抓取策略均告失敗，無法連線至 Twitter 鏡像群。");
        if (isManual && messageContext) {
            return await messageContext.reply("❌ 報告主管，目前所有監測線路（API/RSSHub/Nitter）均被 Twitter 核心防火牆封鎖，請稍後再試。");
        }
        return;
    }

    // 使用推文網址或唯一識別碼作為去重指標
    const uniqueId = finalTweetLink;

    // 如果是自動循環輪詢，且發現跟上一次抓到的一模一樣，就安靜退出
    if (!isManual && lastFetchedId === uniqueId) {
        return; 
    }

    // 更新最新快取快
    if (!isManual) lastFetchedId = uniqueId;

    // 建立通知 Embed
    const tweetEmbed = new EmbedBuilder()
        .setTitle(`📢 Project Moon 官方 Twitter 最新情報連線`)
        .setDescription(`### 📝 內文摘要：\n${finalTweetText}...\n\n🔗 **[點擊此處查閱高畫質推特完整內容](${finalTweetLink})**`)
        .setColor(
