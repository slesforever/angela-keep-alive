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

// 自動註冊新玩家並發放 12 罪人基礎 0 人格
function checkAndRegisterPlayer(db, userId, username) {
    if (!db[userId]) {
        const baseZeroIdentities = identitiesData.identities['0'] || [];
        db[userId] = {
            username: username,
            lunacy: 1300, // 給予初始10連的測試起動金
            identities: [...baseZeroIdentities],
            egos: [],
            team: baseZeroIdentities.slice(0, 7), // 預填前 7 個人格進入隊伍
            equipped: baseZeroIdentities[0] || null,
            level: 1,
            exp: 0,
            thread: 0,
            stageProgress: 1
        };
        savePlayerData(db);
        return true;
    }
    // 預留欄位防呆檢驗
    if (db[userId].level === undefined) db[userId].level = 1;
    if (db[userId].exp === undefined) db[userId].exp = 0;
    if (db[userId].thread === undefined) db[userId].thread = 0;
    if (!db[userId].team) db[userId].team = [];
    if (!db[userId].egos) db[userId].egos = [];
    return false;
}

// 根據人格名稱與稀有度動態推導戰鬥面板數值
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
        // 移除 0 稀有度，將剩餘稀有度進行等比正規化
        const totalPremiumWeight = 0.12 + 0.029 + 0.013 + 0.001 + 0.001 + 0.0000143; // 0.1640143
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

let lastRateUpSnapshot = JSON.stringify(
    identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {}
);

const rateUpSource = identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {};

const pullIdentity = typeof identitiesData.pullIdentity === 'function'
    ? identitiesData.pullIdentity
    : (rarity) => {
        const pool = identitiesData.identities[rarity] || [];
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : `（缺少實體角色資料：${rarity}）`;
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

function pickRateUp(rarity) {
    const list = normalizeRateUpList(rarity);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
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

// ----------------- 全新核心 Steam 公告追蹤 -----------------
async function checkSteamUpdates() {
    try {
        const response = await fetchWithTimeout(
            'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1'
        );
        if (!response.ok) return;
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) return;

        if (!lastSteamNewsId) {
            lastSteamNewsId = newsItem.gid;
            console.log(`📦 [Steam News] 成功建立初始公告快取識別碼：${newsItem.gid}`);
            return;
        }

        if (newsItem.gid !== lastSteamNewsId) {
            lastSteamNewsId = newsItem.gid;
            const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
            if (channel) {
                let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 450) + '...';
                const steamEmbed = new EmbedBuilder()
                    .setTitle(`📢 Limbus Company Steam 官方發布重大變更`)
                    .setURL(newsItem.url)
                    .setDescription(`### **${newsItem.title}**\n\n${cleanContent}`)
                    .setColor(0x1a3a6c)
                    .setFooter({ text: `來源: Steam 官方新聞中心 | 類別: ${newsItem.feedlabel}` })
                    .setTimestamp();

                await channel.send({
                    content: `🔔 ${PING_ROLE_MENTION} **監測到邊獄巴士有全新 Steam 公告發布！**`,
                    embeds: [steamEmbed]
                });
            }
        }
    } catch (err) {
        console.warn(`⚠️ Steam 公告排程同步故障 (${err.message})`);
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
    
    // 公告檢查總計定時器
    setInterval(() => {
        checkTwitterUpdates();
        checkSteamUpdates();
    }, 60 * 1000);
    
    checkTwitterUpdates();
    checkSteamUpdates();
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

async function checkTwitterUpdates() {
    console.log(`⏳ Angela 正在發射高速觀測脈衝，檢查官方 @${TARGET_USER.username} 的動態...`);
    totalTweetsChecked++;
    for (const nodeUrl of NITTER_NODES) {
        try {
            const data = await fetchLatestTweetFromNode(nodeUrl);
            if (!lastFetchedId) {
                lastFetchedId = data.id;
                console.log(`📦 [${nodeUrl}] 成功建立 @${TARGET_USER.username} 的初始推文快取：${data.id}`);
                break;
            }
            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}`
                    });
                }
            }
            break;
        } catch (error) {
            console.warn(`⚠️ 節點 [${nodeUrl}] 擷取異常 (${error.message})，嘗試下一個備援空間...`);
        }
    }
}

// ----------------- 核心指令解析器 -----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const db = loadPlayerData();
    checkAndRegisterPlayer(db, message.author.id, message.author.username);

    const msg = message.content.trim();

    // 基礎原始互動指令
    if (msg === '!ping') return message.reply('pong！');
    if (msg === '管理員' || msg === '主管') {
        return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    }
    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') {
        return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    }

    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        let fetchSuccess = false;
        for (const nodeUrl of NITTER_NODES) {
            try {
                const data = await fetchLatestTweetFromNode(nodeUrl);
                await message.reply({ content: `🔔 ${PING_ROLE_MENTION} **偵測到脈衝，已收到 Project Moon 的最新訊息：**\n${data.link}` });
                fetchSuccess = true;
                break;
            } catch (error) {
                console.warn(`⚠️ 測試時節點 [${nodeUrl}] 異常: ${error.message}`);
            }
        }
        return fetchSuccess ? null : message.reply('❌ **報告主管，當前所有備援節點暫時連線超時，無法完成手動擷取。**');
    }

    if (msg === '!邊獄人數' || msg === '!limbusonline') {
        try {
            const response = await fetchWithTimeout('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530');
            const data = await response.json();
            if (data?.response?.result === 1) {
                return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中進行探索。`);
            }
            return message.reply('❌ 無法從 Steam API 取得正確的數據。');
        } catch (error) {
            return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。');
        }
    }

    if (msg === '!狀態' || msg === '!status') {
        const uptimeMs = new Date() - systemStartTime;
        const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);
        const embed = new EmbedBuilder()
            .setTitle('🧠 認知心理學 - 情感共鳴與系統狀態報告')
            .setColor(0x5a189a)
            .setDescription('在當前社會標籤與認知扭曲下，個體的情感投影與核心控制室運行紀錄：')
            .addFields(
                { name: '🏷️ 當前標籤 (Label)', value: '「被觀測者」', inline: true },
                { name: '📊 心理狀態 (State)', value: '🛑 精神枯竭 (Burnout)', inline: true },
                { name: '⏳ 核心運作時間 (Uptime)', value: `${uptimeHours} 小時`, inline: true },
                { name: '📡 監聽機制', value: '1分鐘極速雙端輪詢', inline: true },
                { name: '📈 檢查次數', value: `${totalTweetsChecked}`, inline: true }
            )
            .setFooter({ text: 'Angela 心理與系統觀測核心' })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (msg === '!ego') {
        const egoList = [
            { name: '薄暮 (Twilight)', grade: 'ALEPH', desc: '調和所有矛盾與偏見的終極大劍。暗示個體拒絕接受單一標籤，試圖在黑白混沌的世界中強行抓住平衡。' },
            { name: '失樂園 (Paradise Lost)', grade: 'ALEPH', desc: '純白羽翼覆蓋的禁忌法杖。象徵對「完美標籤」的病態追求，個體容易因為試圖符合他人的神聖期望而陷入更深沉的 Burnout。' },
            { name: '擬態 (Mimicry)', grade: 'ALEPH', desc: '由血肉扭曲而成的巨大刀刃。這代表個體擅長在不同環境中偽裝、完美貼上符合群體需求的標籤。' }
        ];
        const randomEgo = egoList[Math.floor(Math.random() * egoList.length)];
        const egoEmbed = new EmbedBuilder()
            .setTitle('⚔️ 核心共鳴：E.G.O 同步觀測報告')
            .setColor(0xd90429)
            .setDescription(`**${message.author.username}** 主管，提取出以下同步率最高的 E.G.O 武裝：`)
            .addFields(
                { name: '✨ 裝備名稱', value: `**${randomEgo.name}**`, inline: true },
                { name: '🔱 危險等級', value: `\`${randomEgo.grade}\``, inline: true },
                { name: '🧠 標籤與認知心理學解析', value: randomEgo.desc, inline: false }
            )
            .setFooter({ text: 'Angela 心理提取模組' })
            .setTimestamp();
        return message.reply({ embeds: [egoEmbed] });
    }

    if (msg === '!逆流') {
        const alarmEmbed = new EmbedBuilder()
            .setTitle('⚠️ [WARNING] 腦葉公司核心控制室緊急通告')
            .setColor(0xff0000)
            .setDescription('警告：當前頻道內觀測到嚴重的「心理逆流」現象！')
            .addFields({ name: '🚨 逆流狀態', value: '第 3 階能障逆流 (Qliphoth Meltdown)', inline: false })
            .setImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')
            .setFooter({ text: '腦葉公司最高行政控制中心' })
            .setTimestamp();
        return message.reply({ embeds: [alarmEmbed] });
    }

    if (msg === '!checkrateupids') {
        const r000 = normalizeRateUpList('000');
        const r00 = normalizeRateUpList('00');
        const r0 = normalizeRateUpList('0');
        if (!r000.length && !r00.length && !r0.length) return message.reply('📭 目前沒有設定任何機率提升中的人格。');
        const lines = [];
        if (r000.length) lines.push(`**000**\n${r000.map(v => `• ${v}`).join('\n')}`);
        if (r00.length) lines.push(`**00**\n${r00.map(v => `• ${v}`).join('\n')}`);
        if (r0.length) lines.push(`**0**\n${r0.map(v => `• ${v}`).join('\n')}`);
        return message.reply(`📈 **目前機率提升人格**\n\n${lines.join('\n\n')}`);
    }

    // ----------------- 全新升級 抽卡系統 (含十連正規化保底) -----------------
    if (msg === '!pull' || msg === '!10pulls') {
        const player = db[message.author.id];
        const cost = msg === '!10pulls' ? 1300 : 130;
        if (player.lunacy < cost) return message.reply(`❌ **狂氣 (Lunacy) 不足！** 需要 ${cost}，當前僅存 ${player.lunacy}。`);

        player.lunacy -= cost;
        const totalRolls = msg === '!10pulls' ? 10 : 1;
        const results = [];

        for (let i = 1; i <= totalRolls; i++) {
            // 第十抽觸發等比消除 0 級人格之保底演算法
            const isGuaranteed = (msg === '!10pulls' && i === 10);
            const rolledRarity = rollRarity(isGuaranteed);
            
            let finalName = '';
            // 判定是否有命中 25% 專屬對應抽卡池 Rate Up
            const rateUpCharacter = pickRateUp(rolledRarity);
            if (rateUpCharacter && Math.random() < 0.25) {
                finalName = `✨ **[PICK-UP!]** ${rateUpCharacter}`;
            } else {
                finalName = pullIdentity(rolledRarity);
            }

            results.push({ name: finalName, rarity: rolledRarity });

            // 儲存進玩家背包
            if (rolledRarity === 'Egos') {
                if (!player.egos.includes(finalName)) player.egos.push(finalName);
            } else {
                if (!player.identities.includes(finalName)) player.identities.push(finalName);
            }
        }

        savePlayerData(db);

        const resultLines = results.map(r => `${r.name} (${rarityToStars(r.rarity)})`);
        const embed = new EmbedBuilder()
            .setTitle(msg === '!10pulls' ? '✨ 腦葉核心控制室 - 十連抽取報告' : '🎯 腦葉核心控制室 - 單次提取結果')
            .setColor(0xffd166)
            .setDescription(resultLines.join('\n'))
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // ----------------- 背包系統 (!pack) -----------------
    if (msg === '!pack') {
        const player = db[message.author.id];
        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${message.author.username} 的物質與人格儲藏庫`)
            .setColor(0x4cc9f0)
            .addFields(
                { name: '💎 狂氣殘額 (Lunacy)', value: `${player.lunacy}`, inline: true },
                { name: '🎖️ 核心等級', value: `Lv.${player.level} (EXP: ${player.exp})`, inline: true },
                { name: '🧵 紡織線 (Thread)', value: `${player.thread}`, inline: true },
                { name: '👤 當前裝備人格', value: `${player.equipped || '未裝備'}`, inline: false },
                { name: '👥 目前編組隊伍人數', value: `${player.team.length} / 7 人`, inline: false },
                { name: '🔮 持有 E.G.O 總數', value: `${player.egos.length} 個`, inline: true },
                { name: '📇 持有總人格數', value: `${player.identities.length} 個`, inline: true }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // ----------------- 檢查玩家 (!check) -----------------
    if (msg.startsWith('!check')) {
        const mention = message.mentions.users.first();
        const targetId = mention ? mention.id : message.author.id;
        const targetUser = mention ? mention : message.author;

        if (!db[targetId]) return message.reply('❌ 找不到該員的對齊紀錄。');
        const targetPlayer = db[targetId];

        const embed = new EmbedBuilder()
            .setTitle(`🔍 觀測罪人檔案: ${targetUser.username}`)
            .setColor(0x7209b7)
            .addFields(
                { name: '💎 狂氣殘額', value: `${targetPlayer.lunacy}`, inline: true },
                { name: '🎖️ 戰術等級', value: `Lv.${targetPlayer.level}`, inline: true },
                { name: '👤 當前裝備', value: `${targetPlayer.equipped || '無'}`, inline: false },
                { name: '📇 收集總計', value: `人格: ${targetPlayer.identities.length} | E.G.O: ${targetPlayer.egos.length}`, inline: false }
            );
        return message.reply({ embeds: [embed] });
    }

    // ----------------- 管理員發錢指令 -----------------
    if (msg.startsWith('!givelunacy')) {
        if (message.author.username !== ADMIN_ID && message.author.id !== ADMIN_ID) {
            return message.reply('❌ 權限同步失敗：您並非特定協議管理員 @sles_forever。');
        }
        const args = msg.split(/\s+/);
        const mention = message.mentions.users.first();
        const amount = parseInt(args[args.length - 1]);

        if (!mention || isNaN(amount)) return message.reply('❌ 指令語法瑕疵。範例：`!givelunacy @user 1300`');

        if (!db[mention.id]) checkAndRegisterPlayer(db, mention.id, mention.username);
        db[mention.id].lunacy += amount;
        savePlayerData(db);

        return message.reply(`✅ 成功向 <@${mention.id}> 的脈衝帳戶注入 **${amount}** 點狂氣！`);
    }

    // ----------------- 裝備系統 (!equip) -----------------
    if (msg.startsWith('!equip')) {
        const targetName = msg.replace('!equip', '').trim();
        if (!targetName) return message.reply('❌ 請指定您要投入作戰欄位的人格完整名稱。');
        const player = db[message.author.id];

        if (!player.identities.includes(targetName)) {
            return message.reply('❌ 您的儲藏庫中未包含此款人格，無法進行武裝裝備。');
        }

        player.equipped = targetName;
        savePlayerData(db);
        return message.reply(`🎯 裝備切換成功！當前主要共鳴人格變更為：**${targetName}**`);
    }

    // ----------------- 隊伍編制系統 (!team) -----------------
    if (msg.startsWith('!team')) {
        const player = db[message.author.id];
        const args = msg.split(' ');
        const subCmd = args[1];
        const targetChar = args.slice(2).join(' ').trim();

        if (!subCmd) {
            return message.reply(`👥 **當前 7 人編制隊伍：**\n${player.team.map((v, i) => `${i + 1}. ${v}`).join('\n') || '隊伍尚無成員。'}\n\n*提示：使用 \`!team add 人格名稱\` 或 \`!team remove 人格名稱\` 進行編制*`);
        }

        if (subCmd === 'add') {
            if (!targetChar) return message.reply('❌ 請填寫欲加入編組的人格名稱。');
            if (!player.identities.includes(targetChar)) return message.reply('❌ 您並未擁有此型號的人格。');
            if (player.team.includes(targetChar)) return message.reply('❌ 該人格已在出擊名單中。');
            if (player.team.length >= 7) return message.reply('❌ 戰術編組上限為 7 人，請先移除其他成員。');

            player.team.push(targetChar);
            savePlayerData(db);
            return message.reply(`✅ 成功將 **${targetChar}** 編入出擊名單。`);
        }

        if (subCmd === 'remove') {
            if (!targetChar) return message.reply('❌ 請填寫欲移出編組的人格名稱。');
            if (!player.team.includes(targetChar)) return message.reply('❌ 該人格不在目前的名單中。');

            player.team = player.team.filter(v => v !== targetChar);
            savePlayerData(db);
            return message.reply(`❌ 成功將 **${targetChar}** 自出擊名單中移除。`);
        }
    }

    // ----------------- 交易系統 (!trade) -----------------
    if (msg.startsWith('!trade')) {
        const mention = message.mentions.users.first();
        if (!mention) return message.reply('❌ 請標記您想發起物資交換的對象。範例：`!trade @user 我的角色 FOR 他的角色`');

        const tokenParts = msg.split(/\s+FOR\s+/i);
        if (tokenParts.length < 2) return message.reply('❌ 格式錯誤。請遵循語法：\`!trade @user 我的角色 FOR 他的角色\`');

        const senderSide = tokenParts[0].replace(/!trade\s+<@!?\d+>/, '').trim();
        const receiverSide = tokenParts[1].trim();

        const senderId = message.author.id;
        const receiverId = mention.id;

        if (!db[receiverId]) return message.reply('❌ 對方目前尚未建立心理共鳴對齊檔案。');

        const pSender = db[senderId];
        const pReceiver = db[receiverId];

        if (!pSender.identities.includes(senderSide)) return message.reply(`❌ 您的背包不存在：${senderSide}`);
        if (!pReceiver.identities.includes(receiverSide)) return message.reply(`❌ 對方的背包不存在：${receiverSide}`);

        // 建立雙向互動按鈕確認機制
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_trade').setLabel('接受交易').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('deny_trade').setLabel('拒絕交易').setStyle(ButtonStyle.Danger)
        );

        const tradeMsg = await message.reply({
            content: `🤝 <@${receiverId}>，主管 <@${senderId}> 提出了人格特許交易協議：\n向您交付：\`${senderSide}\`\n向您索取：\`${receiverSide}\`\n\n請雙方核對完畢後由接受者點擊按鈕執行。`,
            components: [row]
        });

        const collector = tradeMsg.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async (inter) => {
            if (inter.user.id !== receiverId) {
                return inter.reply({ content: '❌ 您並非此項交易協議的預定簽署者。', ephemeral: true });
            }

            if (inter.customId === 'accept_trade') {
                // 二次即時物資校驗防止複製Bug
                if (!pSender.identities.includes(senderSide) || !pReceiver.identities.includes(receiverSide)) {
                    return inter.update({ content: '❌ 協議簽署失敗：交易物資在傳輸期間發生變更，請重新申請。', components: [] });
                }

                pSender.identities = pSender.identities.filter(v => v !== senderSide);
                pReceiver.identities = pReceiver.identities.filter(v => v !== receiverSide);

                pSender.identities.push(receiverSide);
                pReceiver.identities.push(senderSide);

                savePlayerData(db);
                return inter.update({ content: `✅ 交易成功！<@${senderId}> 與 <@${receiverId}> 的資產已完成安全互換。`, components: [] });
            } else {
                return inter.update({ content: '❌ 交易協議已被拒絕收容。', components: [] });
            }
        });
    }

    // ----------------- 重製 UI 檢視系統 (!list 分頁) -----------------
    if (msg === '!list') {
        const player = db[message.author.id];
        const allItems = [...player.identities, ...player.egos.map(e => `[E.G.O] ${e}`)];
        if (!allItems.length) return message.reply('📭 背包空空如也。');

        const pageSize = 5;
        const totalPages = Math.ceil(allItems.length / pageSize);
        let currentPage = 0;

        const generateEmbed = (page) => {
            const start = page * pageSize;
            const end = start + pageSize;
            const currentItems = allItems.slice(start, end);

            return new EmbedBuilder()
                .setTitle(`🗂️ ${message.author.username} 的人格與武裝全清單`)
                .setColor(0x3a0ca3)
                .setDescription(currentItems.map((v, i) => `**${start + i + 1}.** ${v}`).join('\n\n'))
                .setFooter({ text: `頁數: ${page + 1} / ${totalPages}` });
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_list').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next_list').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
        );

        const listMsg = await message.reply({ embeds: [generateEmbed(currentPage)], components: [row] });
        const collector = listMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (inter) => {
            if (inter.user.id !== message.author.id) return inter.reply({ content: '這是別人的觀測清單。', ephemeral: true });

            if (inter.customId === 'prev_list' && currentPage > 0) currentPage--;
            if (inter.customId === 'next_list' && currentPage < totalPages - 1) currentPage++;

            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev_list').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
                new ButtonBuilder().setCustomId('next_list').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(currentPage === totalPages - 1)
            );

            await inter.update({ embeds: [generateEmbed(currentPage)], components: [newRow] });
        });
    }

    // ----------------- 尋找機器人 -----------------
    if (msg.startsWith('!尋找機器人') || msg.startsWith('!findbot')) {
        const args = msg.split(' ');
        if (args.length < 2) return message.reply('❌ 請輸入要尋找的機器人名稱！');
        const searchTerm = args.slice(1).join(' ').toLowerCase();
        try {
            if (!message.guild) return message.reply('❌ 只能在伺服器內使用此指令。');
            const members = await message.guild.members.fetch();
            const foundBots = members.filter(member => member.user.bot && member.user.username.toLowerCase().includes(searchTerm));
            if (foundBots.size === 0) return message.reply('🔍 找不到機器人。');
            let responseList = '📌 **找到相關機器人：**\n';
            foundBots.forEach(bot => { responseList += `🤖 **${bot.user.username}** (<@${bot.id}>)\n`; });
            return message.reply(responseList);
        } catch (error) {
            return message.reply('❌ 內部錯誤。');
        }
    }

    // ----------------- 鏡像衝突戰鬥關卡系統 (!stages) -----------------
    if (msg === '!stages') {
        const embed = new EmbedBuilder()
            .setTitle('🧭 邊獄巴士 - 鏡像迷宮觀測站')
            .setColor(0xf72585)
            .setDescription('請選擇欲派遣隊伍前往突入的心理防衛關卡難度。關卡難度越高，通關獲得的狂氣獎勵與危機程度越成正比。');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_stage')
            .setPlaceholder('選擇戰術挑戰難度...')
            .addOptions([
                { label: '沒難度 - 後巷流浪漢', description: '獎勵: 50 狂氣', value: 'stage_1' },
                { label: '輕鬆 - 後巷幫派', description: '獎勵: 100 狂氣', value: 'stage_2' },
                { label: '中等 - 協會成員', description: '獎勵: 200 狂氣', value: 'stage_3' },
                { label: '難 - 異想體收容洩漏', description: '獎勵: 400 狂氣', value: 'stage_4' },
                { label: '地獄 - 高階收尾人', description: '獎勵: 800 狂氣', value: 'stage_5' }
            ]);

        const row = new ActionRowBuilder().addComponents(menu);
        return message.reply({ embeds: [embed], components: [row] });
    }

    // ----------------- 幫助與清單導覽指令 -----------------
    if (msg === '!help' || msg === '!cmds') {
        const embed = new EmbedBuilder()
            .setTitle('📋 Angela 的中央控制核心指令總覽')
            .setColor(0x06d6a0)
            .setDescription('報告主管，當前所有常駐模組與拓展博弈系統已成功對齊完畢。')
            .addFields(
                { name: '🚀 抽取武裝', value: '`!pull` (單抽 130 狂氣) | `!10pulls` (十連抽 1300 狂氣，含高階等比保底)', inline: false },
                { name: '🎒 個人資產', value: '`!pack` (查看資產等級) | `!list` (分頁檢視擁有物) | `!check @user` (檢視他人檔案)', inline: false },
                { name: '⚔️ 戰術出擊', value: '`!team` (檢視或編制 7 人名單) | `!equip 完整名稱` (切換共鳴裝備) | `!stages` (挑戰核心關卡)', inline: false },
                { name: '🤝 生態互動', value: '`!trade @user 我的物品 FOR 他的物品` (安全防假冒交易協定)', inline: false },
                { name: '📡 狀態與輔助', value: '`!status` | `!checkrateupids` | `!testtweet` | `!limbusonline` | `!ego` | `!逆流`', inline: false }
            )
            .setFooter({ text: '主管，今天也請為了擴張「光之種」而努力。' });
        return message.reply({ embeds: [embed] });
    }
});

// ----------------- 處理下拉選單觸發的戰鬥核心邏輯 -----------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'select_stage') return;

    const db = loadPlayerData();
    const player = db[interaction.user.id];
    if (!player) return interaction.reply({ content: '❌ 請先發送任意訊息激活您的罪人對齊存檔。', ephemeral: true });

    if (!player.team || player.team.length === 0) {
        return interaction.reply({ content: '❌ 您的戰術出擊隊伍目前處於空置狀態。請先使用 `!team add` 增添成員！', ephemeral: true });
    }

    // 定義五大難度敵方參數
    const stageConfig = {
        stage_1: { name: '後巷流浪漢', hp: 200, clashPower: 7, coinPower: 2, reward: 50 },
        stage_2: { name: '後巷幫派', hp: 450, clashPower: 9, coinPower: 3, reward: 100 },
        stage_3: { name: '協會成員', hp: 800, clashPower: 11, coinPower: 3, reward: 200 },
        stage_4: { name: '異想體', hp: 1500, clashPower: 13, coinPower: 4, reward: 400 },
        stage_5: { name: '高階收尾人', hp: 2500, clashPower: 15, coinPower: 5, reward: 800 }
    };

    const selectedStage = stageConfig[interaction.values[0]];
    if (!selectedStage) return interaction.reply({ content: '關卡異常', ephemeral: true });

    await interaction.deferReply();

    // 實例化我方 7 人作戰名單數值
    const combatTeam = player.team.map(name => {
        // 從 identitiesData 推斷稀有度
        let detectedRarity = '0';
        for (const [rarity, list] of Object.entries(identitiesData.identities)) {
            if (list.includes(name)) { detectedRarity = rarity; break; }
        }
        return calculateIdentityStats(name, detectedRarity);
    });

    let enemyHp = selectedStage.hp;
    const battleLogs = [`🎬 **大腦皮層脈衝對齊！作戰開始：對抗『${selectedStage.name}』**`];
    let turn = 1;
    let victory = false;

    // Limbus Company 核心拼點模擬器迴圈
    while (turn <= 8 && enemyHp > 0 && combatTeam.some(s => s.hp > 0)) {
        battleLogs.push(`\n[回合 ${turn}]`);
        const aliveSinners = combatTeam.filter(s => s.hp > 0);
        
        // 隨機抽選一位存活的罪人進行本回合的速度對決與拼點
        const activeSinner = aliveSinners[Math.floor(Math.random() * aliveSinners.length)];
        
        // 隨機產生本回合的速度值
        const sinnerSpeed = Math.floor(Math.random() * activeSinner.speed) + 1;
        const enemySpeed = Math.floor(Math.random() * 5) + 1;

        battleLogs.push(`⚔️ 拼點攔截判定：**${activeSinner.name.substring(0,8)}...** (速 ${sinnerSpeed}) VS **${selectedStage.name}** (速 ${enemySpeed})`);

        // 模擬拼點隨機硬幣投擲
        let sinnerCoins = 3;
        let enemyCoins = 3;

        while (sinnerCoins > 0 && enemyCoins > 0) {
            let sHeads = 0;
            for(let c=0; c<sinnerCoins; c++) if(Math.random() > 0.4) sHeads++; // 模擬40%基礎機率硬幣正面
            const sinnerFinalPower = activeSinner.clashPower + (sHeads * activeSinner.coinPower);

            let eHeads = 0;
            for(let c=0; c<enemyCoins; c++) if(Math.random() > 0.45) eHeads++;
            const enemyFinalPower = selectedStage.clashPower + (eHeads * selectedStage.coinPower);

            if (sinnerFinalPower > enemyFinalPower) {
                enemyCoins--;
            } else if (enemyFinalPower > sinnerFinalPower) {
                sinnerCoins--;
            }
            // 平手則無消耗重置
        }

        if (sinnerCoins > 0) {
            // 我方拼點勝出，進行無情痛擊
            const damage = activeSinner.atk * sinnerCoins;
            enemyHp -= damage;
            battleLogs.push(`💥 **拼點獲勝！** 罪人對敵方造成了 **${damage}** 點物理創傷 (敵方剩餘 HP: ${Math.max(0, enemyHp)})`);
        } else {
            // 敵方拼點勝出，罪人重傷
            const dmgTaken = selectedStage.clashPower * enemyCoins;
            activeSinner.hp -= dmgTaken;
            battleLogs.push(`🔺 **拼點敗北！** 罪人受到了 **${dmgTaken}** 點精神反衝創傷 (罪人殘餘 HP: ${Math.max(0, activeSinner.hp)})`);
        }

        if (enemyHp <= 0) { victory = true; break; }
        turn++;
    }

    if (enemyHp <= 0) victory = true;

    const summaryEmbed = new EmbedBuilder().setTimestamp();

    if (victory) {
        player.lunacy += selectedStage.reward;
        player.level += 1; // 升級機制
        savePlayerData(db);
        summaryEmbed
            .setTitle('🏆 戰術勝利 - 腦葉種子提取成功')
            .setColor(0x00f5d4)
            .setDescription(`### **成功壓制：${selectedStage.name}**\n\n${battleLogs.slice(-3).join('\n')}\n\n**🎁 戰利品結算：**\n獲得 💎 **${selectedStage.reward}** 狂氣！\n主管核心等級提升至 **Lv.${player.level}**！`);
    } else {
        summaryEmbed
            .setTitle('🛑 戰術潰敗 - 遭遇心理逆流')
            .setColor(0xd90429)
            .setDescription(`### **隊伍全滅或作戰超時：${selectedStage.name}**\n\n${battleLogs.slice(-2).join('\n')}\n\n「主管，精神脈衝已斷開，請重新調整人格配給再試一次。」`);
    }

    return interaction.editReply({ embeds: [summaryEmbed] });
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => {
    console.error('❌ 機器人登入失敗：', err);
});
