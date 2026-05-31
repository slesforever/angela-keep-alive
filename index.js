// ==================== 📡 系統常數與觀測設定 ====================
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_ID = '1406984068725211177';
const PING_ROLE_MENTION = `<@&${PING_ROLE_ID}>`;
const TARGET_USER = { username: 'LimbusCompany_B' };

let lastTweetId = null;
let lastSteamNewsId = null;
const activeTrades = new Map();

// ==================== 📡 X / Twitter Syndication 觀測系統 ====================
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    }).finally(() => clearTimeout(timeout));
}

function decodeHtmlEntities(text = '') {
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '&')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripHtml(html = '') {
    return decodeHtmlEntities(String(html).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegExp(text = '') {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readTimelineText(rawText = '') {
    const raw = String(rawText || '').trim();
    if (!raw) return '';

    // 先嘗試 JSON
    try {
        const json = JSON.parse(raw);
        return String(json?.body ?? raw);
    } catch (_) {}

    // 再嘗試 JSONP
    const jsonpMatch = raw.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
    if (jsonpMatch) {
        try {
            const json = JSON.parse(jsonpMatch[1]);
            return String(json?.body ?? jsonpMatch[1]);
        } catch (_) {
            return jsonpMatch[1];
        }
    }

    // 最後直接當 HTML / 純文字處理
    return raw;
}

function extractTweetIdsFromText(text = '') {
    const raw = String(text || '');
    const ids = new Set();

    for (const m of raw.matchAll(/data-tweet-id="(\d{10,25})"/g)) {
        ids.add(m[1]);
    }
    for (const m of raw.matchAll(/status\/(\d{10,25})/g)) {
        ids.add(m[1]);
    }
    for (const m of raw.matchAll(/tweet_id[=:"'](\d{10,25})/g)) {
        ids.add(m[1]);
    }
    for (const m of raw.matchAll(/"id_str"\s*:\s*"(\d{10,25})"/g)) {
        ids.add(m[1]);
    }
    for (const m of raw.matchAll(/"id"\s*:\s*"(\d{10,25})"/g)) {
        ids.add(m[1]);
    }

    return [...ids];
}

function extractMetaValues(html = '', keys = []) {
    const raw = String(html || '');
    const out = [];

    const metaTagRe = /<meta\b[^>]*>/gi;
    let m;
    while ((m = metaTagRe.exec(raw)) !== null) {
        const tag = m[0];
        const key = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1];
        const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
        if (!key || !content) continue;

        if (keys.some(k => k.toLowerCase() === key.toLowerCase())) {
            out.push(decodeHtmlEntities(content));
        }
    }

    return [...new Set(out.filter(Boolean))];
}

function collectUrlCandidates(input) {
    const results = [];
    const seenObjects = new WeakSet();

    const walk = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value)) {
                results.push({ url: value, path });
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) walk(value[i], path.concat(String(i)));
            return;
        }

        if (typeof value === 'object') {
            if (seenObjects.has(value)) return;
            seenObjects.add(value);

            for (const [k, v] of Object.entries(value)) {
                walk(v, path.concat(k));
            }
        }
    };

    walk(input);
    return results;
}

function splitMediaUrls(candidates) {
    const images = [];
    const videos = [];
    const others = [];

    for (const { url, path } of candidates) {
        const u = String(url).toLowerCase();
        const key = path.join('.').toLowerCase();

        if (/profile_images|emoji/i.test(u)) continue;

        const looksLikeVideo =
            u.includes('video.twimg.com') ||
            u.endsWith('.mp4') ||
            u.endsWith('.mov') ||
            u.endsWith('.webm') ||
            u.endsWith('.m3u8') ||
            key.includes('video') ||
            key.includes('mp4') ||
            key.includes('variant') ||
            key.includes('playback') ||
            key.includes('stream');

        const looksLikeImage =
            u.includes('pbs.twimg.com/media') ||
            u.endsWith('.jpg') ||
            u.endsWith('.jpeg') ||
            u.endsWith('.png') ||
            u.endsWith('.gif') ||
            u.endsWith('.webp') ||
            key.includes('photo') ||
            key.includes('image') ||
            key.includes('poster') ||
            key.includes('thumb') ||
            key.includes('thumbnail');

        if (looksLikeVideo) videos.push(url);
        else if (looksLikeImage) images.push(url);
        else others.push(url);
    }

    return {
        images: [...new Set(images)],
        videos: [...new Set(videos)],
        others: [...new Set(others)]
    };
}

function pickBestVideoUrl(tweet) {
    const candidates = [];

    const addCandidate = (url, bitrate = 0) => {
        if (!url || !/^https?:\/\//i.test(url)) return;
        if (!/video\.twimg\.com/i.test(url) && !/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(url)) return;
        candidates.push({ url, bitrate: Number(bitrate) || 0 });
    };

    const scan = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            const pathStr = path.join('.').toLowerCase();
            if (/(video|variant|mp4|playback|stream)/i.test(pathStr)) {
                addCandidate(value, 0);
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) scan(value[i], path.concat(String(i)));
            return;
        }

        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                const nextPath = path.concat(k);
                const pathStr = nextPath.join('.').toLowerCase();

                if (k === 'url' && typeof v === 'string' && /(video|variant|playback|stream)/i.test(pathStr)) {
                    addCandidate(v, value?.bitrate || 0);
                } else if (k === 'variants' && Array.isArray(v)) {
                    for (const item of v) {
                        if (item?.url) addCandidate(item.url, item?.bitrate || 0);
                    }
                } else {
                    scan(v, nextPath);
                }
            }
        }
    };

    scan(tweet);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.bitrate - a.bitrate);
    return candidates[0].url;
}

function extractTweetMedia(tweet) {
    const rawCandidates = [];

    const walk = (value, path = []) => {
        if (value == null) return;

        if (typeof value === 'string') {
            if (/^https?:\/\//i.test(value)) {
                const pathStr = path.join('.').toLowerCase();
                if (/(photo|photos|media|mediadetails|video|variant|thumb|thumbnail|poster|preview|image|card|gallery)/i.test(pathStr)) {
                    rawCandidates.push({ url: value, path });
                }
            }
            return;
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) walk(value[i], path.concat(String(i)));
            return;
        }

        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                walk(v, path.concat(k));
            }
        }
    };

    walk(tweet);

    const { images, videos } = splitMediaUrls(rawCandidates);
    const bestVideo = pickBestVideoUrl(tweet);
    if (bestVideo && !videos.includes(bestVideo)) videos.unshift(bestVideo);

    return {
        images: images.filter(u => !/profile_images|emoji/i.test(u)),
        videos: videos.filter(u => !/profile_images|emoji/i.test(u))
    };
}

async function fetchTwitterTimelineProfile(screenName) {
    const attempts = [
        `https://syndication.twitter.com/timeline/profile?screen_name=${encodeURIComponent(screenName)}&lang=zh-hant&dnt=false&callback=__twttrf.callback&rnd=${Math.random()}`,
        `https://syndication.twitter.com/timeline/profile?screen_name=${encodeURIComponent(screenName)}&lang=en&dnt=false&callback=__twttrf.callback&rnd=${Math.random()}`
    ];

    let lastError = null;

    for (const url of attempts) {
        try {
            const response = await fetchWithTimeout(url, {}, 10000);
            if (!response.ok) {
                lastError = new Error(`timeline/profile HTTP ${response.status}`);
                continue;
            }

            const text = await response.text();
            const body = readTimelineText(text);
            const tweetIds = extractTweetIdsFromText(body);

            return {
                raw: text,
                body,
                tweetIds
            };
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('timeline/profile 失敗');
}

async function fetchTweetResult(tweetId) {
    const attempts = [
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh`,
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en`,
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=zh&token=!`
    ];

    let lastError = null;

    for (const url of attempts) {
        try {
            const response = await fetchWithTimeout(url, {}, 10000);
            if (!response.ok) {
                lastError = new Error(`tweet-result HTTP ${response.status}`);
                continue;
            }
            return await response.json();
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('tweet-result 失敗');
}

async function fetchTweetHtml(tweetUrl) {
    const response = await fetchWithTimeout(tweetUrl, {}, 10000);
    if (!response.ok) {
        throw new Error(`tweet page HTTP ${response.status}`);
    }
    return await response.text();
}

function buildTwitterPayloadFromTweetResult(tweet) {
    const tweetId = tweet?.id_str || tweet?.id || '';
    const screenName = tweet?.user?.screen_name || TARGET_USER.username;
    const authorName = tweet?.user?.name || screenName;
    const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

    const rawText =
        tweet?.full_text ||
        tweet?.text ||
        tweet?.legacy?.full_text ||
        tweet?.legacy?.text ||
        tweet?.body ||
        '';

    const text = stripHtml(rawText);
    const { images, videos } = extractTweetMedia(tweet);

    const mainEmbed = new EmbedBuilder()
        .setTitle(`🐦 ${authorName} 發布新推文`)
        .setURL(tweetUrl)
        .setColor(0x1DA1F2)
        .setTimestamp(tweet?.created_at ? new Date(tweet.created_at) : new Date());

    if (text) {
        mainEmbed.setDescription(text.slice(0, 4000));
    } else {
        mainEmbed.setDescription('（沒有文字內容）');
    }

    if (images[0]) {
        mainEmbed.setImage(images[0]);
    }

    const fields = [];

    if (images.length > 1) {
        fields.push({
            name: '📷 其他圖片',
            value: images.slice(1, 5).map((u, i) => `[圖片 ${i + 2}](${u})`).join('\n')
        });
    }

    if (videos.length > 0) {
        fields.push({
            name: '🎬 影片',
            value: videos.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')
        });
    }

    if (fields.length > 0) {
        mainEmbed.addFields(fields);
    }

    const embeds = [mainEmbed];

    for (const img of images.slice(1, 5)) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setImage(img)
        );
    }

    if (videos.length > 0) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setDescription(`🎬 影片連結：\n${videos.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')}`)
        );
    }

    return {
        content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}`,
        embeds,
        allowedMentions: { roles: [PING_ROLE_ID] }
    };
}

function buildTwitterPayloadFromHtml(html, tweetUrl, fallbackTitle = '最新推文') {
    const titleValues = extractMetaValues(html, ['og:title', 'twitter:title']);
    const descValues = extractMetaValues(html, ['og:description', 'twitter:description']);
    const imageValues = extractMetaValues(html, ['og:image', 'twitter:image']);
    const videoValues = extractMetaValues(html, ['og:video', 'og:video:url', 'twitter:player:stream']);

    const title = titleValues[0] || fallbackTitle;
    const desc = descValues[0] || '（無法直接讀取文字內容）';

    const embed = new EmbedBuilder()
        .setTitle(`🐦 ${title}`)
        .setURL(tweetUrl)
        .setColor(0x1DA1F2)
        .setTimestamp();

    if (desc) embed.setDescription(stripHtml(desc).slice(0, 4000));
    if (imageValues[0]) embed.setImage(imageValues[0]);

    const fields = [];
    if (imageValues.length > 1) {
        fields.push({
            name: '📷 其他圖片',
            value: imageValues.slice(1, 5).map((u, i) => `[圖片 ${i + 2}](${u})`).join('\n')
        });
    }
    if (videoValues.length > 0) {
        fields.push({
            name: '🎬 影片',
            value: videoValues.slice(0, 5).map((u, i) => `[影片 ${i + 1}](${u})`).join('\n')
        });
    }
    if (fields.length > 0) embed.addFields(fields);

    const embeds = [embed];

    for (const img of imageValues.slice(1, 5)) {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x1DA1F2)
                .setURL(tweetUrl)
                .setImage(img)
        );
    }

    return {
        content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}`,
        embeds,
        allowedMentions: { roles: [PING_ROLE_ID] }
    };
}

async function deliverTwitterTweetById(tweetId, manual = false, interaction = null) {
    const tweetUrl = `https://x.com/${TARGET_USER.username}/status/${tweetId}`;

    // 1) 先試 tweet-result
    try {
        const tweet = await fetchTweetResult(tweetId);
        const payload = buildTwitterPayloadFromTweetResult(tweet);

        if (manual && interaction) {
            await interaction.reply(payload).catch(() => {});
        } else {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
            if (channel) await channel.send(payload).catch(() => {});
        }
        return;
    } catch (e1) {
        console.error('⚠️ tweet-result 失敗，改抓 X 內頁 HTML：', e1?.message || e1);
    }

    // 2) 再試 X 內頁 HTML
    try {
        const html = await fetchTweetHtml(tweetUrl);
        const payload = buildTwitterPayloadFromHtml(html, tweetUrl, '最新推文');

        if (manual && interaction) {
            await interaction.reply(payload).catch(() => {});
        } else {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
            if (channel) await channel.send(payload).catch(() => {});
        }
        return;
    } catch (e2) {
        console.error('⚠️ X HTML 也失敗：', e2?.message || e2);

        const fallback = {
            content: `🔔 ${PING_ROLE_MENTION}\n${tweetUrl}\n（內容抓取失敗，只能先丟連結）`,
            allowedMentions: { roles: [PING_ROLE_ID] }
        };

        if (manual && interaction) {
            await interaction.reply(fallback).catch(() => {});
        } else {
            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
            if (channel) await channel.send(fallback).catch(() => {});
        }
    }
}

async function checkTwitterUpdates(manual = false, interaction = null) {
    try {
        const timeline = await fetchTwitterTimelineProfile(TARGET_USER.username);
        const latestTweetId = timeline.tweetIds?.[0];

        if (!latestTweetId) {
            if (manual && interaction) {
                await interaction.reply('❌ 沒抓到任何推文 ID。').catch(() => {});
            }
            return;
        }

        // 第一次跑先鎖定基線
        if (lastTweetId === null) {
            lastTweetId = latestTweetId;
            if (!manual) {
                console.log(`📡 [觀測系統] X/Syndication 初始基線鎖定成功，最新 ID: ${latestTweetId}`);
                return;
            }
        }

        // 手動測試：直接回傳最新一則
        if (manual) {
            await deliverTwitterTweetById(latestTweetId, true, interaction);
            return;
        }

        // 自動輪詢：只有新 ID 才推送
        if (latestTweetId !== lastTweetId) {
            lastTweetId = latestTweetId;
            await deliverTwitterTweetById(latestTweetId, false, null);
        }
    } catch (e) {
        console.error('❌ [X/Syndication] 觀測失敗：', e?.message || e);

        if (manual && interaction) {
            await interaction.reply(`❌ **X/Syndication 觀測失敗**\n\`${e?.message || e}\``).catch(() => {});
        }
    }
}

// ==================== 🚂 Steam 觀測系統 ====================
async function checkSteamUpdates(manual = false, interaction = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=1');
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];

        if (newsItem) {
            if (lastSteamNewsId === null) {
                lastSteamNewsId = newsItem.gid;
                if (!manual) {
                    console.log(`🚂 [觀測系統] Steam 新聞初始基線鎖定成功，當前最新 ID: ${newsItem.gid}`);
                    return;
                }
            }

            if (newsItem.gid !== lastSteamNewsId || manual) {
                if (!manual) lastSteamNewsId = newsItem.gid;

                const embed = new EmbedBuilder()
                    .setTitle(`🚂 [Steam新聞] ${newsItem.title}`)
                    .setURL(newsItem.url)
                    .setColor(0x00A8E8)
                    .setTimestamp();

                if (manual && interaction) {
                    await interaction.reply({ embeds: [embed] }).catch(() => {});
                } else {
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                    if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION}`, embeds: [embed] }).catch(() => {});
                }
            } else {
                if (manual && interaction) await interaction.reply('✅ 目前無新公告。').catch(() => {});
            }
        }
    } catch (e) {
        if (manual && interaction) await interaction.reply('❌ **Steam API 錯誤**').catch(() => {});
    }
}

async function performSystemChecks() {
    await checkTwitterUpdates();
    await checkSteamUpdates();
}
