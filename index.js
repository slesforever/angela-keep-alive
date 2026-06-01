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
            stageProgress: 1,
            identityLevels: {} // 初始化人格等級對照表
        };
        savePlayerData(db);
        return true;
    }
    if (db[userId].level === undefined) db[userId].level = 1;
    if (db[userId].exp === undefined) db[userId].exp = 0;
    if (db[userId].thread === undefined) db[userId].thread = 0;
    if (!db[userId].team) db[userId].team = [];
    if (!db[userId].egos) db[userId].egos = [];
    if (!db[userId].identityLevels) db[userId].identityLevels = {};
    return false;
}

function calculateIdentityStats(name, rarity) {
    let hp = 170, atk = 50, def = 15, speed = 6, clashPower = 8, coinPower = 2;
    
    if (rarity === '00') { hp = 200; atk = 70; def = 17; speed = 8; clashPower = 10; coinPower = 3; }
    if (rarity === '000') { hp = 350; atk = 130; def = 20; speed = 10; clashPower = 30; coinPower = 6; }
    if (rarity === '0000') { hp = 400; atk = 150; def = 27; speed = 15; clashPower = 42; coinPower = 8; }
    if (rarity === 'Special') { hp = 500; atk = 200; def = 25; speed = 17; clashPower = 37; coinPower = 9; }
    if (rarity === 'Color Fixer') { hp = 750; atk = 320; def = 30; speed = 17; clashPower = 50; coinPower = 12; }
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
const RATE_UP_WEIGHT_MULTIPLIER = 5; 

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

// 輔助函式：透過人格名稱反查其星等稀有度
function findIdentityRarity(name) {
    for (const rarity in identitiesData.identities) {
        if (identitiesData.identities[rarity].includes(name)) {
            return rarity;
        }
    }
    return '0';
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

// ----------------- 處理跨組件互動 -----------------
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

        const rarities = ['Color Fixer', 'Special', '0000', 'Egos', '000', '00', '0'];
        const sections = [];
        for (const r of rarities) {
            const list = normalizeRateUpList(r);
            if (list.length) sections.push(`### ${rarityToStars(r)}\n${list.map(v => `• ${v}`).join('\n')}`);
        }

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd166)
                    .setTitle('📢 Rate Up 人格與物資資料已成功載入')
                    .setDescription(sections.length ? sections.join('\n\n') : '目前池內沒有設定任何 Rate Up 對象。')
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

    if (msg === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(true, message);
    }

    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(true, message);
    }

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

    if (msg === '!list') {
        const rarities = Object.keys(BASE_RATES);
        const ITEMS_PER_PAGE = 12; 
        const listPages = [];

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

    // ----------------- !pack：背包分頁 -----------------
    if (msg === '!pack') {
        const player = db[message.author.id];
        const allItems = [...player.identities, ...player.egos.map(e => `[E.G.O] ${e}`)];
        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
        let currentPage = 0;

        const makeEmbed = (page) => {
            const start = page * pageSize;
            const currentItems = allItems.slice(start, start + pageSize);
            
            // 地毯式渲染當前出擊戰隊，增加星等與人格等級標示
            const teamDisplay = player.team.map(tName => {
                const tRarity = findIdentityRarity(tName);
                const tStars = rarityToStars(tRarity);
                const tLvl = player.identityLevels[tName] || 1;
                return `• ${tName} (Lv.${tLvl}) [${tStars}]`;
            }).join('\n') || '未編制成員';

            return new EmbedBuilder()
                .setTitle(`🎒 ${message.author.username} 的物資與裝備儲藏庫`)
                .setColor(0x4cc9f0)
                .addFields(
                    { name: '💎 狂氣餘額', value: `${player.lunacy}`, inline: true },
                    { name: '🎖️ 核心等級', value: `Lv.${player.level}`, inline: true },
                    { name: '🧵 持有紡錘', value: `${player.thread} 個`, inline: true },
                    { name: '👥 當前出擊戰隊 (已同步最新等級/星等)', value: `\`\`\`markdown\n${teamDisplay}\n\`\`\``, inline: false }
                )
                .setDescription(`### **持有清單 (${start + 1}~${Math.min(start + pageSize, allItems.length)} / ${allItems.length} 個)**\n` + 
                    (currentItems.map((v, idx) => {
                        const isEgo = v.startsWith('[E.G.O] ');
                        const cleanName = isEgo ? v.replace('[E.G.O] ', '') : v;
                        const rarity = findIdentityRarity(cleanName);
                        const stars = rarityToStars(rarity);
                        const lvlDisplay = isEgo ? '' : ` (Lv.${player.identityLevels[cleanName] || 1})`;
                        return `**${start + idx + 1}.** ${v}${lvlDisplay} \`[${stars}]\``;
                    }).join('\n') || '* 背包空空如一，請執行人格提取。'))
                .setFooter({ text: `分頁: ${page + 1} / ${totalPages}` });
        };

        const makeComponents = (page) => {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pack_prev').setLabel('◀ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('pack_next').setLabel('下一頁 ▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
                new ButtonBuilder().setCustomId('pack_setteam').setLabel('👥 配置出擊隊伍').setStyle(ButtonStyle.Success).setDisabled(player.identities.length === 0),
                new ButtonBuilder().setCustomId('pack_upgrade').setLabel('🔼 人格等級升級(UI)').setStyle(ButtonStyle.Secondary).setDisabled(player.identities.length === 0)
            )];
        };

        const packMsg = await message.reply({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
        const collector = packMsg.createMessageComponentCollector({ time: 90000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: '❌ 操作阻斷：此非您的儲藏庫。', ephemeral: true });

            if (interaction.customId === 'pack_prev') {
                currentPage--;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_next') {
                currentPage++;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_setteam') {
                // 編制隊伍介面：選項全面加註星等與人格等級
                const selectOptions = player.identities.slice(0, 25).map(name => {
                    const rarity = findIdentityRarity(name);
                    const stars = rarityToStars(rarity);
                    const lvl = player.identityLevels[name] || 1;
                    return {
                        label: `${name.substring(0, 25)} (Lv.${lvl})`,
                        description: `階級: ${stars}`,
                        value: name
                    };
                });

                const teamMenu = new StringSelectMenuBuilder()
                    .setCustomId('team_select_menu')
                    .setPlaceholder('挑選欲派上戰場的人格(多選，最多 7 人)...')
                    .setMinValues(1)
                    .setMaxValues(Math.min(7, selectOptions.length))
                    .addOptions(selectOptions);

                await interaction.update({
                    content: '💡 **配置模式：** 請在選單中多選 1 ~ 7 位罪人人格（選單內已整合顯示等級與星星星等）：',
                    embeds: [],
                    components: [new ActionRowBuilder().addComponents(teamMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('team_cancel').setLabel('返回背包').setStyle(ButtonStyle.Secondary))]
                });
            } else if (interaction.customId === 'pack_upgrade') {
                // UI 升級介面：動態加載等級、星等及按比例增加的紡錘消耗
                const upgradeOptions = player.identities.slice(0, 25).map(name => {
                    const rarity = findIdentityRarity(name);
                    const stars = rarityToStars(rarity);
                    const lvl = player.identityLevels[name] || 1;
                    const cost = lvl * 10; // 升級消耗公式：每級所需紡錘越來越多
                    return {
                        label: `${name.substring(0, 25)} (當前 Lv.${lvl})`,
                        description: `${stars} | 突破至下一級所需紡錘: ${cost} 個`,
                        value: name
                    };
                });

                const upgradeMenu = new StringSelectMenuBuilder()
                    .setCustomId('upgrade_select_menu')
                    .setPlaceholder('挑選想要提升等級的罪人人格...')
                    .addOptions(upgradeOptions);

                await interaction.update({
                    content: `🔼 **核心人格 UI 突破模組**\n您當前共持有：**${player.thread}** 個紡錘。\n請在下方選單選取目標執行同步化升級：`,
                    embeds: [],
                    components: [new ActionRowBuilder().addComponents(upgradeMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('team_cancel').setLabel('返回背包').setStyle(ButtonStyle.Secondary))]
                });
            } else if (interaction.customId === 'team_select_menu') {
                player.team = interaction.values;
                savePlayerData(db);
                await interaction.update({ content: '✅ **戰隊編制完畢！核心精神同步已儲存。**', embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'upgrade_select_menu') {
                const targetName = interaction.values[0];
                const currentLvl = player.identityLevels[targetName] || 1;
                const requiredThread = currentLvl * 10;

                if (player.thread < requiredThread) {
                    return interaction.reply({ content: `❌ **同步突破失敗：** 升級 \`${targetName}\` 需要 **${requiredThread}** 個紡錘，您目前僅持有 **${player.thread}** 個。`, ephemeral: true });
                }

                // 扣除物資並升級
                player.thread -= requiredThread;
                player.identityLevels[targetName] = currentLvl + 1;
                savePlayerData(db);

                // 重新渲染升級清單，確保 UI 能連續點擊升級
                const nextUpgradeOptions = player.identities.slice(0, 25).map(name => {
                    const rarity = findIdentityRarity(name);
                    const stars = rarityToStars(rarity);
                    const lvl = player.identityLevels[name] || 1;
                    const cost = lvl * 10;
                    return {
                        label: `${name.substring(0, 25)} (當前 Lv.${lvl})`,
                        description: `${stars} | 突破至下一級所需紡錘: ${cost} 個`,
                        value: name
                    };
                });

                const nextUpgradeMenu = new StringSelectMenuBuilder()
                    .setCustomId('upgrade_select_menu')
                    .setPlaceholder('挑選想要提升等級的罪人人格...')
                    .addOptions(nextUpgradeOptions);

                await interaction.update({
                    content: `🎉 **人格資料重構成功！**\n\`${targetName}\` 已成功晉升至 **Lv.${currentLvl + 1}**！\n本次消耗紡錘: **${requiredThread}** 個。剩餘持有: **${player.thread}** 個。`,
                    components: [new ActionRowBuilder().addComponents(nextUpgradeMenu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('team_cancel').setLabel('返回背包').setStyle(ButtonStyle.Secondary))]
                });
            } else if (interaction.customId === 'team_cancel') {
                await interaction.update({ content: '', embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            }
        });
        return;
    }

    // ----------------- !trade：物資交易 -----------------
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
                    
                    // 交易時同步轉換人格等級資料（防呆移轉）
                    if (freshDb[senderId].identityLevels[senderChosen]) {
                        freshDb[receiverId].identityLevels[senderChosen] = freshDb[senderId].identityLevels[senderChosen];
                        delete freshDb[senderId].identityLevels[senderChosen];
                    }
                    if (freshDb[receiverId].identityLevels[receiverChosen]) {
                        freshDb[senderId].identityLevels[receiverChosen] = freshDb[receiverId].identityLevels[receiverChosen];
                        delete freshDb[receiverId].identityLevels[receiverChosen];
                    }

                    savePlayerData(freshDb);
                    collector.stop();
                    return inter.update({ content: `🎉 **物資變更成功！**\n🤝 <@${senderId}> 移入 \`${receiverChosen}\`\n🤝 <@${receiverId}> 移入 \`${senderChosen}\``, embeds: [], components: [] });
                } else {
                    await inter.update({ embeds: [makeTradeEmbed()] });
                }
            } else if (inter.customId === 'trade_abort') {
                collector.stop();
                return inter.update({ content: '❌ 交易已被手動中止。', embeds: [], components: [] });
            }
        });
        return;
    }
});

client.login(process.env.TOKEN || 'YOUR_BOT_TOKEN');
