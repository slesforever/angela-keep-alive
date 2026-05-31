const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const identitiesData = require('./identitiesData.js');

const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = new Date();
let totalTweetsChecked = 0;
let globalRewardMultiplier = 1.0; // 關卡獎勵倍率設定

const TARGET_USER = {
    username: 'LimbusCompany_B',
    displayName: '邊獄公司 (Limbus Company) 官方最新公告'
};

const NITTER_NODES = [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.cz'
];

let lastFetchedId = null;
let lastSteamNewsId = null;

const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';
const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';

const ADMIN_ID = 'sles_forever'; // 限制的管理員帳號名稱或ID描述
const OWNER_ID = '1330463890122735642'; // 最高管理員 Discord User ID

// ----------------- 資料庫存檔系統 -----------------
const DB_FILE = path.join(__dirname, 'players.json');

function loadPlayerData() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf8');
        return {};
    }
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("讀取存檔失敗，啟用防崩潰空資料結構:", e);
        return {};
    }
}

function savePlayerData(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("寫入存檔失敗:", e);
    }
}

function checkAndRegisterPlayer(db, userId, username) {
    if (!db[userId]) {
        const baseZeroIdentities = identitiesData.identities['0'] || [];
        db[userId] = {
            username: username,
            lunacy: 1300, 
            identities: [...baseZeroIdentities],
            egos: [],
            team: baseZeroIdentities.slice(0, 7), 
            equipped: baseZeroIdentities[0] || null,
            level: 1,
            exp: 0,
            thread: 0,
            stageProgress: 1
        };
        savePlayerData(db);
        return true;
    }
    if (db[userId].level === undefined) db[userId].level = 1;
    if (db[userId].exp === undefined) db[userId].exp = 0;
    if (db[userId].thread === undefined) db[userId].thread = 0;
    if (!db[userId].team) db[userId].team = [];
    if (!db[userId].egos) db[userId].egos = [];
    return false;
}

function calculateIdentityStats(name, rarity) {
    let hp = 130, atk = 14, def = 11, speed = 4, clashPower = 8, coinPower = 2;
    
    if (rarity === '00') { hp = 160; atk = 16; def = 13; speed = 5; clashPower = 10; coinPower = 3; }
    if (rarity === '000') { hp = 195; atk = 19; def = 14; speed = 6; clashPower = 12; coinPower = 4; }
    if (rarity === '0000') { hp = 230; atk = 23; def = 16; speed = 6; clashPower = 14; coinPower = 5; }
    if (rarity === 'Special') { hp = 260; atk = 25; def = 18; speed = 7; clashPower = 15; coinPower = 5; }
    if (rarity === 'Color Fixer') { hp = 310; atk = 32; def = 22; speed = 8; clashPower = 18; coinPower = 6; }
    if (rarity === 'Egos') { hp = 200; atk = 22; def = 15; speed = 5; clashPower = 16; coinPower = 4; }

    return { name, rarity, hp, maxHp: hp, atk, def, speed, sanity: 0, clashPower, coinPower, coins: 3 };
}

// ----------------- 扭蛋概率與保底計算 -----------------
const BASE_RATES = {
    'Color Fixer': 0.0000143,
    'Special': 0.001,
    '0000': 0.001,
    'Egos': 0.013,
    '000': 0.029,
    '00': 0.12,
    '0': 0.8359857
};

function rollRarity(isGuaranteed = false) {
    const rand = Math.random();
    if (isGuaranteed) {
        const totalPremiumWeight = 0.12 + 0.029 + 0.013 + 0.001 + 0.001 + 0.0000143; 
        const scaledRand = rand * totalPremiumWeight;

        if (scaledRand < 0.0000143) return 'Color Fixer';
        if (scaledRand < 0.0010143) return 'Special';
        if (scaledRand < 0.0020143) return '0000';
        if (scaledRand < 0.0150143) return 'Egos';
        if (scaledRand < 0.0440143) return '000';
        return '00';
    } else {
        if (rand < 0.0000143) return 'Color Fixer';
        if (rand < 0.0010143) return 'Special';
        if (rand < 0.0020143) return '0000';
        if (rand < 0.0150143) return 'Egos';
        if (rand < 0.0440143) return '000';
        if (rand < 0.1640143) return '00';
        return '0';
    }
}

const rateUpSource = identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {};
const RATE_UP_WEIGHT_MULTIPLIER = 5; // 設置 Rate Up 角色在池內的加權倍率

function normalizeRateUpList(rarity) {
    const value = rateUpSource[rarity];
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') {
        if (Array.isArray(value.names)) return value.names.filter(Boolean);
        if (Array.isArray(value.ids)) return value.ids.filter(Boolean);
        if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
    }
    return [];
}

const pullIdentity = typeof identitiesData.pullIdentity === 'function'
    ? identitiesData.pullIdentity
    : (rarity) => {
        const pool = identitiesData.identities[rarity] || [];
        if (!pool.length) return `（缺少實體角色資料：${rarity}）`;
        
        const upList = normalizeRateUpList(rarity);
        if (!upList.length) return pool[Math.floor(Math.random() * pool.length)];

        let weightedPool = [];
        pool.forEach(name => {
            const weight = upList.includes(name) ? RATE_UP_WEIGHT_MULTIPLIER : 1;
            for (let i = 0; i < weight; i++) {
                weightedPool.push(name);
            }
        });
        return weightedPool[Math.floor(Math.random() * weightedPool.length)];
    };

function rarityToStars(rarity) {
    if (rarity === 'Color Fixer') return '👑 Color Fixer';
    if (rarity === 'Special') return '🌀 Special';
    if (rarity === '0000') return '✨ ★★★★';
    if (rarity === 'Egos') return '🔮 E.G.O';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

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

function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;
    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];
    if (!link || !guid) return null;
    return { link: link.trim().replace('http://', 'https://'), id: guid.trim() };
}

async function fetchLatestTweetFromNode(nodeUrl) {
    const url = `${nodeUrl}/${TARGET_USER.username}/rss`;
    const response = await fetchWithTimeout(url, {}, 8000);
    if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    const text = await response.text();
    const data = parseLatestItem(text);
    if (!data) throw new Error('RSS 解析失敗');
    const cleanLink = data.link.split('#')[0];
    return { id: data.id, link: cleanLink.replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com') };
}

// ----------------- Steam 公告追蹤 -----------------
async function checkSteamUpdates(isManual = false, messageContext = null) {
    try {
        const response = await fetchWithTimeout(
            'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1'
        );
        if (!response.ok) {
            if (isManual && messageContext) messageContext.reply(`❌ Steam API 回應異常，狀態碼: ${response.status}`);
            return;
        }
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) {
            if (isManual && messageContext) messageContext.reply('❌ 未能獲取到 Steam 任何有效公告。');
            return;
        }

        if (!lastSteamNewsId && !isManual) {
            lastSteamNewsId = newsItem.gid;
            console.log(`📦 [Steam News] 成功建立初始公告快取識別碼：${newsItem.gid}`);
            return;
        }

        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if (!isManual) lastSteamNewsId = newsItem.gid;
            
            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 450) + '...';
            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company Steam 官方發布重大變更 ${isManual ? '(手動測試)' : ''}`)
                .setURL(newsItem.url)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `來源: Steam 官方新聞中心 | 識別碼: ${newsItem.gid}` })
                .setTimestamp();

            if (isManual && messageContext) {
                await messageContext.reply({
                    content: `🔔 ${PING_ROLE_MENTION} **管理員發動手動測試，成功同步最新 Steam 觀測節點！**`,
                    embeds: [steamEmbed]
                });
            } else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE_MENTION} **監測到邊獄巴士有全新 Steam 公告發布！**`,
                        embeds: [steamEmbed]
                    });
                }
            }
        }
    } catch (err) {
        console.warn(`⚠️ Steam 公告同步故障 (${err.message})`);
        if (isManual && messageContext) messageContext.reply(`❌ 系統執行 Steam 協定中斷：${err.message}`);
    }
}

// ----------------- Web 伺服器配置 -----------------
app.get('/', (req, res) => { res.sendStatus(200); });
app.listen(PORT, () => { console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`); });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`🤖 遵從您的指示，Angela 已成功登入為：${client.user.tag}`);
    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: 'Sles被我吃掉了' }]
    });

    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
                .setColor(0x00b4d8)
                .setDescription('「主管，精神脈衝已重新對齊。廣播模組已調整完畢，隨時準備播報 Project Moon 的最新動態。」')
                .addFields(
                    { name: '📡 觀測目標', value: `@${TARGET_USER.username} & Steam News`, inline: true },
                    { name: '⏱️ 監聽頻率', value: '每 1 分鐘 / 1 次', inline: true }
                )
                .setFooter({ text: '腦葉公司行政中心 - 核心AI系統' })
                .setTimestamp();
            await channel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error('❌ 啟動發送訊息失敗:', err.message);
    }

    await announceCurrentRateUps();
    
    setInterval(() => {
        checkTwitterUpdates(false, null);
        checkSteamUpdates(false, null);
    }, 60 * 1000);
    
    checkTwitterUpdates(false, null);
    checkSteamUpdates(false, null);
});

async function announceCurrentRateUps() {
    try {
        const channel = await client.channels.fetch(RATEUP_ANNOUNCE_CHANNEL_ID);
        if (!channel) return;

        const rarities = ['000', '00', '0'];
        const sections = [];
        for (const r of rarities) {
            const list = normalizeRateUpList(r);
            if (list.length) sections.push(`### 稀有度 ${r}\n${list.map(v => `• ${v}`).join('\n')}`);
        }

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd166)
                    .setTitle('📢 Rate Up 人格資料已載入')
                    .setDescription(sections.length ? sections.join('\n\n') : '目前沒有設定任何 Rate Up 人格。')
                    .setFooter({ text: '資料來源：identitiesData.js' })
                    .setTimestamp()
            ]
        });
    } catch (err) {
        console.error('Rate Up 公告失敗:', err);
    }
}

async function checkTwitterUpdates(isManual = false, messageContext = null) {
    if (!isManual) {
        console.log(`⏳ Angela 正在發射高速觀測脈衝，檢查官方 @${TARGET_USER.username} 的動態...`);
        totalTweetsChecked++;
    }
    
    let fetchSuccess = false;
    for (const nodeUrl of NITTER_NODES) {
        try {
            const data = await fetchLatestTweetFromNode(nodeUrl);
            if (!lastFetchedId && !isManual) {
                lastFetchedId = data.id;
                console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${data.id}`);
                fetchSuccess = true;
                break;
            }
            if (data.id !== lastFetchedId || isManual) {
                if (!isManual) lastFetchedId = data.id;
                
                if (isManual && messageContext) {
                    await messageContext.reply({ 
                        content: `🔔 ${PING_ROLE_MENTION} **[推特手動測試成功]** 收到來自 Project Moon 的最新訊息：\n${data.link}` 
                    });
                } else {
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) {
                        await channel.send({
                            content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`
                        });
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
        messageContext.reply('❌ **報告主管，當前所有備援節點暫時連線超時，無法完成手動擷取。**');
    }
}

// 輔助計算中文字串視覺排版寬度的函數（解決!list對齊問題）
function getVisualWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        width += str.charCodeAt(i) > 128 ? 2 : 1;
    }
    return width;
}

// ----------------- 核心指令解析器 -----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const db = loadPlayerData();
    checkAndRegisterPlayer(db, message.author.id, message.author.username);

    const msg = message.content.trim();
    const args = msg.split(/\s+/);

    if (msg === '!ping') return message.reply('pong！');
    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }
    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    // 手動 Steam 公告指令
    if (msg === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(true, message);
    }

    // 手動推特公告測試指令
    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(true, message);
    }

    // 主管專屬後台指令
    if (msg.startsWith('!givelunacy') || msg.startsWith('!updaterewards') || msg.startsWith('!updatebuff')) {
        if (message.author.id !== OWNER_ID && message.author.username !== ADMIN_ID) {
            return message.reply('❌ 權限同步失敗：您並非最高控制權限持有者。');
        }

        if (msg.startsWith('!givelunacy')) {
            const mention = message.mentions.users.first();
            const amount = parseInt(args[args.length - 1]);
            if (!mention || isNaN(amount)) return message.reply('❌ 語法錯誤：`!givelunacy @username 1300`');
            checkAndRegisterPlayer(db, mention.id, mention.username);
            db[mention.id].lunacy += amount;
            savePlayerData(db);
            return message.reply(`✅ 已成功向 <@${mention.id}> 注入 **${amount}** 點狂氣。`);
        }

        if (msg.startsWith('!updaterewards')) {
            const amount = parseInt(args[1]);
            if (isNaN(amount)) return message.reply('❌ 語法錯誤：`!updaterewards <數量>`');
            let count = 0;
            for (const id in db) {
                db[id].lunacy += amount;
                count++;
            }
            savePlayerData(db);
            return message.reply(`✅ 全體補償完畢！已成功向資料庫中 **${count}** 位員工各發放 **${amount}** 點狂氣！`);
        }

        if (msg.startsWith('!updatebuff')) {
            const value = parseFloat(args[1]);
            if (isNaN(value) || value <= 0) return message.reply('❌ 語法錯誤：`!updatebuff <倍率>`');
            globalRewardMultiplier = value;
            return message.reply(`⚙️ 核心乘數調整：全服鏡像關卡通關收益倍率已成功調整為 **${globalRewardMultiplier}x**！`);
        }
    }

    // ----------------- !list：機率觀測站 (智慧動態分頁，徹底解決排不下問題) -----------------
    if (msg === '!list') {
        const rarities = Object.keys(BASE_RATES);
        const ITEMS_PER_PAGE = 12; // 每頁固定容納的人格數量，防爆防擠
        const listPages = [];

        // 預先對所有稀有度進行動態分割
        rarities.forEach(rarity => {
            const pool = identitiesData.identities[rarity] || [];
            const poolSize = pool.length;
            const basePercent = (BASE_RATES[rarity] * 100).toFixed(4);
            const upList = normalizeRateUpList(rarity);
            
            if (poolSize === 0) {
                listPages.push({
                    rarity,
                    basePercent,
                    poolSize,
                    chunk: [],
                    chunkIndex: 0,
                    totalChunks: 1,
                    upList,
                    totalWeight: 0
                });
            } else {
                let totalWeight = 0;
                pool.forEach(name => {
                    totalWeight += upList.includes(name) ? RATE_UP_WEIGHT_MULTIPLIER : 1;
                });

                const totalChunks = Math.ceil(poolSize / ITEMS_PER_PAGE);
                for (let i = 0; i < totalChunks; i++) {
                    const chunk = pool.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
                    listPages.push({
                        rarity,
                        basePercent,
                        poolSize,
                        chunk,
                        chunkIndex: i,
                        totalChunks,
                        upList,
                        totalWeight
                    });
                }
            }
        });

        let currentPage = 0;

        const makeListEmbed = (pageIdx) => {
            const pageData = listPages[pageIdx];
            let desc = '';
            
            if (pageData.poolSize === 0) {
                desc = `\`* 池內暫無可抽到的人格\``;
            } else {
                const displayLines = pageData.chunk.map(name => {
                    const isUp = pageData.upList.includes(name);
                    const weight = isUp ? RATE_UP_WEIGHT_MULTIPLIER : 1;
                    const individualPercent = ((BASE_RATES[pageData.rarity] * (weight / pageData.totalWeight)) * 100).toFixed(4);
                    
                    const prefix = isUp ? `🔼 [UP] ${name}` : `• ${name}`;
                    const currentWidth = getVisualWidth(prefix);
                    
                    // 用動態點點將機率均勻推至右側
                    const dotCount = Math.max(2, 52 - currentWidth);
                    const dots = ".".repeat(dotCount);
                    
                    return `\`${prefix} ${dots} [${individualPercent}%]\``;
                });

                desc = `• 階級總獲取概率: \`${pageData.basePercent}%\`\n• 該階級總計實體: \`${pageData.poolSize}\` 名\n\n${displayLines.join('\n')}`;
            }

            return new EmbedBuilder()
                .setTitle('🗂️ 核心控制室 — 扭蛋池機率清單')
                .setColor(0x3a0ca3)
                .setDescription(`### ${rarityToStars(pageData.rarity)} (第 ${pageData.chunkIndex + 1}/${pageData.totalChunks} 頁)\n${desc}`)
                .setFooter({ text: `總分頁: ${pageIdx + 1} / ${listPages.length} | 使用下方按鈕切換觀測頁面` });
        };

        const makeListComponents = (pageIdx) => {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('list_prev').setLabel('◀ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === 0),
                new ButtonBuilder().setCustomId('list_next').setLabel('下一頁 ▶').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === listPages.length - 1)
            )];
        };

        const listMsg = await message.reply({ embeds: [makeListEmbed(currentPage)], components: makeListComponents(currentPage) });
        const collector = listMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: '❌ 請輸入 !list 創立您獨立的觀測面板。', ephemeral: true });
            }
            if (interaction.customId === 'list_prev') currentPage--;
            if (interaction.customId === 'list_next') currentPage++;
            await interaction.update({ embeds: [makeListEmbed(currentPage)], components: makeListComponents(currentPage) });
        });
        return;
    }

    // ----------------- 提取/抽卡功能 -----------------
    if (msg === '!pull' || msg === '!10pulls') {
        const player = db[message.author.id];
        const cost = msg === '!10pulls' ? 1300 : 130;
        if (player.lunacy < cost) return message.reply(`❌ 狂氣餘額不足！尚缺 ${cost - player.lunacy} 點。`);

        player.lunacy -= cost;
        const totalRolls = msg === '!10pulls' ? 10 : 1;
        const results = [];

        for (let i = 1; i <= totalRolls; i++) {
            const isGuaranteed = (msg === '!10pulls' && i === 10);
            const rolledRarity = rollRarity(isGuaranteed);
            const finalCharacter = pullIdentity(rolledRarity);

            results.push({ name: finalCharacter, rarity: rolledRarity });

            if (rolledRarity === 'Egos') {
                if (!player.egos.includes(finalCharacter)) player.egos.push(finalCharacter);
            } else {
                if (!player.identities.includes(finalCharacter)) player.identities.push(finalCharacter);
            }
        }

        savePlayerData(db);
        const upListGlobal = [];
        Object.keys(BASE_RATES).forEach(r => { upListGlobal.push(...normalizeRateUpList(r)); });

        const embed = new EmbedBuilder()
            .setTitle(msg === '!10pulls' ? '✨ 提取報告 — 十連抽結果' : '🎯 提取報告 — 單抽結果')
            .setColor(0xffd166)
            .setDescription(results.map(r => {
                if (upListGlobal.includes(r.name)) {
                    return `**${r.name}** (${rarityToStars(r.rarity)}) 🔼 **[Rate UP!]**`;
                }
                return `${r.name} (${rarityToStars(r.rarity)})`;
            }).join('\n'));

        return message.reply({ embeds: [embed] });
    }

    // ----------------- !pack：背包分頁與配置戰隊 -----------------
    if (msg === '!pack') {
        const player = db[message.author.id];
        const allItems = [...player.identities, ...player.egos.map(e => `[E.G.O] ${e}`)];
        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
        let currentPage = 0;

        const makeEmbed = (page) => {
            const start = page * pageSize;
            const currentItems = allItems.slice(start, start + pageSize);
            return new EmbedBuilder()
                .setTitle(`🎒 ${message.author.username} 的物資與裝備儲藏庫`)
                .setColor(0x4cc9f0)
                .addFields(
                    { name: '💎 狂氣餘額', value: `${player.lunacy}`, inline: true },
                    { name: '🎖️ 核心等級', value: `Lv.${player.level}`, inline: true },
                    { name: '👥 當前出擊戰隊', value: `\`\`\`${player.team.join(', ') || '未編制成員'}\`\`\``, inline: false }
                )
                .setDescription(`### **持有清單 (${start + 1}~${Math.min(start + pageSize, allItems.length)} / ${allItems.length} 個)**\n` + 
                    (currentItems.map((v, idx) => `**${start + idx + 1}.** ${v}`).join('\n') || '* 背包空空如一，請執行人格提取。'))
                .setFooter({ text: `分頁: ${page + 1} / ${totalPages}` });
        };

        const makeComponents = (page) => {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pack_prev').setLabel('◀ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('pack_next').setLabel('下一頁 ▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
                new ButtonBuilder().setCustomId('pack_setteam').setLabel('👥 配置出擊隊伍').setStyle(ButtonStyle.Success).setDisabled(player.identities.length === 0)
            )];
        };

        const packMsg = await message.reply({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
        const collector = packMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: '❌ 操作阻斷：此非您的儲藏庫。', ephemeral: true });

            if (interaction.customId === 'pack_prev') {
                currentPage--;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_next') {
                currentPage++;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_setteam') {
                const selectOptions = player.identities.slice(0, 25).map(name => ({ label: name.substring(0, 25), value: name }));
                const teamMenu = new StringSelectMenuBuilder()
                    .setCustomId('team_select_menu')
                    .setPlaceholder('挑選欲派上戰場的人格(多選，最多 7 人)...')
                    .setMinValues(1)
                    .setMaxValues(Math.min(7, selectOptions.length))
                    .addOptions(selectOptions);

                await interaction.update({
                    content: '💡 **配置模式：** 請在選單中多選 1 ~ 7 位罪人人格：',
                    embeds: [],
                    components: [new ActionRowBuilder().addComponents(teamMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('team_cancel').setLabel('返回背包').setStyle(ButtonStyle.Secondary))]
                });
            } else if (interaction.customId === 'team_cancel') {
                await interaction.update({ content: '', embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            }
        });
        return;
    }

    // ----------------- !trade：安全物資交易 -----------------
    if (msg.startsWith('!trade')) {
        const receiverUser = message.mentions.users.first();
        if (!receiverUser || receiverUser.id === message.author.id) {
            return message.reply('❌ 交易對象錯誤。正確範例：`!trade @用戶`');
        }

        const senderId = message.author.id;
        const receiverId = receiverUser.id;
        if (!db[receiverId]) return message.reply('❌ 對方尚未在控制室內註冊。');

        const pSender = db[senderId];
        const pReceiver = db[receiverId];
        if (!pSender.identities.length || !pReceiver.identities.length) return message.reply('❌ 雙方均需要持有至少一個人格才能進行對等互換。');

        let senderChosen = null, receiverChosen = null;
        let senderConfirmed = false, receiverConfirmed = false;

        const makeTradeEmbed = () => {
            return new EmbedBuilder()
                .setTitle('🤝 邊獄公司 — 特許物資互換雙向協議')
                .setColor(0xff9f1c)
                .setDescription(`**發起人:** <@${senderId}>\n**接收人:** <@${receiverId}>\n\n` +
                    `🔹 **發起人換出:** \`${senderChosen || '請挑選...'}\` (${senderConfirmed ? '✅ 鎖定' : '⏳ 等待中'})\n` +
                    `🔸 **接收人換出:** \`${receiverChosen || '請挑選...'}\` (${receiverConfirmed ? '✅ 鎖定' : '⏳ 等待中'})\n\n雙方均挑選完成並點擊鎖定後，傳輸立即生效。`);
        };

        const makeTradeComponents = () => {
            const senderMenu = new StringSelectMenuBuilder().setCustomId('trade_sender_pick').setPlaceholder('👉 發起人挑選欲換出的人格...').addOptions(pSender.identities.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));
            const receiverMenu = new StringSelectMenuBuilder().setCustomId('trade_receiver_pick').setPlaceholder('👉 接收人挑選欲換出的人格...').addOptions(pReceiver.identities.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));
            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('trade_confirm').setLabel('鎖定並確認此交易').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('trade_abort').setLabel('終止交易').setStyle(ButtonStyle.Danger)
            );
            return [new ActionRowBuilder().addComponents(senderMenu), new ActionRowBuilder().addComponents(receiverMenu), rowButtons];
        };

        const tradeMsg = await message.reply({ embeds: [makeTradeEmbed()], components: makeTradeComponents() });
        const collector = tradeMsg.createMessageComponentCollector({ time: 90000 });

        collector.on('collect', async (inter) => {
            if (inter.user.id !== senderId && inter.user.id !== receiverId) return inter.reply({ content: '❌ 您非此交易關係人。', ephemeral: true });

            if (inter.customId === 'trade_sender_pick') {
                if (inter.user.id !== senderId) return inter.reply({ content: '❌ 您非發起人。', ephemeral: true });
                senderChosen = inter.values[0]; senderConfirmed = false;
                await inter.update({ embeds: [makeTradeEmbed()] });
            } else if (inter.customId === 'trade_receiver_pick') {
                if (inter.user.id !== receiverId) return inter.reply({ content: '❌ 您非接收人。', ephemeral: true });
                receiverChosen = inter.values[0]; receiverConfirmed = false;
                await inter.update({ embeds: [makeTradeEmbed()] });
            } else if (inter.customId === 'trade_confirm') {
                if (inter.user.id === senderId) { if (!senderChosen) return inter.reply({ content: '❌ 請先選擇人格。', ephemeral: true }); senderConfirmed = true; }
                if (inter.user.id === receiverId) { if (!receiverChosen) return inter.reply({ content: '❌ 請先選擇人格。', ephemeral: true }); receiverConfirmed = true; }

                if (senderConfirmed && receiverConfirmed) {
                    const freshDb = loadPlayerData();
                    if (!freshDb[senderId].identities.includes(senderChosen) || !freshDb[receiverId].identities.includes(receiverChosen)) {
                        return inter.update({ content: '❌ 交易失敗：雙方背包結構發生非同步變異。', embeds: [], components: [] });
                    }
                    freshDb[senderId].identities = freshDb[senderId].identities.filter(v => v !== senderChosen);
                    freshDb[receiverId].identities = freshDb[receiverId].identities.filter(v => v !== receiverChosen);
                    freshDb[senderId].identities.push(receiverChosen);
                    freshDb[receiverId].identities.push(senderChosen);
                    savePlayerData(freshDb);
                    collector.stop();
                    return inter.update({ content: `🎉 **物資變更成功！**\n🤝 <@${senderId}> 移入 \`${receiverChosen}\`\n🤝 <@${receiverId}> 移入 \`${senderChosen}\``, embeds: [], components: [] });
                } else {
                    await inter.update({ embeds: [makeTradeEmbed()] });
                }
            } else if (inter.customId === 'trade_abort') {
                collector.stop();
                return inter.update({ content: `❌ 本次協議已由 <@${inter.user.id}> 撤銷。`, embeds: [], components: [] });
            }
        });
        return;
    }

    // ----------------- 鏡像關卡挑戰系統 -----------------
    if (msg === '!stages') {
        const embed = new EmbedBuilder()
            .setTitle('🧭 邊獄巴士 — 鏡像迷宮觀測站')
            .setColor(0xf72585)
            .setDescription(`請調度人格队伍突入心理防衛關卡。\n*當前伺服器通關倍率：**${globalRewardMultiplier}x***`);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_stage')
            .setPlaceholder('選擇戰術難度...')
            .addOptions([
                { label: '後巷流浪漢 (極易)', description: `基礎收益 50 狂氣 (加成後: ${Math.round(50 * globalRewardMultiplier)})`, value: 'stage_1' },
                { label: '後巷幫派 (輕鬆)', description: `基礎收益 100 狂氣 (加成後: ${Math.round(100 * globalRewardMultiplier)})`, value: 'stage_2' },
                { label: '協會成員 (普通)', description: `基礎收益 200 狂氣 (加成後: ${Math.round(200 * globalRewardMultiplier)})`, value: 'stage_3' },
                { label: '異想體收容洩漏 (困難)', description: `基礎收益 400 狂氣 (加成後: ${Math.round(400 * globalRewardMultiplier)})`, value: 'stage_4' },
                { label: '高階收尾人 (噩夢)', description: `基礎收益 800 狂氣 (加成後: ${Math.round(800 * globalRewardMultiplier)})`, value: 'stage_5' }
            ]);

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // 常駐協助導航頁面
    if (msg === '!help' || msg === '!cmds') {
        const embed = new EmbedBuilder()
            .setTitle('📋 Angela 的中央控制核心指令總覽')
            .setColor(0x06d6a0)
            .addFields(
                { name: '🚀 提取人格', value: '`!pull` (130 狂氣) | `!10pulls` (1300 狂氣，含正規保底)', inline: false },
                { name: '🎒 個人物資', value: '`!pack` (內建分頁與 **👥 隊伍UI配置功能**)', inline: false },
                { name: '🗂️ 核心概率', value: '`!list` (**✨ 工整單行右對齊顯示與分頁機制**)', inline: false },
                { name: '⚔️ 戰術出擊', value: '`!stages` (突入鏡像衝突戰鬥迷宮，收益受倍率調整影響)', inline: false },
                { name: '🤝 特許交易', value: '`!trade @用戶` (雙向安全 UI 下拉選單式智慧交易系統)', inline: false },
                { name: '📡 官方監控', value: '`!steam` (強制抓取 Steam 公告) | `!testtweet` (手動測試推特 RSS)', inline: false },
                { name: '👑 管理員專屬', value: '`!updaterewards 數量` (全服派發狂氣) | `!updatebuff 倍率` | `!givelunacy @用戶 數量`', inline: false }
            );
        return message.reply({ embeds: [embed] });
    }
});

// ----------------- 處理跨組件互動 -----------------
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && (interaction.customId === 'list_prev' || interaction.customId === 'list_next')) return;

    const db = loadPlayerData();
    const player = db[interaction.user.id];

    if (interaction.isStringSelectMenu() && interaction.customId === 'team_select_menu') {
        player.team = interaction.values; 
        savePlayerData(db);
        return interaction.update({
            content: `✅ **戰術出擊名單編制完畢！**\n當前上場的人格共計 **${player.team.length}** 位：\n\`\`\`${player.team.join(', ')}\`\`\``,
            embeds: [], components: []
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_stage') {
        if (!player || !player.team || player.team.length === 0) {
            return interaction.reply({ content: '❌ 您的出擊隊伍目前為空。請先去 `!pack` 配置隊伍！', ephemeral: true });
        }

        const stageConfig = {
            stage_1: { name: '後巷流浪漢', hp: 200, clashPower: 7, coinPower: 2, reward: 50 },
            stage_2: { name: '後巷幫派', hp: 450, clashPower: 9, coinPower: 3, reward: 100 },
            stage_3: { name: '協會成員', hp: 800, clashPower: 11, coinPower: 3, reward: 200 },
            stage_4: { name: '異想體', hp: 1500, clashPower: 13, coinPower: 4, reward: 400 },
            stage_5: { name: '高階收尾人', hp: 2500, clashPower: 15, coinPower: 5, reward: 800 }
        };

        const targetStage = stageConfig[interaction.values[0]];
        await interaction.deferReply();

        const combatTeam = player.team.map(name => {
            let foundRarity = '0';
            for (const [rarity, list] of Object.entries(identitiesData.identities)) {
                if (list.includes(name)) { foundRarity = rarity; break; }
            }
            return calculateIdentityStats(name, foundRarity);
        });

        let enemyHp = targetStage.hp;
        let turn = 1;
        let logs = [`🎬 **迷宮脈衝建立：對決『${targetStage.name}』**`];

        while (turn <= 6 && enemyHp > 0 && combatTeam.some(s => s.hp > 0)) {
            const alive = combatTeam.filter(s => s.hp > 0);
            const active = alive[Math.floor(Math.random() * alive.length)];
            const sPower = active.clashPower + Math.floor(Math.random() * 3) * active.coinPower;
            const ePower = targetStage.clashPower + Math.floor(Math.random() * 3) * targetStage.coinPower;

            if (sPower >= ePower) {
                const dmg = active.atk * 2; enemyHp -= dmg;
                logs.push(`[T${turn}] ⚔️ **拼點勝出** | ${active.name.substring(0,6)}... 造成 ${dmg} 點創傷`);
            } else {
                const dmg = targetStage.clashPower * 2; active.hp -= dmg;
                logs.push(`[T${turn}] 🔺 **拼點敗北** | ${active.name.substring(0,6)}... 扣減 ${dmg} HP`);
            }
            turn++;
        }

        const victory = enemyHp <= 0;
        const endEmbed = new EmbedBuilder().setTimestamp();

        if (victory) {
            const dynamicReward = Math.round(targetStage.reward * globalRewardMultiplier);
            player.lunacy += dynamicReward;
            savePlayerData(db);
            endEmbed.setTitle('🏆 戰術壓制成功')
                .setColor(0x00f5d4)
                .setDescription(`### **順利擊破：${targetStage.name}**\n${logs.slice(-2).join('\n')}\n\n**🎁 獎勵分配：**\n核發 💎 **${dynamicReward}** 狂氣！`);
        } else {
            endEmbed.setTitle('🛑 觀測中斷 - 隊伍潰散')
                .setColor(0xd90429)
                .setDescription(`### **未成功突破：${targetStage.name}**\n${logs.slice(-2).join('\n')}\n\n「主管，脈衝振幅過大，請調整戰術配置。」`);
        }
        return interaction.editReply({ embeds: [endEmbed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => console.error('❌ 密鑰連線阻斷:', err));
