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
    'https://nitter.cz',
    'https://nitter.privacydev.net'
];

let lastFetchedId = null;
let lastSteamNewsId = null;

const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';
const DB_CHANNEL_ID = '1510947300212477972';

const ADMIN_ID = 'sles_forever'; 
const OWNER_ID = '1330463890122735642'; 

// ----------------- 12罪人名冊辨識庫 -----------------
const SINNERS = [
    '李箱', '浮士德', '堂吉訶德', '良秀', '默爾索', '鴻璐', '希斯克利夫', 
    '以實瑪利', '羅佳', '辛克萊', '奧提斯', '格里高爾'
];

function getSinnerName(identityString) {
    for (const s of SINNERS) {
        if (identityString.includes(s)) return s;
    }
    // 英文相容回退
    const enMap = {
        'Yi Sang': '李箱', 'Faust': '浮士德', 'Don Quixote': '堂吉訶德', 'Ryōshū': '良秀', 'Ryoshu': '良秀',
        'Meursault': '默爾索', 'Hong Lu': '鴻璐', 'Heathcliff': '希斯克利夫', 'Ishmael': '以實瑪利',
        'Rodion': '羅佳', 'Sinclair': '辛克萊', 'Outis': '奧提斯', 'Gregor': '格里高爾'
    };
    for (const [en, cn] of Object.entries(enMap)) {
        if (identityString.toLowerCase().includes(en.toLowerCase())) return cn;
    }
    return null;
}

// ----------------- 資料庫存檔系統 (Discord 雲端備份版) -----------------
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
                console.log(`📥 正在從雲端下載最新人員數據庫...`);
                const response = await fetch(attachment.url);
                if (response.ok) {
                    const dataText = await response.text();
                    try {
                        const dataJson = JSON.parse(dataText);
                        fs.writeFileSync(DB_FILE, JSON.stringify(dataJson, null, 2), 'utf8');
                        console.log('✅ 雲端資料庫同步成功！');
                    } catch (parseErr) {
                        console.error('❌ JSON 解析失敗，使用本地檔案:', parseErr);
                    }
                }
                return;
            }
        }
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
                content: `📦 **自動雲端備份存檔** | 安全防護時間: <t:${Math.floor(Date.now() / 1000)}:F>`,
                files: [file]
            });
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
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return {}; }
}

function savePlayerData(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
        if (backupTimeout) clearTimeout(backupTimeout);
        backupTimeout = setTimeout(() => backupToDiscord(), 2000); 
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
            identityLevels: {}, 
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
    if (!db[userId].identityLevels) db[userId].identityLevels = {};
    if (!db[userId].egos) db[userId].egos = [];
    if (!db[userId].equippedEgos) db[userId].equippedEgos = [];
    if (!db[userId].team) db[userId].team = [];
    return false;
}

// ----------------- 抽取與概率分配核心 -----------------
function getIdentitiesByRarity(rarity) {
    if (rarity === 'E.g.o') return identitiesData.identities['E.g.o'] || identitiesData.identities['Egos'] || [];
    if (rarity === 'ColorFixer') return identitiesData.identities['ColorFixer'] || identitiesData.identities['Color Fixer'] || [];
    return identitiesData.identities[rarity] || [];
}

const BASE_RATES = {
    'ColorFixer': 0.0000143, 'Special': 0.001, '0000': 0.001, 'E.g.o': 0.013, '000': 0.029, '00': 0.12, '0': 0.8359857
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
    return [];
}

const pullIdentity = (rarity) => {
    const pool = getIdentitiesByRarity(rarity);
    if (!pool.length) return `（數據缺失：${rarity}）`;
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

function calculateIdentityStats(name, rarity, idLevel = 1) {
    let hp = 130, atk = 14, def = 11, speed = 4, clashPower = 8, coinPower = 2;
    if (rarity === '00') { hp = 160; atk = 16; clashPower = 10; coinPower = 3; }
    if (rarity === '000') { hp = 195; atk = 19; clashPower = 12; coinPower = 4; }
    if (rarity === '0000') { hp = 230; atk = 23; clashPower = 14; coinPower = 5; }
    if (rarity === 'Special') { hp = 260; atk = 25; clashPower = 15; coinPower = 5; }
    if (rarity === 'ColorFixer') { hp = 310; atk = 32; clashPower = 18; coinPower = 6; }
    if (rarity === 'E.g.o') { hp = 200; atk = 22; clashPower = 16; coinPower = 4; }
    
    // 人格等級增幅 (最高60級實質成長)
    hp += (idLevel - 1) * 6;
    atk += Math.floor((idLevel - 1) * 0.4);
    clashPower += Math.floor((idLevel - 1) * 0.1);
    
    return { name, rarity, hp, maxHp: hp, atk, def, speed, clashPower, coinPower, coins: 3 };
}

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

app.get('/', (req, res) => { res.sendStatus(200); });
app.listen(PORT, () => { console.log(`內部控制端通訊埠開通：${PORT}`); });

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers ]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 系統就緒：${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: 'customstatus', type: 4, state: '管理部主控制台運作中' }] });
    await syncDBFromDiscord();
    isDbReady = true;

    setInterval(() => { 
        checkSteamUpdates(false, null); 
        checkTwitterUpdates(false, null);
    }, 90 * 1000);
});

// ----------------- 官方動態觀測安全檢測爬蟲 (解決無回應與節點當機問題) -----------------
async function checkTwitterUpdates(isManual = false, messageContext = null) {
    const node = NITTER_NODES[Math.floor(Math.random() * NITTER_NODES.length)];
    try {
        const response = await fetchWithTimeout(`${node}/${TARGET_USER.username}/rss`).catch(() => null);
        if (!response || !response.ok) {
            if (isManual && messageContext) return messageContext.reply(`❌ **觀測失敗**：官方 X (Nitter) 節點 \`${node}\` 連線超時或拒絕存取。請再次輸入指令重新調度線路。`);
            return;
        }
        const xml = await response.text();
        totalTweetsChecked++;
        const items = xml.split('<item>');
        if (items.length < 2) {
            if (isManual && messageContext) return messageContext.reply(`❌ **觀測失敗**：節點解析回傳結構異常，RSS 公告流為空。`);
            return;
        }

        const latestItem = items[1];
        const titleMatch = latestItem.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || latestItem.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = latestItem.match(/<link>([\s\S]*?)<\/link>/);
        const guidMatch = latestItem.match(/<guid>([\s\S]*?)<\/guid>/);

        if (!guidMatch || !linkMatch) {
            if (isManual && messageContext) return messageContext.reply(`❌ **解析故障**：推文特徵碼比對失敗。`);
            return;
        }

        const guid = guidMatch[1].trim();
        const title = titleMatch ? titleMatch[1].trim() : '查看推文詳細內容';
        let link = linkMatch[1].trim().replace(/https:\/\/nitter\.[a-z.]+/g, 'https://x.com');

        if (!lastFetchedId && !isManual) { lastFetchedId = guid; return; }
        if (guid !== lastFetchedId || isManual) {
            if (!isManual) lastFetchedId = guid;

            const embed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company 官方推特最新動態`)
                .setURL(link)
                .setDescription(title.substring(0, 750) + (title.length > 750 ? '...' : ''))
                .setColor(0xf4a261)
                .setTimestamp();

            if (isManual && messageContext) await messageContext.reply({ embeds: [embed] });
            else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **官方 X (Twitter) 發布了最新文件！**`, embeds: [embed] });
            }
        } else {
            if (isManual && messageContext) return messageContext.reply(`ℹ️ 報告主管，當前官方 X (Twitter) 未偵測到全新變更。`);
        }
    } catch (err) {
        if (isManual && messageContext) return messageContext.reply(`❌ **核心觀測模組崩潰**：${err.message}`);
    }
}

async function checkSteamUpdates(isManual = false, messageContext = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1').catch(() => null);
        if (!response || !response.ok) {
            if (isManual && messageContext) return messageContext.reply(`❌ **觀測失敗**：Steam 遠端 API 伺服器線路延遲過高，請稍候重試。`);
            return;
        }
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        if (!newsItem) {
            if (isManual && messageContext) return messageContext.reply(`❌ **觀測失敗**：無法獲取 Steam 對應 AppID 庫存資料。`);
            return;
        }

        if (!lastSteamNewsId && !isManual) { lastSteamNewsId = newsItem.gid; return; }
        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if (!isManual) lastSteamNewsId = newsItem.gid;
            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 450) + '...';
            const embed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company Steam 官方重大更新`)
                .setURL(newsItem.url)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}`)
                .setColor(0x1a3a6c)
                .setTimestamp();

            if (isManual && messageContext) await messageContext.reply({ embeds: [embed] });
            else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);
                if (channel) await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **邊獄巴士有全新 Steam 修正公告！**`, embeds: [embed] });
            }
        } else {
            if (isManual && messageContext) return messageContext.reply(`ℹ️ 報告主管，當前 Steam 伺服器存檔無更新更動。`);
        }
    } catch (err) {
        if (isManual && messageContext) return messageContext.reply(`❌ **Steam核心模組崩潰**：${err.message}`);
    }
}

// ----------------- 背包分頁 UI 核心生成器 (支援全域元件路由) -----------------
function createPackEmbedAndComponents(userId, username, page, db) {
    const player = db[userId];
    const allIdentities = player.identities || [];
    const allEgos = player.egos || [];
    const allItems = [
        ...allIdentities.map(id => ({ type: 'id', name: id })),
        ...allEgos.map(eg => ({ type: 'ego', name: eg }))
    ];

    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * pageSize;
    const currentItems = allItems.slice(start, start + pageSize);

    let descLines = [];
    currentItems.forEach((item, idx) => {
        const num = start + idx + 1;
        if (item.type === 'id') {
            const lvl = player.identityLevels?.[item.name] || 1;
            descLines.push(`**${num}.** ${item.name} *(Lv.${lvl}/60)*`);
        } else {
            descLines.push(`**${num}.** 🔮 [E.G.O] ${item.name}`);
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(`🎒 主管儲藏物資庫 — 持有物清單`)
        .setColor(0x4cc9f0)
        .addFields(
            { name: '💎 現有狂氣', value: `\`${player.lunacy}\``, inline: true },
            { name: '🧵 自我中心紡織線', value: `\`${player.thread}\` 條`, inline: true },
            { name: '🎖️ 核心觀測等階', value: `\`Lv.${player.level}\``, inline: true },
            { name: '👥 當前配置出擊戰隊', value: `\`\`\`${player.team.join(', ') || '未編制高階變體（自動指派基礎型態）'}\`\`\``, inline: false },
            { name: '🔮 配戴中 E.G.O', value: `\`\`\`${(player.equippedEgos || []).join(', ') || '尚未掛載增益'}\`\`\``, inline: false }
        )
        .setDescription(`### **持有總庫存 (${start + 1}~${Math.min(start + pageSize, allItems.length)} / ${allItems.length})**\n` + (descLines.join('\n') || '* 空無一物 *'))
        .setFooter({ text: `分頁控管: ${safePage + 1} / ${totalPages} | 提示: 隊伍改採12罪人獨立精準配置機制` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`p_prev_${userId}_${safePage}`).setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`p_next_${userId}_${safePage}`).setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(safePage === totalPages - 1),
        new ButtonBuilder().setCustomId(`p_teamhome_${userId}`).setLabel('👥 編組隊伍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`p_lvhome_${userId}`).setLabel('🔺 升級人格').setStyle(ButtonStyle.Danger).setDisabled(allIdentities.length === 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`p_egohome_${userId}`).setLabel('🔮 配置 E.G.O').setStyle(ButtonStyle.Secondary).setDisabled(allEgos.length === 0)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// 生成 12 罪人選擇面板的 4x3 按鈕矩陣
function createSinnerSelectionRows(userId) {
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    SINNERS.forEach((sinner, idx) => {
        if (idx > 0 && idx % 4 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
            new ButtonBuilder().setCustomId(`p_sinner_${userId}_${sinner}`).setLabel(sinner).setStyle(ButtonStyle.Secondary)
        );
    });
    rows.push(currentRow);
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`p_back_${userId}`).setLabel('🔙 返回主物資庫').setStyle(ButtonStyle.Primary)
    ));
    return rows;
}

// ----------------- 指令與控制台處理 -----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!isDbReady) return message.reply('⏳ 雲端高防護資料庫尚未安全卸載，請稍候...');

    const db = loadPlayerData();
    checkAndRegisterPlayer(db, message.author.id, message.author.username);

    const msg = message.content.trim();
    const args = msg.split(/\s+/);

    if (msg === '!cmds' || msg === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📑 邊獄公司管理部 — 系統控制終端指令集')
            .setColor(0x313131)
            .addFields(
                { name: '🧭 官方觀測模組', value: '`!steam` - 強制讀取並排查官方 Steam 最新變更。\n`!tweet` / `!twitter` - 強制經由安全備份節點獲取 X 最新動態。', inline: false },
                { name: '🎲 腦葉大庫提取 (扭蛋系統)', value: '`!pull` - 消耗 💎 130 狂氣。\n`!10pulls` - 消耗 💎 1300 狂氣（第十抽保底 ★★ 以上）。\n`!list` - 查閱各階級與各人格之精準概率。', inline: false },
                { name: '🎒 物資檢視與編組', value: '`!pack` - 開啟互動儲藏庫面版。內含**分頁顯示**、**12罪人獨立精準編隊**與**人格特訓升級**。\n`!levelup <人格全名>` - 直接為特定人格灌注紡織線突破等級。', inline: false },
                { name: '⚔️ 鏡像迷宮觀測 (戰鬥與進度)', value: '`!stages` - 派遣已編制戰隊進行戰術壓制。人格等級將實質增幅戰力。', inline: false },
                { name: '🎁 日常發放', value: '`!daily` - 每日申領 💎 300 狂氣 與 🧵 10 紡織線。', inline: false }
            ).setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    if (msg === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(true, message);
    }
    if (msg === '!twitter' || msg === '!tweet') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(true, message);
    }

    // 獨立強制升級指令（解決 UI 被砍斷問題）
    if (msg.startsWith('!levelup')) {
        const targetIdName = msg.replace('!levelup', '').trim();
        if (!targetIdName) return message.reply('❌ **語法規範錯誤**：請輸入 `!levelup <完整人格名稱>`\n*例如：`!levelup 劍啟 李箱`*');

        const player = db[message.author.id];
        if (!player.identities.includes(targetIdName)) return message.reply('❌ **特訓駁回**：主管，您的資產庫中並未持有該特定人格實體！');

        const currentLvl = player.identityLevels[targetIdName] || 1;
        if (currentLvl >= 60) return message.reply('❌ **強化封頂**：該人格已達到當前容許的最高觀測等級 60 級。');

        const cost = 5;
        if (player.thread < cost) return message.reply(`❌ **紡織線短缺**：升級需要 🧵 \`${cost}\` 條，您目前剩餘 🧵 \`${player.thread}\` 條。`);

        player.thread -= cost;
        player.identityLevels[targetIdName] = currentLvl + 1;
        savePlayerData(db);
        return message.reply(`🔺 **核心等階突破成功**！\n**${targetIdName}** 成功由 Lv.${currentLvl} 晉升至 **Lv.${currentLvl + 1}**！ (消耗 🧵 ${cost} 紡織線)`);
    }

    // 每日簽到
    if (msg === '!daily') {
        const player = db[message.author.id];
        const now = Date.now();
        if (now - player.lastDaily < 24 * 60 * 60 * 1000) {
            const rem = (24 * 60 * 60 * 1000) - (now - player.lastDaily);
            return message.reply(`⏳ 補給線冷卻中：請等待 ${Math.floor(rem/(60*60*1000))} 小時 ${Math.floor((rem%(60*60*1000))/(60*1000))} 分鐘後再次申請。`);
        }
        player.lunacy += 300; player.thread += 10; player.lastDaily = now;
        savePlayerData(db);
        return message.reply('🎁 **物資核發成功**：獲取了 💎 `300` 狂氣 與 🧵 `10` 紡織線！');
    }

    // 主背包觸發點
    if (msg === '!pack') {
        const payload = createPackEmbedAndComponents(message.author.id, message.author.username, 0, db);
        return message.reply(payload);
    }

    // 抽卡重複分配比例重製調整 (1, 5, 10, 15)
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

            if (rolledRarity === 'E.g.o') {
                if (!player.egos.includes(finalCharacter)) {
                    player.egos.push(finalCharacter);
                    resultsText.push(`🔮 **${finalCharacter}** [${rarityToStars(rolledRarity)}] ✨ *NEW!*`);
                } else {
                    player.thread += 15; // 變更：EGO重複固定為 15
                    resultsText.push(`🔮 **${finalCharacter}** [${rarityToStars(rolledRarity)}] 🔁 *(重複 ➔ 🧵 +15)*`);
                }
            } else {
                if (!player.identities.includes(finalCharacter)) {
                    player.identities.push(finalCharacter);
                    resultsText.push(`• **${finalCharacter}** [${rarityToStars(rolledRarity)}] ✨ *NEW!*`);
                } else {
                    let refund = 1; // 變更分配比例：★ ➔ 1
                    if (rolledRarity === '00') refund = 5;       // ★★ ➔ 5
                    if (rolledRarity === '000') refund = 10;     // ★★★ ➔ 10
                    if (rolledRarity === '0000' || rolledRarity === 'ColorFixer' || rolledRarity === 'Special') refund = 15; // 高階 ➔ 15
                    
                    player.thread += refund;
                    resultsText.push(`• **${finalCharacter}** [${rarityToStars(rolledRarity)}] 🔁 *(重複 ➔ 🧵 +${refund})*`);
                }
            }
        }
        savePlayerData(db);
        const embed = new EmbedBuilder().setTitle('🎯 腦葉提取結果報告').setColor(0xffd166).setDescription(resultsText.join('\n'));
        return message.reply({ embeds: [embed] });
    }

    if (msg === '!stages') {
        const embed = new EmbedBuilder().setTitle('🧭 鏡像迷宮觀測站').setColor(0xf72585).setDescription(`當前全服收益倍率：**${globalRewardMultiplier}x**\n提示：上場高階人格之等階(最高60)將顯著拉升勝率！`);
        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_stage')
            .setPlaceholder('選擇戰術難度...')
            .addOptions([
                { label: '第一關：後巷流浪漢', description: `需要進度 1 | 基礎 50 狂氣, 20 經驗`, value: 'stage_1' },
                { label: '第二關：後巷幫派', description: `需要進度 2 | 基礎 100 狂氣, 50 經驗`, value: 'stage_2' },
                { label: '第三關：協會成員', description: `需要進度 3 | 基礎 200 狂氣, 100 經驗`, value: 'stage_3' },
                { label: '第四關：異想體觀測', description: `需要進度 4 | 基礎 400 狂氣, 250 經驗`, value: 'stage_4' },
                { label: '第五關：高階收尾人', description: `需要進度 5 | 基礎 800 狂氣, 600 經驗`, value: 'stage_5' }
            ]);
        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // 後台物資調度權限
    if ((msg.startsWith('!givelunacy') || msg.startsWith('!givethread')) && (message.author.id === OWNER_ID || message.author.username === ADMIN_ID)) {
        const targetUser = message.mentions.users.first();
        const amt = parseInt(targetUser ? args[2] : args[1]) || 0;
        const tid = targetUser ? targetUser.id : message.author.id;
        checkAndRegisterPlayer(db, tid, targetUser ? targetUser.username : message.author.username);
        if (msg.startsWith('!givelunacy')) db[tid].lunacy += amt;
        else db[tid].thread += amt;
        savePlayerData(db);
        return message.reply(`✅ 已成功向該控制權限注入指定物資。`);
    }
});

// ----------------- 全域元件路由攔截系統 (完美翻頁、升級、12罪人編隊) -----------------
client.on('interactionCreate', async (interaction) => {
    if (!isDbReady) return;
    const db = loadPlayerData();
    const userId = interaction.user.id;
    const player = db[userId];
    if (!player) return;

    const customId = interaction.customId;
    if (customId && customId.startsWith('p_')) {
        const parts = customId.split('_');
        const targetUserId = parts[2];

        // 身分安全校驗
        if (userId !== targetUserId) {
            return interaction.reply({ content: '❌ 權限駁回：您無法觸發他人呼叫的核心背包控制台。', ephemeral: true });
        }

        const action = parts[1];

        // 1. 基礎翻頁系統
        if (action === 'prev' || action === 'next') {
            let page = parseInt(parts[3]);
            page = (action === 'prev') ? page - 1 : page + 1;
            return interaction.update(createPackEmbedAndComponents(userId, interaction.user.username, page, db));
        }

        // 2. 退回主介面
        if (action === 'back') {
            return interaction.update(createPackEmbedAndComponents(userId, interaction.user.username, 0, db));
        }

        // 3. 12罪人主按鈕面板
        if (action === 'teamhome') {
            return interaction.update({
                content: '👥 **邊獄公司控制台 — 12罪人獨立戰隊編制模組**\n報告主管，點擊下方對應罪人按鈕，即可指派或抽換該罪人出擊的高階人格變體。未指定者，出擊時將自動配置最基礎的一星型態。',
                embeds: [], components: createSinnerSelectionRows(userId)
            });
        }

        // 4. 個別罪人點選分支
        if (action === 'sinner') {
            const sinnerName = parts[3];
            const ownedIds = player.identities.filter(id => getSinnerName(id) === sinnerName);
            const currentEquipped = player.team.find(id => getSinnerName(id) === sinnerName) || '預設基礎型態（一星）';

            const embed = new EmbedBuilder()
                .setTitle(`👥 戰隊編制變體庫 — 罪人：${sinnerName}`)
                .setColor(0xf1c40f)
                .setDescription(`當前配置高階人格：**${currentEquipped}**\n\n請從下方下拉選單挑選您在此人名下持有的變體。選擇解除或更換將會自動對應，徹底鎖死重複上場衝突：`);

            const options = ownedIds.map(id => {
                const lvl = player.identityLevels[id] || 1;
                return { label: `${id.substring(0, 20)} (Lv.${lvl})`, value: id };
            });
            options.unshift({ label: '❌ 解除高階變體指派 (回歸基礎一星)', value: 'unequip' });

            const menuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`p_sinsel_${userId}_${sinnerName}`)
                    .setPlaceholder(`指派 ${sinnerName} 的戰鬥型態...`)
                    .addOptions(options.slice(0, 25))
            );
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_teamhome_${userId}`).setLabel('🔙 返回罪人名冊').setStyle(ButtonStyle.Primary)
            );

            return interaction.update({ content: null, embeds: [embed], components: [menuRow, backRow] });
        }

        // 5. 罪人選單指派綁定處理
        if (action === 'sinsel') {
            const sinnerName = parts[3];
            const selectedVal = interaction.values[0];

            // 完美的自動解鎖同罪人衝突：先徹底把這名罪人的任何高階人格從陣列移出
            player.team = player.team.filter(id => getSinnerName(id) !== sinnerName);
            if (selectedVal !== 'unequip') {
                player.team.push(selectedVal);
            }
            savePlayerData(db);

            return interaction.update({
                content: `✅ 已成功更新 罪人【${sinnerName}】的戰術人格配置。`,
                embeds: [], components: createSinnerSelectionRows(userId)
            });
        }

        // 6. 人格特訓升級面板 (內建 1~25 選單，超量支援文字指令)
        if (action === 'lvhome') {
            const embed = new EmbedBuilder()
                .setTitle('🔺 管理部特訓室 — 人格等階同步強化')
                .setColor(0xe74c3c)
                .setDescription(`灌注 🧵 **紡織線** 來全面拉升指定人格實力（當前餘額：🧵 \`${player.thread}\` 條）。\n等階極限：**60 級**。\n\n**消耗標準：每升一級消耗固定 5 條紡織線。**\n\n*💡 提示：若人格數超量而未出現在選單中，可隨時在文字頻道輸入 \`!levelup <人格全名>\` 實施強制作業。*`);

            const options = player.identities.slice(0, 25).map(id => {
                const lvl = player.identityLevels[id] || 1;
                return { label: `${id.substring(0, 20)} (Lv.${lvl})`, value: id };
            });

            const comps = [];
            if (options.length > 0) {
                comps.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`p_lvlsel_${userId}`).setPlaceholder('選擇欲突破等級之實體...').addOptions(options)
                ));
            }
            comps.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`p_back_${userId}`).setLabel('🎒 返回物資庫').setStyle(ButtonStyle.Primary)
            ));

            return interaction.update({ content: null, embeds: [embed], components: comps });
        }

        // 7. 特訓選單升級實作
        if (action === 'lvlsel') {
            const selectedId = interaction.values[0];
            const currentLvl = player.identityLevels[selectedId] || 1;

            if (currentLvl >= 60) {
                return interaction.reply({ content: `❌ 該型態觀測等級已達目前上限 60 級！`, ephemeral: true });
            }
            const cost = 5;
            if (player.thread < cost) {
                return interaction.reply({ content: `❌ 紡織線儲量不足，無法完成此階段突破！`, ephemeral: true });
            }

            player.thread -= cost;
            player.identityLevels[selectedId] = currentLvl + 1;
            savePlayerData(db);

            // 原界面更新渲染
            const embed = new EmbedBuilder()
                .setTitle('🔺 管理部特訓室 — 人格等階同步強化')
                .setColor(0xe74c3c)
                .setDescription(`✅ **成功將 [${selectedId}] 提升至 Lv.${currentLvl + 1}**！\n\n目前剩餘資源：🧵 \`${player.thread}\` 條。\n*提示：若需要進一步升級，可繼續操作選單或輸入指令。*`);

            const options = player.identities.slice(0, 25).map(id => {
                const lvl = player.identityLevels[id] || 1;
                return { label: `${id.substring(0, 20)} (Lv.${lvl})`, value: id };
            });

            const comps = [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`p_lvlsel_${userId}`).setPlaceholder('選擇欲突破等級之實體...').addOptions(options)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`p_back_${userId}`).setLabel('🎒 返回物資庫').setStyle(ButtonStyle.Primary)
                )
            ];
            return interaction.update({ embeds: [embed], components: comps });
        }

        // 8. E.G.O 設定面板
        if (action === 'egohome') {
            const embed = new EmbedBuilder()
                .setTitle('🔮 E.G.O 全戰隊精神同步')
                .setColor(0x9d4edf)
                .setDescription(`請指派欲配戴啟動的 E.G.O 特徵碼（可多選，上限 7 件）：`);
            const egoMenu = new StringSelectMenuBuilder()
                .setCustomId(`p_egosel_${userId}`)
                .setPlaceholder('勾選 E.G.O 裝備實體...')
                .setMinValues(1).setMaxValues(Math.min(7, player.egos.length))
                .addOptions(player.egos.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));

            return interaction.update({
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(egoMenu),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`p_back_${userId}`).setLabel('🎒 返回物資庫').setStyle(ButtonStyle.Primary))
                ]
            });
        }

        // 9. E.G.O 多選處理
        if (action === 'egosel') {
            player.equippedEgos = interaction.values;
            savePlayerData(db);
            const payload = createPackEmbedAndComponents(userId, interaction.user.username, 0, db);
            return interaction.update({ content: '✅ E.G.O 多維度共鳴配置完畢。', ...payload });
        }
    }

    // ----------------- 實質等級乘算戰鬥模組 -----------------
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_stage') {
        const stages = {
            stage_1: { id: 1, name: '後巷流浪漢', hp: 90, cp: 5, rwd: 50, exp: 20 },
            stage_2: { id: 2, name: '後巷幫派', hp: 220, cp: 7, rwd: 100, exp: 50 },
            stage_3: { id: 3, name: '協會成員', hp: 450, cp: 9, rwd: 200, exp: 100 },
            stage_4: { id: 4, name: '異想體觀測', hp: 900, cp: 11, rwd: 400, exp: 250 },
            stage_5: { id: 5, name: '高階收尾人', hp: 1500, cp: 14, rwd: 800, exp: 600 }
        };

        const targetStage = stages[interaction.values[0]];
        if (player.stageProgress < targetStage.id) {
            return interaction.reply({ content: `❌ **權限隔離**：未解鎖該觀測點。最大可進入：第 **${player.stageProgress}** 關。`, ephemeral: true });
        }

        await interaction.deferReply();

        const egosCount = (player.equippedEgos || []).length;
        const hpBuff = egosCount * 15;
        const clashBuff = egosCount * 1;

        // 主管核心等級加成
        const levelMultiplier = 1 + (player.level - 1) * 0.04;
        const levelClashBonus = Math.floor((player.level - 1) * 0.15);

        // 重構戰隊加載邏輯（高階與基礎一星相容）
        let activeTeamNames = [...player.team];
        
        // 確保至少填滿罪人框架（若隊伍不滿7人，自動調度基礎人格補上直到上限或足夠）
        if (activeTeamNames.length === 0) {
            const basePool = getIdentitiesByRarity('0');
            activeTeamNames = basePool.slice(0, 7);
        }

        const combatTeam = activeTeamNames.map(name => {
            let foundRarity = '0';
            for (const [r, list] of Object.entries(identitiesData.identities)) {
                if (list.includes(name)) { foundRarity = r; break; }
            }
            // 讀取該人格的精準強化等階
            const idLevel = player.identityLevels[name] || 1;
            const stats = calculateIdentityStats(name, foundRarity, idLevel);
            
            stats.hp = Math.round((stats.hp + hpBuff) * levelMultiplier);            
            stats.clashPower += clashBuff + levelClashBonus; 
            return stats;
        });

        let enemyHp = targetStage.hp;
        let turn = 1;
        let logs = [`🎬 **交戰『${targetStage.name}』** (E.G.O 拼點修正: +${clashBuff})`];

        while (turn <= 35 && enemyHp > 0 && combatTeam.some(s => s.hp > 0)) {
            const alive = combatTeam.filter(s => s.hp > 0);
            const active = alive[Math.floor(Math.random() * alive.length)];
            
            const sPower = active.clashPower + Math.floor(Math.random() * 3) * active.coinPower;
            const ePower = targetStage.cp + Math.floor(Math.random() * 3) * 2;

            if (sPower >= ePower) {
                const dmg = active.atk * 2; enemyHp -= dmg;
                logs.push(`[T${turn}] ⚔️ **勝** | ${active.name.substring(0,8)} 造成 ${dmg} 傷害`);
            } else {
                const dmg = targetStage.cp * 2; active.hp -= dmg;
                logs.push(`[T${turn}] 🔺 **敗** | ${active.name.substring(0,8)} 扣減 ${dmg} HP`);
            }
            turn++;
        }

        const victory = enemyHp <= 0;
        const endEmbed = new EmbedBuilder().setTimestamp();

        if (victory) {
            const rwdLunacy = Math.round(targetStage.rwd * globalRewardMultiplier);
            player.lunacy += rwdLunacy; player.exp += targetStage.exp;

            let extraMsg = '';
            while (player.exp >= player.level * 100) {
                player.exp -= player.level * 100; player.level++;
                extraMsg += `\n🎊 **【管理部權限升級】**：主管等級提升至 **Lv.${player.level}**！`;
            }
            if (player.stageProgress === targetStage.id && player.stageProgress < 5) {
                player.stageProgress++;
                extraMsg += `\n🧭 **【新觀測區段突破】**：已獲准開拓解鎖第 **${player.stageProgress}** 關卡。`;
            }

            savePlayerData(db);
            endEmbed.setTitle('🏆 迷宮戰術壓制成功').setColor(0x00f5d4)
                .setDescription(`${logs.slice(-4).join('\n')}\n\n**🎁 戰果核發：**\n核發 💎 **${rwdLunacy}** 狂氣！\n注入 🎖️ **${targetStage.exp}** 核心觀測經驗。${extraMsg}`);
        } else {
            endEmbed.setTitle('🛑 作戰失敗').setColor(0xd90429)
                .setDescription(`${logs.slice(-4).join('\n')}\n\n「主管，作戰小隊已被強制遣回。請利用 \`!pack\` 的『12罪人獨立編隊』調整出擊高階變體，或為高戰力人格實施『🔺升級人格』特訓。」`);
        }
        return interaction.editReply({ embeds: [endEmbed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(console.error);
