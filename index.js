const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    AttachmentBuilder 
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
let globalRewardMultiplier = 1.0; 
let isDbReady = false; 

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
const DB_CHANNEL_ID = '1510947300212477972';

const ADMIN_ID = 'sles_forever'; 
const OWNER_ID = '1330463890122735642'; 

// ----------------- 罪人名稱辨識庫 (用於唯一性限制) -----------------
const SINNERS = [
    '李箱', '浮士德', '堂吉訶德', '良秀', '默爾索', '鴻璐', '希斯克利夫', 
    '以實瑪利', '羅佳', '辛克萊', '奧提斯', '格里高爾',
    'Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Ryoshu', 'Meursault', 
    'Hong Lu', 'Heathcliff', 'Ishmael', 'Rodion', 'Sinclair', 'Outis', 'Gregor'
];

function getSinnerName(identityString) {
    for (const s of SINNERS) {
        if (identityString.includes(s)) return s;
    }
    return null;
}

// ----------------- 資料庫存檔系統 (Discord 雲端版) -----------------
const DB_FILE = path.join(__dirname, 'players.json');

async function syncDBFromDiscord() {
    try {
        const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.warn('⚠️ 找不到指定的雲端備份頻道，將使用本地檔案。');
            return;
        }
        
        const messages = await channel.messages.fetch({ limit: 15 });
        const latestMsg = messages.find(m => m.author.id === client.user.id && m.attachments.size > 0);
        
        if (latestMsg) {
            const attachment = latestMsg.attachments.first();
            if (attachment && attachment.name === 'players.json') {
                console.log(`📥 正在從雲端下載最新資料庫...`);
                const response = await fetch(attachment.url);
                if (response.ok) {
                    const dataText = await response.text();
                    try {
                        const dataJson = JSON.parse(dataText);
                        fs.writeFileSync(DB_FILE, JSON.stringify(dataJson, null, 2), 'utf8');
                        console.log('✅ 雲端資料庫同步成功！已覆蓋本地檔案。');
                    } catch (parseErr) {
                        console.error('❌ JSON 解析失敗，使用本地檔案:', parseErr);
                    }
                }
                return;
            }
        }
        console.log('⚠️ 雲端尚未有有效備份，建立全新存檔。');
    } catch (err) {
        console.error('❌ 同步雲端資料庫錯誤:', err);
    }
}

let backupTimeout = null;
async function backupToDiscord() {
    try {
        const channel = await client.channels.fetch(DB_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        if (fs.existsSync(DB_FILE)) {
            const fileData = fs.readFileSync(DB_FILE, 'utf8');
            if (fileData.trim().length === 0) return; 

            const messages = await channel.messages.fetch({ limit: 10 });
            const myMsgs = messages.filter(m => m.author.id === client.user.id);
            for (const msg of myMsgs.values()) {
                await msg.delete().catch(() => null);
            }

            const file = new AttachmentBuilder(Buffer.from(fileData, 'utf8'), { name: 'players.json' });
            await channel.send({
                content: `📦 **自動備份** | 時間: <t:${Math.floor(Date.now() / 1000)}:F>`,
                files: [file]
            });
            console.log('☁️ 資料庫已同步至 Discord 雲端');
        }
    } catch (err) {
        console.error('❌ 備份至雲端失敗:', err);
    }
}

function loadPlayerData() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf8');
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function savePlayerData(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        if (backupTimeout) clearTimeout(backupTimeout);
        backupTimeout = setTimeout(() => backupToDiscord(), 2500); 
    } catch (e) {
        console.error("寫入存檔失敗:", e);
    }
}

function checkAndRegisterPlayer(db, userId, username) {
    if (!db[userId]) {
        const baseZeroIdentities = getIdentitiesByRarity('0') || [];
        db[userId] = {
            username: username,
            lunacy: 1300, 
            identities: [...baseZeroIdentities],
            egos: [],
            team: baseZeroIdentities.slice(0, 7), 
            equippedEgos: [], 
            level: 1,
            exp: 0,
            thread: 0,
            stageProgress: 1,
            lastDaily: 0
        };
        savePlayerData(db);
        return true;
    }
    if (!db[userId].egos) db[userId].egos = [];
    if (!db[userId].equippedEgos) db[userId].equippedEgos = [];
    if (!db[userId].team) db[userId].team = [];
    if (db[userId].level === undefined) db[userId].level = 1;
    if (db[userId].exp === undefined) db[userId].exp = 0;
    if (db[userId].thread === undefined) db[userId].thread = 0;
    if (db[userId].stageProgress === undefined) db[userId].stageProgress = 1;
    if (db[userId].lastDaily === undefined) db[userId].lastDaily = 0;
    return false;
}

// ----------------- 抽取與機率核心 -----------------
function getIdentitiesByRarity(rarity) {
    if (rarity === 'E.g.o') return identitiesData.identities['E.g.o'] || identitiesData.identities['Egos'] || [];
    if (rarity === 'ColorFixer') return identitiesData.identities['ColorFixer'] || identitiesData.identities['Color Fixer'] || [];
    return identitiesData.identities[rarity] || [];
}

const BASE_RATES = {
    'ColorFixer': 0.0000143,
    'Special': 0.001,
    '0000': 0.001,
    'E.g.o': 0.013,
    '000': 0.029,
    '00': 0.12,
    '0': 0.8359857
};

function rollRarity(isGuaranteed = false) {
    const rand = Math.random();
    if (isGuaranteed) {
        const totalPremiumWeight = 0.12 + 0.029 + 0.013 + 0.001 + 0.001 + 0.0000143; 
        const scaledRand = rand * totalPremiumWeight;
        if (scaledRand < 0.0000143) return 'ColorFixer';
        if (scaledRand < 0.0010143) return 'Special';
        if (scaledRand < 0.0020143) return '0000';
        if (scaledRand < 0.0150143) return 'E.g.o';
        if (scaledRand < 0.0440143) return '000';
        return '00';
    } else {
        if (rand < 0.0000143) return 'ColorFixer';
        if (rand < 0.0010143) return 'Special';
        if (rand < 0.0020143) return '0000';
        if (rand < 0.0150143) return 'E.g.o';
        if (rand < 0.0440143) return '000';
        if (rand < 0.1640143) return '00';
        return '0';
    }
}

const rateUpSource = identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {};
const RATE_UP_WEIGHT_MULTIPLIER = 5; 

function normalizeRateUpList(rarity) {
    let checkKey = rarity;
    if (rarity === 'E.g.o' && !rateUpSource['E.g.o']) checkKey = 'Egos';
    if (rarity === 'ColorFixer' && !rateUpSource['ColorFixer']) checkKey = 'Color Fixer';
    
    const value = rateUpSource[checkKey];
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return [value];
    if (typeof value === 'object') {
        if (Array.isArray(value.names)) return value.names.filter(Boolean);
        return [];
    }
    return [];
}

const pullIdentity = (rarity) => {
    const pool = getIdentitiesByRarity(rarity);
    if (!pool.length) return `（缺少實體角色資料：${rarity}）`;
    
    const upList = normalizeRateUpList(rarity);
    if (!upList.length) return pool[Math.floor(Math.random() * pool.length)];

    let weightedPool = [];
    pool.forEach(name => {
        const weight = upList.includes(name) ? RATE_UP_WEIGHT_MULTIPLIER : 1;
        for (let i = 0; i < weight; i++) weightedPool.push(name);
    });
    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
};

function rarityToStars(rarity) {
    if (rarity === 'ColorFixer') return '👑 Color Fixer';
    if (rarity === 'Special') return '🌀 Special';
    if (rarity === '0000') return '✨ ★★★★';
    if (rarity === 'E.g.o') return '🔮 E.G.O';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

function calculateIdentityStats(name, rarity) {
    let hp = 130, atk = 14, def = 11, speed = 4, clashPower = 8, coinPower = 2;
    if (rarity === '00') { hp = 160; atk = 16; clashPower = 10; coinPower = 3; }
    if (rarity === '000') { hp = 195; atk = 19; clashPower = 12; coinPower = 4; }
    if (rarity === '0000') { hp = 230; atk = 23; clashPower = 14; coinPower = 5; }
    if (rarity === 'Special') { hp = 260; atk = 25; clashPower = 15; coinPower = 5; }
    if (rarity === 'ColorFixer' || rarity === 'Color Fixer') { hp = 310; atk = 32; clashPower = 18; coinPower = 6; }
    if (rarity === 'E.g.o' || rarity === 'Egos') { hp = 200; atk = 22; clashPower = 16; coinPower = 4; }
    return { name, rarity, hp, maxHp: hp, atk, def, speed, sanity: 0, clashPower, coinPower, coins: 3 };
}

// ----------------- 網路連線安全控制 -----------------
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

app.get('/', (req, res) => { res.sendStatus(200); });
app.listen(PORT, () => { console.log(`網頁伺服器啟動於 ${PORT}`); });

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers ]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 已成功登入：${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: 'customstatus', type: 4, state: 'Sles被我吃掉了' }] });

    await syncDBFromDiscord();
    isDbReady = true;

    setInterval(() => { 
        checkSteamUpdates(false, null); 
        checkTwitterUpdates(false, null);
    }, 60 * 1000);

    checkSteamUpdates(false, null);
    checkTwitterUpdates(false, null);
});

// ----------------- 官方公告自動監測爬蟲 -----------------
async function checkTwitterUpdates(isManual = false, messageContext = null) {
    const node = NITTER_NODES[Math.floor(Math.random() * NITTER_NODES.length)];
    try {
        const response = await fetchWithTimeout(`${node}/${TARGET_USER.username}/rss`);
        if (!response.ok) return;
        const xml = await response.text();
        totalTweetsChecked++;

        const items = xml.split('<item>');
        if (items.length < 2) return;

        const latestItem = items[1];
        const titleMatch = latestItem.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || latestItem.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = latestItem.match(/<link>([\s\S]*?)<\/link>/);
        const guidMatch = latestItem.match(/<guid>([\s\S]*?)<\/guid>/);

        if (!guidMatch || !linkMatch) return;

        const guid = guidMatch[1].trim();
        const title = titleMatch ? titleMatch[1].trim() : '查看推文詳細內容';
        let link = linkMatch[1].trim().replace(/https:\/\/nitter\.[a-z.]+/g, 'https://x.com');

        if (!lastFetchedId && !isManual) { lastFetchedId = guid; return; }
        if (guid !== lastFetchedId || isManual) {
            if (!isManual) lastFetchedId = guid;

            const embed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company 官方推特最新公告`)
                .setURL(link)
                .setDescription(title.substring(0, 750) + (title.length > 750 ? '...' : ''))
                .setColor(0xf4a261)
                .setTimestamp();

            if (isManual && messageContext) {
                await messageContext.reply({ embeds: [embed] });
            } else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **官方 X (Twitter) 發布了最新動態！**`, embeds: [embed] });
            }
        }
    } catch (err) {
        console.error('推特觀測模組發生異常:', err);
    }
}

async function checkSteamUpdates(isManual = false, messageContext = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1');
        if (!response.ok) return;
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) return;

        if (!lastSteamNewsId && !isManual) { lastSteamNewsId = newsItem.gid; return; }
        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if (!isManual) lastSteamNewsId = newsItem.gid;
            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 450) + '...';
            const embed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company Steam 官方發布重大變更`)
                .setURL(newsItem.url)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}`)
                .setColor(0x1a3a6c)
                .setTimestamp();

            if (isManual && messageContext) await messageContext.reply({ embeds: [embed] });
            else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **邊獄巴士有全新 Steam 公告發布！**`, embeds: [embed] });
            }
        }
    } catch (err) {
        console.error('Steam 公告模組發生異常:', err);
    }
}

function getVisualWidth(str) {
    let width = 0;
    for (let i = 0; i < str.length; i++) width += str.charCodeAt(i) > 128 ? 2 : 1;
    return width;
}

// ----------------- 核心指令區 -----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!isDbReady) return message.reply('⏳ 系統正在從雲端載入人員資料庫，請稍候...');

    const db = loadPlayerData();
    const isNew = checkAndRegisterPlayer(db, message.author.id, message.author.username);
    if (isNew) savePlayerData(db);

    const msg = message.content.trim();
    const args = msg.split(/\s+/);

    // 1. 全指令手冊 (極重要核心功能補回)
    if (msg === '!cmds' || msg === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📑 邊獄公司管理部 — 系統控制終端指令集')
            .setDescription('報告主管，以下為當前控制台對應之全功能指令手冊：')
            .setColor(0x313131)
            .addFields(
                { name: '🧭 官方動態觀測', value: '`!steam` - 強制讀取官方 Steam 最新更動公告。\n`!tweet` 或 `!twitter` - 強制觀測官方 X (Twitter) 最新公告。', inline: false },
                { name: '🎲 腦葉大庫提取 (扭蛋系統)', value: '`!pull` - 消耗 💎 130 狂氣進行單次人格/E.G.O提取。\n`!10pulls` - 消耗 💎 1300 狂氣進行十連提取（第十抽保底 ★★ 以上）。\n`!list` - 開啟互動式不跳階面版，查閱各階級與各人格之精準概率。', inline: false },
                { name: '🎒 物資檢視與編組', value: '`!pack` - 開啟互動儲藏庫面版。可分頁查閱持有物、配置出擊戰隊（限7人且罪人唯一）與裝備 E.G.O。\n`!profile` 或 `!status` - 查閱主管個人的核心等級、總經驗值、紡織線與迷宮關卡進度。', inline: false },
                { name: '⚔️ 鏡像迷宮觀測 (戰鬥與進度)', value: '`!stages` - 挑選難度並派遣已編制戰隊進行戰術壓制。通關可獲取狂氣、經驗值並推進解鎖新關卡。', inline: false },
                { name: '🎁 日常物資發放', value: '`!daily` - 每日向管理部申領一次 💎 300 狂氣 與 🧵 10 紡織線。', inline: false }
            )
            .setFooter({ text: '※ 管理員專用指令組：!givelunacy, !givethread, !updaterewards, !updatebuff' })
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // 2. 官方動態強制爬取指令 (同步支援 !tweet / !twitter 與 !steam)
    if (msg === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(true, message);
    }

    if (msg === '!twitter' || msg === '!tweet') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(true, message);
    }

    // 每日簽到
    if (msg === '!daily') {
        const player = db[message.author.id];
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        if (now - player.lastDaily < oneDay) {
            const remaining = oneDay - (now - player.lastDaily);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            return message.reply(`⏳ 報告主管，您今天已經完成了補給簽到。請等待 ${hours} 小時 ${mins} 分鐘後再次申請。`);
        }
        player.lunacy += 300;
        player.thread += 10;
        player.lastDaily = now;
        savePlayerData(db);
        return message.reply('🎁 **今日腦葉物資已核發**：獲取了 💎 `300` 狂氣 與 🧵 `10` 紡織線！');
    }

    // 個人觀測檔案
    if (msg === '!profile' || msg === '!status') {
        const player = db[message.author.id];
        const expNeeded = player.level * 100;
        const progressPercent = Math.min(100, Math.floor((player.exp / expNeeded) * 100));
        const barLength = 10;
        const filled = Math.round((progressPercent / 100) * barLength);
        const bar = '■'.repeat(filled) + '□'.repeat(barLength - filled);

        const embed = new EmbedBuilder()
            .setTitle(`🗂️ 邊獄公司管理部 — 執行檔案 : ${message.author.username}`)
            .setColor(0x00ffffff)
            .addFields(
                { name: '🎖️ 核心觀測等級', value: `\`Lv. ${player.level}\` \n[${bar}] ${player.exp}/${expNeeded} (${progressPercent}%)`, inline: false },
                { name: '💎 現有狂氣', value: `\`${player.lunacy}\` 點`, inline: true },
                { name: '🧵 自我中心紡織線', value: `\`${player.thread}\` 條`, inline: true },
                { name: '🧭 當前迷宮觀測進度', value: `第 \`${player.stageProgress}\` 關卡`, inline: true },
                { name: '👥 當前配置小隊', value: `\`\`\`${player.team.join(', ') || '尚未編制部隊'}\`\`\``, inline: false }
            )
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // 權限管理指令組
    if (msg.startsWith('!givelunacy') || msg.startsWith('!updaterewards') || msg.startsWith('!updatebuff') || msg.startsWith('!givethread')) {
        if (message.author.id !== OWNER_ID && message.author.username !== ADMIN_ID) return;

        if (msg.startsWith('!givelunacy')) {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(targetUser ? args[2] : args[1]);
            if (isNaN(amount)) return message.reply('❌ 語法錯誤：`!givelunacy [@用戶] <數量>`');
            
            const targetId = targetUser ? targetUser.id : message.author.id;
            checkAndRegisterPlayer(db, targetId, targetUser ? targetUser.username : message.author.username);
            db[targetId].lunacy += amount;
            savePlayerData(db);
            return message.reply(`✅ 成功向 ${targetUser ? targetUser.username : '您自己'} 發放了 **${amount}** 點狂氣。`);
        }

        if (msg.startsWith('!givethread')) {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(targetUser ? args[2] : args[1]);
            if (isNaN(amount)) return message.reply('❌ 語法錯誤：`!givethread [@用戶] <數量>`');

            const targetId = targetUser ? targetUser.id : message.author.id;
            checkAndRegisterPlayer(db, targetId, targetUser ? targetUser.username : message.author.username);
            db[targetId].thread += amount;
            savePlayerData(db);
            return message.reply(`✅ 成功向 ${targetUser ? targetUser.username : '您自己'} 發放了 **${amount}** 條紡織線。`);
        }

        if (msg.startsWith('!updaterewards')) {
            const amount = parseInt(args[1]);
            if (isNaN(amount)) return message.reply('❌ 語法錯誤：`!updaterewards <數量>`');
            await message.channel.sendTyping();
            
            const members = await message.guild.members.fetch();
            let count = 0;
            members.forEach(member => {
                if (!member.user.bot) {
                    checkAndRegisterPlayer(db, member.user.id, member.user.username);
                    db[member.user.id].lunacy += amount;
                    count++;
                }
            });
            savePlayerData(db);
            return message.reply(`✅ 補償完畢！已為伺服器內 ${count} 位成員發放 **${amount}** 點狂氣。`);
        }

        if (msg.startsWith('!updatebuff')) {
            globalRewardMultiplier = parseFloat(args[1]) || 1.0;
            return message.reply(`⚙️ 全服鏡像關卡通關收益倍率調整為 **${globalRewardMultiplier}x**！`);
        }
    }

    // !list：精準排序不跳階
    if (msg === '!list') {
        const EXACT_RARITIES = ['0', '00', '000', 'E.g.o', '0000', 'ColorFixer', 'Special'];
        const ITEMS_PER_PAGE = 12; 
        const listPages = [];

        EXACT_RARITIES.forEach(rarity => {
            const pool = getIdentitiesByRarity(rarity);
            const poolSize = pool.length;
            const basePercent = BASE_RATES[rarity] ? (BASE_RATES[rarity] * 100).toFixed(4) : "0.0000";
            const upList = normalizeRateUpList(rarity);
            
            if (poolSize === 0) {
                listPages.push({ rarity, basePercent, poolSize, chunk: [], chunkIndex: 0, totalChunks: 1, upList, totalWeight: 0 });
            } else {
                let totalWeight = pool.reduce((acc, name) => acc + (upList.includes(name) ? RATE_UP_WEIGHT_MULTIPLIER : 1), 0);
                const totalChunks = Math.ceil(poolSize / ITEMS_PER_PAGE);
                for (let i = 0; i < totalChunks; i++) {
                    const chunk = pool.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
                    listPages.push({ rarity, basePercent, poolSize, chunk, chunkIndex: i, totalChunks, upList, totalWeight });
                }
            }
        });

        let currentPage = 0;

        const makeListEmbed = (pageIdx) => {
            const pageData = listPages[pageIdx];
            let desc = '';
            
            if (pageData.poolSize === 0) {
                desc = `\`* 該階級目前池內暫無可抽到的實體\``;
            } else {
                const displayLines = pageData.chunk.map(name => {
                    const isUp = pageData.upList.includes(name);
                    const weight = isUp ? RATE_UP_WEIGHT_MULTIPLIER : 1;
                    const individualPercent = ((BASE_RATES[pageData.rarity] * (weight / pageData.totalWeight)) * 100).toFixed(4);
                    const prefix = isUp ? `🔼 [UP] ${name}` : `• ${name}`;
                    const currentWidth = getVisualWidth(prefix);
                    const dots = ".".repeat(Math.max(2, 52 - currentWidth));
                    return `${prefix} ${dots} [${individualPercent}%]`;
                });
                desc = `• 階級總獲取概率: \`${pageData.basePercent}%\`\n• 總計實體: \`${pageData.poolSize}\` 名\n\n\`\`\`md\n${displayLines.join('\n')}\n\`\`\``;
            }

            return new EmbedBuilder()
                .setTitle('🗂️ 核心控制室 — 扭蛋池機率清單')
                .setColor(0x3a0ca3)
                .setDescription(`### ${rarityToStars(pageData.rarity)} (第 ${pageData.chunkIndex + 1}/${pageData.totalChunks} 頁)\n${desc}`)
                .setFooter({ text: `總分頁: ${pageIdx + 1} / ${listPages.length}` });
        };

        const makeListComponents = (pageIdx) => [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('list_prev').setLabel('◀ 上一階/頁').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === 0),
                new ButtonBuilder().setCustomId('list_next').setLabel('下一階/頁 ▶').setStyle(ButtonStyle.Primary).setDisabled(pageIdx === listPages.length - 1)
            )
        ];

        const listMsg = await message.reply({ embeds: [makeListEmbed(currentPage)], components: makeListComponents(currentPage) });
        const collector = listMsg.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: '❌ 請自行輸入 !list 開啟您的獨立面板。', ephemeral: true });
            if (interaction.customId === 'list_prev') currentPage--;
            if (interaction.customId === 'list_next') currentPage++;
            await interaction.update({ embeds: [makeListEmbed(currentPage)], components: makeListComponents(currentPage) });
        });
        return;
    }

    // !pull 與 !10pulls：重複抽取自動轉換紡織線功能
    if (msg === '!pull' || msg === '!10pulls') {
        const player = db[message.author.id];
        const cost = msg === '!10pulls' ? 1300 : 130;
        if (player.lunacy < cost) return message.reply(`❌ 狂氣不足！尚缺 ${cost - player.lunacy} 點。`);

        player.lunacy -= cost;
        const totalRolls = msg === '!10pulls' ? 10 : 1;
        const resultsText = [];

        for (let i = 1; i <= totalRolls; i++) {
            const rolledRarity = rollRarity(msg === '!10pulls' && i === 10);
            const finalCharacter = pullIdentity(rolledRarity);

            if (rolledRarity === 'E.g.o' || rolledRarity === 'Egos') {
                if (!player.egos.includes(finalCharacter)) {
                    player.egos.push(finalCharacter);
                    resultsText.push(`🔮 **${finalCharacter}** [${rarityToStars(rolledRarity)}] ✨ *NEW!*`);
                } else {
                    player.thread += 40; 
                    resultsText.push(`🔮 **${finalCharacter}** [${rarityToStars(rolledRarity)}] 🔁 *(重複 ➔ 🧵 +40 紡織線)*`);
                }
            } else {
                if (!player.identities.includes(finalCharacter)) {
                    player.identities.push(finalCharacter);
                    resultsText.push(`• **${finalCharacter}** [${rarityToStars(rolledRarity)}] ✨ *NEW!*`);
                } else {
                    let refundThread = 5;
                    if (rolledRarity === '00') refundThread = 15;
                    if (rolledRarity === '000') refundThread = 30;
                    if (rolledRarity === '0000') refundThread = 50;
                    if (rolledRarity === 'ColorFixer' || rolledRarity === 'Special') refundThread = 100;
                    
                    player.thread += refundThread;
                    resultsText.push(`• **${finalCharacter}** [${rarityToStars(rolledRarity)}] 🔁 *(重複 ➔ 🧵 +${refundThread} 紡織線)*`);
                }
            }
        }
        savePlayerData(db);

        const embed = new EmbedBuilder()
            .setTitle(msg === '!10pulls' ? '✨ 腦葉大庫 — 十連提取完成報告' : '🎯 腦葉大庫 — 單次提取完成報告')
            .setColor(0xffd166)
            .setDescription(resultsText.join('\n'));
        return message.reply({ embeds: [embed] });
    }

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
                    { name: '💎 狂氣', value: `${player.lunacy}`, inline: true },
                    { name: '🎖️ 核心', value: `Lv.${player.level}`, inline: true },
                    { name: '👥 出擊戰隊', value: `\`\`\`${player.team.join(', ') || '未編制'}\`\`\``, inline: false },
                    { name: '🔮 配戴 E.G.O', value: `\`\`\`${(player.equippedEgos || []).join(', ') || '未裝備'}\`\`\``, inline: false }
                )
                .setDescription(`### **持有清單 (${start + 1}~${Math.min(start + pageSize, allItems.length)} / ${allItems.length})**\n` + 
                    (currentItems.map((v, idx) => `**${start + idx + 1}.** ${v}`).join('\n') || '* 空 *'))
                .setFooter({ text: `分頁: ${page + 1} / ${totalPages}` });
        };

        const makeComponents = (page) => [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pack_prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('pack_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
                new ButtonBuilder().setCustomId('pack_setteam').setLabel('👥 隊伍').setStyle(ButtonStyle.Success).setDisabled(player.identities.length === 0),
                new ButtonBuilder().setCustomId('pack_setego').setLabel('🔮 E.G.O').setStyle(ButtonStyle.Secondary).setDisabled((player.egos || []).length === 0)
            )
        ];

        const packMsg = await message.reply({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
        const collector = packMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: '❌ 非您的儲藏庫。', ephemeral: true });

            if (interaction.customId === 'pack_prev') {
                currentPage--; await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_next') {
                currentPage++; await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_setteam') {
                const teamMenu = new StringSelectMenuBuilder()
                    .setCustomId('team_select_menu')
                    .setPlaceholder('選擇戰鬥人格(1~7人，同罪人不可重複)...')
                    .setMinValues(1).setMaxValues(Math.min(7, player.identities.length))
                    .addOptions(player.identities.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));

                await interaction.update({
                    content: '💡 **請挑選隊伍 (每位罪人限帶一種人格)：**',
                    embeds: [], components: [new ActionRowBuilder().addComponents(teamMenu)]
                });
            } else if (interaction.customId === 'pack_setego') {
                const egoMenu = new StringSelectMenuBuilder()
                    .setCustomId('ego_select_menu')
                    .setPlaceholder('選擇 E.G.O 裝備 (附加全隊能力)...')
                    .setMinValues(1).setMaxValues(Math.min(7, player.egos.length))
                    .addOptions(player.egos.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));

                await interaction.update({
                    content: '💡 **裝備 E.G.O (每件可提供全隊基礎 HP+15 與拼點加成+1)：**',
                    embeds: [], components: [new ActionRowBuilder().addComponents(egoMenu)]
                });
            }
        });
        return;
    }

    if (msg === '!stages') {
        const embed = new EmbedBuilder().setTitle('🧭 鏡像迷宮觀測站').setColor(0xf72585).setDescription(`當前伺服器收益倍率：**${globalRewardMultiplier}x**`);
        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_stage')
            .setPlaceholder('選擇戰術難度...')
            .addOptions([
                { label: '第一關：後巷流浪漢', description: `需要解鎖進度 1 | 收益 50 狂氣, 20 經驗值`, value: 'stage_1' },
                { label: '第二關：後巷幫派', description: `需要解鎖進度 2 | 收益 100 狂氣, 50 經驗值`, value: 'stage_2' },
                { label: '第三關：協會成員', description: `需要解鎖進度 3 | 收益 200 狂氣, 100 經驗值`, value: 'stage_3' },
                { label: '第四關：異想體觀測', description: `需要解鎖進度 4 | 收益 400 狂氣, 250 經驗值`, value: 'stage_4' },
                { label: '第五關：高階收尾人', description: `需要解鎖進度 5 | 收益 800 狂氣, 600 經驗值`, value: 'stage_5' }
            ]);
        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!isDbReady || (!interaction.isStringSelectMenu() && !interaction.isButton())) return;

    const db = loadPlayerData();
    const player = db[interaction.user.id];
    if (!player) return;

    // 處理出擊隊伍選擇 (限制同罪人不可重複)
    if (interaction.isStringSelectMenu() && interaction.customId === 'team_select_menu') {
        const selectedSinners = new Set();
        for (const idName of interaction.values) {
            const sinner = getSinnerName(idName);
            if (sinner) {
                if (selectedSinners.has(sinner)) {
                    return interaction.reply({ content: `❌ **配置失敗**：隊伍中不能同時裝備兩名以上的「**${sinner}**」。每個人格必須對應不同的罪人！`, ephemeral: true });
                }
                selectedSinners.add(sinner);
            }
        }
        player.team = interaction.values; 
        savePlayerData(db);
        return interaction.update({ content: `✅ 戰隊編制完畢！(共 ${player.team.length} 人已出擊)`, embeds: [], components: [] });
    }

    // 處理 E.G.O 裝備
    if (interaction.isStringSelectMenu() && interaction.customId === 'ego_select_menu') {
        player.equippedEgos = interaction.values;
        savePlayerData(db);
        return interaction.update({ content: `✅ E.G.O 裝備完畢！(共 ${player.equippedEgos.length} 件綁定完成)`, embeds: [], components: [] });
    }

    // 處理戰鬥階段 (內含等級提升、經驗結算、進度升級)
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_stage') {
        if (!player.team || player.team.length === 0) {
            return interaction.reply({ content: '❌ 請先使用 `!pack` 配置您的出擊小隊！', ephemeral: true });
        }

        const stages = {
            stage_1: { id: 1, name: '後巷流浪漢', hp: 90, cp: 5, rwd: 50, exp: 20 },
            stage_2: { id: 2, name: '後巷幫派', hp: 220, cp: 7, rwd: 100, exp: 50 },
            stage_3: { id: 3, name: '協會成員', hp: 450, cp: 9, rwd: 200, exp: 100 },
            stage_4: { id: 4, name: '異想體', hp: 900, cp: 11, rwd: 400, exp: 250 },
            stage_5: { id: 5, name: '高階收尾人', hp: 1500, cp: 14, rwd: 800, exp: 600 }
        };

        const targetStage = stages[interaction.values[0]];

        if (player.stageProgress < targetStage.id) {
            return interaction.reply({ content: `❌ **觀測權限不足**：您尚未解鎖此關卡。當前最大容許進度：第 **${player.stageProgress}** 關。`, ephemeral: true });
        }

        await interaction.deferReply();

        const egosCount = (player.equippedEgos || []).length;
        const hpBuff = egosCount * 15;
        const clashBuff = egosCount * 1;

        const levelMultiplier = 1 + (player.level - 1) * 0.05;
        const levelClashBonus = Math.floor((player.level - 1) * 0.2);

        const combatTeam = player.team.map(name => {
            let foundRarity = '0';
            for (const [r, list] of Object.entries(identitiesData.identities)) {
                if (list.includes(name)) { foundRarity = r; break; }
            }
            const stats = calculateIdentityStats(name, foundRarity);
            stats.hp = Math.round((stats.hp + hpBuff) * levelMultiplier);            
            stats.clashPower += clashBuff + levelClashBonus; 
            return stats;
        });

        let enemyHp = targetStage.hp;
        let turn = 1;
        let logs = [`🎬 **交戰『${targetStage.name}』** (E.G.O 增益: HP+${hpBuff}, 拼點+${clashBuff} | 等級增幅: ${Math.round(levelMultiplier*100)}%)`];

        while (turn <= 30 && enemyHp > 0 && combatTeam.some(s => s.hp > 0)) {
            const alive = combatTeam.filter(s => s.hp > 0);
            const active = alive[Math.floor(Math.random() * alive.length)];
            const sPower = active.clashPower + Math.floor(Math.random() * 3) * active.coinPower;
            const ePower = targetStage.cp + Math.floor(Math.random() * 3) * 2;

            if (sPower >= ePower) {
                const dmg = active.atk * 2; enemyHp -= dmg;
                logs.push(`[T${turn}] ⚔️ **勝** | ${active.name.substring(0,8)}... 造成 ${dmg} 傷害`);
            } else {
                const dmg = targetStage.cp * 2; active.hp -= dmg;
                logs.push(`[T${turn}] 🔺 **敗** | ${active.name.substring(0,8)}... 扣減 ${dmg} HP`);
            }
            turn++;
        }

        const victory = enemyHp <= 0;
        const endEmbed = new EmbedBuilder().setTimestamp();

        if (victory) {
            const rwdLunacy = Math.round(targetStage.rwd * globalRewardMultiplier);
            const rwdExp = targetStage.exp;
            
            player.lunacy += rwdLunacy;
            player.exp += rwdExp;

            let levelUpNotice = '';
            while (player.exp >= player.level * 100) {
                player.exp -= player.level * 100;
                player.level++;
                levelUpNotice = `\n🎊 **【核心階級觀測解禁】**：恭喜主管，您提升至了 **Lv.${player.level}**！戰隊整體基礎實力獲得永久成長！`;
            }

            if (player.stageProgress === targetStage.id && player.stageProgress < 5) {
                player.stageProgress++;
                levelUpNotice += `\n🧭 **【新區段觀測點解鎖】**：已獲准開拓第 **${player.stageProgress}** 關卡控制權。`;
            }

            savePlayerData(db);
            endEmbed.setTitle('🏆 戰術壓制成功').setColor(0x00f5d4)
                .setDescription(`${logs.slice(-4).join('\n')}\n\n**🎁 戰果結算：**\n核發 💎 **${rwdLunacy}** 狂氣！\n注入 🎖️ **${rwdExp}** 核心觀測經驗值。${levelUpNotice}`);
        } else {
            endEmbed.setTitle('🛑 隊伍潰散').setColor(0xd90429)
                .setDescription(`${logs.slice(-4).join('\n')}\n\n「主管，作戰失敗。請使用 \`!pack\` 調整編制、抽取更高級的人格，或者裝備更多 E.G.O 後重試。」`);
        }
        return interaction.editReply({ embeds: [endEmbed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(console.error);
