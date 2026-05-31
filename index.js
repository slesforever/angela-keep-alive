const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const express = require('express');
const fs = require('fs');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const identitiesData = require('./identitiesData.js');

// ==================== 💾 檔案館持久化資料庫系統 ====================
const DB_FILE = './players.json';
let playersDB = {};

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            playersDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            console.log('💾 檔案館 (players.json) 讀取成功！');
        } catch (e) {
            console.error('❌ 資料庫讀取失敗，已初始化全新檔案庫。', e);
            playersDB = {};
        }
    } else {
        saveDatabase();
    }
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(playersDB, null, 4), 'utf8');
}

function getPlayer(userId) {
    if (!playersDB[userId]) {
        playersDB[userId] = {
            lunacy: 0,
            inventory: {},
            egos: {},
            team: [],
            equipped: null,
            level: 1,
            exp: 0,
            thread: 0,
            stageProgress: 0
        };
        const baseSinners = identitiesData.identities?.['0'] || identitiesData['0'] || [];
        baseSinners.forEach(sinner => {
            const name = typeof sinner === 'string' ? sinner : sinner.name;
            if (name) playersDB[userId].inventory[name] = 1;
        });
        saveDatabase();
    }
    return playersDB[userId];
}

// ==================== 🌐 網頁伺服器設定 ====================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.sendStatus(200));
app.listen(PORT, () => console.log(`網頁伺服器啟動於通訊埠 ${PORT}`));

// ==================== 📡 系統常數與觀測設定 ====================
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

const TARGET_USER = { username: 'LimbusCompany_B' };
const NITTER_NODES = [
    'https://nitter.net', 
    'https://nitter.cz', 
    'https://nitter.poast.org',
    'https://nitter.privacydev.net'
];

let lastTweetId = null;
let lastSteamNewsId = null;
const activeTrades = new Map(); // 交易系統狀態機

// ==================== 🎲 機率與抽卡核心 ====================
const RARITY_RATES = {
    'Special': 0.0001,
    '0000': 0.0050,
    'Egos': 0.0130,
    '000': 0.0290,
    '00': 0.1500,
    '0': 0.8029
};

const rateUpSource = identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {};

function buildRarity() {
    const r = Math.random();
    if (r < 0.0001) return 'Special';
    if (r < 0.0051) return '0000';
    if (r < 0.0181) return 'Egos';
    if (r < 0.0471) return '000';
    if (r < 0.1971) return '00';
    return '0';
}

function buildRarityGuaranteed() {
    const totalWeight = 0.1971; 
    const r = Math.random() * totalWeight;
    if (r < 0.0001) return 'Special';
    if (r < 0.0051) return '0000';
    if (r < 0.0181) return 'Egos';
    if (r < 0.0471) return '000';
    return '00'; 
}

function rarityToStars(rarity) {
    if (rarity === 'Special') return '⚠️ [👁️ 色彩收尾人 / 特殊]';
    if (rarity === '0000') return '👑 ★★★★';
    if (rarity === 'Egos') return '⚔️ E.G.O 同步';
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
        if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
    }
    return [];
}

function pickRateUp(rarity) {
    const list = normalizeRateUpList(rarity);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function getBaseIdentity(rarity) {
    const pool = identitiesData.identities?.[rarity] || identitiesData[rarity] || [];
    if (pool.length > 0) {
        const item = pool[Math.floor(Math.random() * pool.length)];
        return typeof item === 'string' ? item : (item.name || '未知實體');
    }
    return `（種類 ${rarity} 資料缺失）`;
}

// ==================== 📡 觀測系統 (Twitter + Steam) ====================
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }).finally(() => clearTimeout(timeout));
}

async function checkTwitterUpdates(manual = false, interaction = null) {
    let success = false;
    let errorLog = [];
    
    for (const nodeUrl of NITTER_NODES) {
        try {
            const response = await fetchWithTimeout(`${nodeUrl}/${TARGET_USER.username}/rss`);
            if (!response.ok) {
                errorLog.push(`${nodeUrl} (Status: ${response.status})`);
                continue;
            }
            const text = await response.text();
            const linkMatch = text.match(/<link>(.*?)<\/link>/g)?.[1];
            const guidMatch = text.match(/<guid[^>]*>(.*?)<\/guid>/);
            
            if (linkMatch && guidMatch) {
                success = true;
                const link = linkMatch.replace('<link>', '').replace('</link>', '').replace('http://', 'https://');
                const id = guidMatch[1];
                
                if (!lastTweetId) {
                    lastTweetId = id; 
                    if (manual && interaction) await interaction.reply(`✅ 成功連線推特節點，並建立初始快取 (${id})。`);
                } else if (id !== lastTweetId || manual) {
                    if (!manual) lastTweetId = id;
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    const msg = `🔔 ${PING_ROLE_MENTION} **[Twitter官方公告]**\n${link.replace('twitter.com', 'vxtwitter.com')}`;
                    if (channel) await channel.send(msg);
                    if (manual && interaction) await interaction.reply(`✅ 已手動抓取推文並發送通知！`);
                } else {
                    if (manual && interaction) await interaction.reply(`✅ 成功連線，但目前沒有新推文。`);
                }
                break;
            }
        } catch (e) {
            errorLog.push(`${nodeUrl} (Timeout/Error)`);
        }
    }
    
    if (manual && !success && interaction) {
        await interaction.reply(`❌ **推特觀測失敗**\n所有節點皆無回應：\n${errorLog.join('\n')}`);
    }
}

async function checkSteamUpdates(manual = false, interaction = null) {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=1');
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        
        if (newsItem) {
            if (!lastSteamNewsId) {
                lastSteamNewsId = newsItem.gid;
                if (manual && interaction) await interaction.reply(`✅ 成功連線 Steam API，並建立初始快取。`);
            } else if (newsItem.gid !== lastSteamNewsId || manual) {
                if (!manual) lastSteamNewsId = newsItem.gid;
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🚂 [Steam 官方新聞] ${newsItem.title}`)
                        .setURL(newsItem.url)
                        .setColor(0x00A8E8)
                        .setDescription('偵測到 Limbus Company 在 Steam 發布了新公告/更新筆記。')
                        .setTimestamp();
                    await channel.send({ content: `🔔 ${PING_ROLE_MENTION}`, embeds: [embed] });
                    if (manual && interaction) await interaction.reply(`✅ 已手動抓取 Steam 新聞並發送通知！`);
                }
            } else {
                if (manual && interaction) await interaction.reply(`✅ 成功連線 Steam，但目前沒有新公告。`);
            }
        }
    } catch (e) {
        if (manual && interaction) await interaction.reply(`❌ **Steam 觀測失敗**：API 連線超時或解析錯誤。`);
    }
}

// 背景輪詢
async function performSystemChecks() {
    await checkTwitterUpdates();
    await checkSteamUpdates();
}

// ==================== 🛠️ UI 構建器 ====================
function buildPackEmbed(userId, page) {
    const pData = getPlayer(userId);
    const user = client.users.cache.get(userId);
    const username = user ? user.username : '主管';

    const allItems = [
        ...Object.entries(pData.inventory).map(([k, v]) => `👤 ${k} x${v}`),
        ...Object.entries(pData.egos).map(([k, v]) => `⚔️ ${k} x${v}`)
    ];
    
    const itemsPerPage = 15;
    const totalPages = Math.max(1, Math.ceil(allItems.length / itemsPerPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * itemsPerPage;
    const pageItems = allItems.slice(start, start + itemsPerPage);

    const embed = new EmbedBuilder()
        .setTitle(`🎒 ${username} 的檔案館 (頁數 ${safePage + 1}/${totalPages})`)
        .setColor(0xE63946)
        .addFields(
            { name: '💎 Lunacy', value: `${pData.lunacy}`, inline: true },
            { name: '🎖️ 裝備中', value: pData.equipped || '無', inline: true },
            { name: '👥 隊伍人數', value: `${pData.team.length}/7 人`, inline: true },
            { name: '📚 持有內容', value: pageItems.length > 0 ? pageItems.join('\n') : '空空如也' }
        );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage - 1}`).setLabel('◀上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`pack_nav_${userId}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1)
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pack_equip_${userId}`).setLabel('🎖️ 裝備人格').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pack_team_${userId}`).setLabel('👥 編排隊伍').setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [navRow, actionRow] };
}

// ==================== 🤖 Discord Bot 核心事件 ====================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 已成功登入：${client.user.tag}`);
    loadDatabase();
    client.user.setPresence({ status: 'idle', activities: [{ name: 'customstatus', type: 4, state: '守護光之種' }] });
    
    setInterval(performSystemChecks, 60 * 1000);
    performSystemChecks();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();
    const args = msg.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ---------------- 🔧 基本與維護指令 ----------------
    if (cmd === '!testtweet') {
        await message.reply('⏳ 啟動推特手動觀測脈衝...');
        return checkTwitterUpdates(true, message);
    }
    if (cmd === '!teststeam') {
        await message.reply('⏳ 啟動 Steam 手動觀測脈衝...');
        return checkSteamUpdates(true, message);
    }
    if (cmd === '!givelunacy') {
        if (message.author.username !== 'sles_forever') return message.reply('❌ 權限不足。');
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return message.reply('📝 格式：`!givelunacy @user 數量`');
        const targetPlayer = getPlayer(target.id);
        targetPlayer.lunacy += amount;
        saveDatabase();
        return message.reply(`✅ 成功向 **${target.username}** 發放 ${amount} Lunacy。`);
    }

    // ---------------- 🎲 抽卡系統 ----------------
    if (cmd === '!pull' || cmd === '!10pulls') {
        const player = getPlayer(message.author.id);
        const isTen = (cmd === '!10pulls');
        const cost = isTen ? 1300 : 130;
        
        if (player.lunacy < cost) return message.reply(`❌ **Lunacy 不足** (餘額: ${player.lunacy})`);
        player.lunacy -= cost;
        
        const results = [];
        const count = isTen ? 10 : 1;
        for (let i = 0; i < count; i++) {
            const rarity = (isTen && i === 9) ? buildRarityGuaranteed() : buildRarity();
            const rateUpName = pickRateUp(rarity);
            let finalName = getBaseIdentity(rarity);
            let display = finalName;

            if (rateUpName && Math.random() < 0.25) {
                finalName = rateUpName;
                display = `✨ **[PICK-UP!]** ${rateUpName}`;
            }
            if (rarity === 'Egos') player.egos[finalName] = (player.egos[finalName] || 0) + 1;
            else player.inventory[finalName] = (player.inventory[finalName] || 0) + 1;
            
            results.push(`${display} (${rarityToStars(rarity)})`);
        }
        saveDatabase();
        return message.reply(isTen ? `✨ **十連提取結果 (剩餘 ${player.lunacy})：**\n${results.join('\n')}` : `🎯 **單抽結果 (剩餘 ${player.lunacy})：**\n${results[0]}`);
    }

    // ---------------- 🎒 整合版檔案館 (!pack / !check) ----------------
    if (cmd === '!pack' || cmd === '!check') {
        const targetUser = message.mentions.users.first() || message.author;
        getPlayer(targetUser.id); // 確保資料存在
        const payload = buildPackEmbed(targetUser.id, 0);
        return message.reply(payload);
    }

    // ---------------- 📈 UI 機率表 (!list) ----------------
    if (cmd === '!list') {
        const embed = new EmbedBuilder().setTitle(`📈 提取機率總覽`).setColor(0x457B9D).setDescription('請選擇稀有度查看詳細內容：');
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('list_select')
                .setPlaceholder('選擇卡池稀有度...')
                .addOptions(Object.keys(RARITY_RATES).map(r => ({ label: `${r} 卡池`, value: r })))
        );
        return message.reply({ embeds: [embed], components: [row] });
    }

    // ---------------- ⚔️ 戰鬥系統 (!stages) ----------------
    if (cmd === '!stages') {
        const player = getPlayer(message.author.id);
        if (player.team.length === 0) return message.reply('⚠️ 主管，請先透過 `!pack` 裡的按鈕編排作戰隊伍。');

        const embed = new EmbedBuilder()
            .setTitle('🗺️ 選擇作戰難度')
            .setDescription(`**當前出戰小隊 (${player.team.length}/7)：**\n${player.team.map(t=>`• ${t}`).join('\n')}`)
            .setColor(0x1D3557);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('stage_select')
                .setPlaceholder('選擇戰鬥難度...')
                .addOptions([
                    { label: '沒難度 (後巷流浪漢)', value: '80_50' },
                    { label: '輕鬆 (後巷幫派)', value: '250_100' },
                    { label: '中等 (協會成員)', value: '500_300' },
                    { label: '難 (異想體)', value: '1000_600' },
                    { label: '地獄 (高階收尾人)', value: '2000_1500' }
                ])
        );
        return message.reply({ embeds: [embed], components: [row] });
    }

    // ---------------- 🔄 交易系統 (!trade) ----------------
    if (cmd === '!trade') {
        const target = message.mentions.users.first();
        if (!target || target.id === message.author.id) return message.reply('📝 用法: `!trade @目標玩家`');
        if (target.bot) return message.reply('❌ 無法與 AI 機器人交易。');

        const tradeId = Date.now().toString();
        activeTrades.set(tradeId, {
            p1: { id: message.author.id, name: message.author.username, offer: null, confirmed: false },
            p2: { id: target.id, name: target.username, offer: null, confirmed: false }
        });

        const embed = new EmbedBuilder()
            .setTitle('🔄 交易請求')
            .setDescription(`<@${target.id}>，**${message.author.username}** 向您發起了交易請求。是否接受？`)
            .setColor(0xF4A261);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('✅ 接受交易').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );
        return message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
    }
});

// ==================== 🎛️ 全域互動處理核心 (徹底解決失效問題) ====================
client.on('interactionCreate', async (interaction) => {
    try {
        // ---------------- 🎒 檔案館UI互動處理 ----------------
        if (interaction.isButton() && interaction.customId.startsWith('pack_')) {
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const targetId = parts[2];
            const arg = parts[3];

            if (interaction.user.id !== targetId && interaction.user.id !== 'sles_forever') {
                return interaction.reply({ content: '❌ 您無法操作其他主管的面板。', ephemeral: true });
            }

            if (action === 'nav') {
                return interaction.update(buildPackEmbed(targetId, parseInt(arg)));
            }
            if (action === 'back') {
                return interaction.update(buildPackEmbed(targetId, 0));
            }
            if (action === 'equip' || action === 'team') {
                const pData = getPlayer(targetId);
                const invKeys = Object.keys(pData.inventory);
                
                if (invKeys.length === 0) return interaction.reply({ content: '❌ 您的背包沒有任何人格可供操作。', ephemeral: true });

                const embed = new EmbedBuilder()
                    .setTitle(action === 'equip' ? '🎖️ 選擇要裝備的人格' : '👥 編排戰鬥隊伍')
                    .setDescription(action === 'team' ? `當前隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}\n*提示：在下方選單點擊人格以 加入/移除 隊伍。*` : '請從下方選單選擇您要裝備的對象。')
                    .setColor(0x457B9D);

                // 將背包切為每 25 個一組的選單列
                const rows = [];
                for (let i = 0; i < invKeys.length && rows.length < 4; i += 25) {
                    const chunk = invKeys.slice(i, i + 25);
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`do_${action}_${targetId}_${i}`)
                        .setPlaceholder(`選擇人格 (第 ${Math.floor(i/25)+1} 頁)...`)
                        .addOptions(chunk.map(k => ({ label: k, value: k })));
                    rows.push(new ActionRowBuilder().addComponents(menu));
                }
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`pack_back_${targetId}`).setLabel('🔙 返回檔案館').setStyle(ButtonStyle.Secondary)
                ));

                return interaction.update({ embeds: [embed], components: rows });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('do_')) {
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const targetId = parts[2];
            if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ 無權限。', ephemeral: true });

            const pData = getPlayer(targetId);
            const selection = interaction.values[0];

            if (action === 'equip') {
                pData.equipped = selection;
                saveDatabase();
                return interaction.update(buildPackEmbed(targetId, 0));
            }
            if (action === 'team') {
                if (pData.team.includes(selection)) {
                    pData.team = pData.team.filter(x => x !== selection);
                } else {
                    if (pData.team.length >= 7) return interaction.reply({ content: '❌ 隊伍已達 7 人上限！', ephemeral: true });
                    pData.team.push(selection);
                }
                saveDatabase();
                
                // 重新刷新隊伍 UI
                const embed = new EmbedBuilder()
                    .setTitle('👥 編排戰鬥隊伍')
                    .setDescription(`當前隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}\n*提示：在下方選單點擊人格以 加入/移除 隊伍。*`)
                    .setColor(0x457B9D);
                return interaction.update({ embeds: [embed] });
            }
        }

        // ---------------- 📈 機率表 UI ----------------
        if (interaction.isStringSelectMenu() && interaction.customId === 'list_select') {
            const r = interaction.values[0];
            const baseRate = RARITY_RATES[r];
            const upList = normalizeRateUpList(r);
            const allPool = (identitiesData.identities?.[r] || identitiesData[r] || []).map(x => typeof x === 'string' ? x : (x.name || 'Unknown'));
            const stdPool = allPool.filter(id => !upList.includes(id));

            let desc = `**總基礎機率：** ${(baseRate * 100).toFixed(2)}%\n\n`;
            if (upList.length > 0) desc += `✨ **[Rate Up]** (每隻 ${((baseRate * 0.25) / upList.length * 100).toFixed(4)}%):\n${upList.map(i => `• ${i}`).join('\n')}\n\n`;
            if (stdPool.length > 0) desc += `🔹 **[普通]** (每隻 ${((baseRate * 0.75) / stdPool.length * 100).toFixed(4)}%):\n${stdPool.map(i => `• ${i}`).join('\n')}\n`;

            const embed = new EmbedBuilder().setTitle(`📈 提取機率分析 - ${rarityToStars(r)}`).setColor(0x457B9D).setDescription(desc);
            return interaction.update({ embeds: [embed] });
        }

        // ---------------- ⚔️ 戰鬥系統 UI ----------------
        if (interaction.isStringSelectMenu() && interaction.customId === 'stage_select') {
            const player = getPlayer(interaction.user.id);
            const [powerStr, rewardStr] = interaction.values[0].split('_');
            const enemyPower = parseInt(powerStr);
            const reward = parseInt(rewardStr);

            let playerClash = 0;
            const allIds = Object.values(identitiesData.identities || identitiesData).flat();
            player.team.forEach(member => {
                const info = allIds.find(id => typeof id === 'object' && id.name === member) || {};
                const speed = info.speed || Math.floor(Math.random()*5 + 3);
                const coin = info.coinPower || Math.floor(Math.random()*3 + 1);
                const clash = info.clashPower || Math.floor(Math.random()*15 + 10);
                playerClash += (speed * 1.5) + (clash * coin) + (Math.random() > 0.5 ? 20 : 0);
            });

            const pFinal = playerClash * (0.8 + Math.random() * 0.4);
            const eFinal = enemyPower * (0.9 + Math.random() * 0.2);
            const isWin = pFinal >= eFinal;

            const embed = new EmbedBuilder()
                .setTitle(`⚔️ 戰鬥結算`)
                .addFields(
                    { name: '🔹 小隊 Clash 總判定', value: `${Math.floor(pFinal)}`, inline: true },
                    { name: '🔸 敵方 Clash 總判定', value: `${Math.floor(eFinal)}`, inline: true },
                    { name: '🏆 結果', value: isWin ? `✅ 成功鎮壓 (獲得 ${reward} Lunacy)` : '❌ 隊伍全滅', inline: false }
                )
                .setColor(isWin ? 0x2A9D8F : 0xE63946);

            if (isWin) { player.lunacy += reward; saveDatabase(); }
            return interaction.update({ embeds: [embed], components: [] });
        }

        // ---------------- 🔄 交易系統 UI ----------------
        if (interaction.customId.startsWith('trade_')) {
            const parts = interaction.customId.split('_');
            const act = parts[1];
            const tId = parts[2];
            const trade = activeTrades.get(tId);

            if (!trade) return interaction.reply({ content: '❌ 該交易已過期或不存在。', ephemeral: true });

            if (act === 'acc') {
                if (interaction.user.id !== trade.p2.id) return interaction.reply({ content: '❌ 只有被邀請者能同意。', ephemeral: true });
                const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F)
                    .addFields(
                        { name: `P1: ${trade.p1.name}`, value: `提供: 尚未選擇`, inline: true },
                        { name: `P2: ${trade.p2.name}`, value: `提供: 尚未選擇`, inline: true }
                    );
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p1`).setLabel(`${trade.p1.name} 選擇物品`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_pick_${tId}_p2`).setLabel(`${trade.p2.name} 選擇物品`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_ok_${tId}`).setLabel('✅ 確認交易').setStyle(ButtonStyle.Success)
                );
                return interaction.update({ content: null, embeds: [embed], components: [row] });
            }

            if (act === 'dec') {
                if (interaction.user.id !== trade.p2.id) return;
                activeTrades.delete(tId);
                return interaction.update({ content: '❌ 交易已被拒絕。', embeds: [], components: [] });
            }

            if (act === 'pick') {
                const playerKey = parts[3]; // 'p1' or 'p2'
                if (interaction.user.id !== trade[playerKey].id) return interaction.reply({ content: '❌ 這不是您的選擇按鈕。', ephemeral: true });
                
                const pData = getPlayer(interaction.user.id);
                const allItems = [...Object.keys(pData.inventory), ...Object.keys(pData.egos)].slice(0, 25);
                if (allItems.length === 0) return interaction.reply({ content: '❌ 您的背包空無一物。', ephemeral: true });

                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`trade_sel_${tId}_${playerKey}`)
                    .setPlaceholder('選擇要交易的物品...')
                    .addOptions(allItems.map(i => ({ label: i, value: i })));
                
                return interaction.reply({ content: '請選擇：', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
            }

            if (act === 'sel') {
                const playerKey = parts[3];
                trade[playerKey].offer = interaction.values[0];
                trade.p1.confirmed = false; trade.p2.confirmed = false; // 重置確認狀態
                
                const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F).addFields(
                    { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '尚未選擇'}`, inline: true },
                    { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '尚未選擇'}`, inline: true }
                );
                
                await interaction.update({ content: '已選擇。', components: [] }); // 清除 ephemeral 選單
                return interaction.message.edit({ embeds: [embed] });
            }

            if (act === 'ok') {
                const isP1 = interaction.user.id === trade.p1.id;
                const isP2 = interaction.user.id === trade.p2.id;
                if (!isP1 && !isP2) return interaction.reply({ content: '❌ 您不在此交易中。', ephemeral: true });
                if (!trade.p1.offer || !trade.p2.offer) return interaction.reply({ content: '❌ 雙方皆須提出物品。', ephemeral: true });

                if (isP1) trade.p1.confirmed = true;
                if (isP2) trade.p2.confirmed = true;

                if (trade.p1.confirmed && trade.p2.confirmed) {
                    // 執行物品互換邏輯
                    const p1Data = getPlayer(trade.p1.id);
                    const p2Data = getPlayer(trade.p2.id);

                    function transferItem(fromDB, toDB, itemName) {
                        if (fromDB.inventory[itemName]) {
                            fromDB.inventory[itemName]--;
                            if (fromDB.inventory[itemName] <= 0) {
                                delete fromDB.inventory[itemName];
                                if (fromDB.equipped === itemName) fromDB.equipped = null;
                                fromDB.team = fromDB.team.filter(x => x !== itemName);
                            }
                            toDB.inventory[itemName] = (toDB.inventory[itemName] || 0) + 1;
                        } else if (fromDB.egos[itemName]) {
                            fromDB.egos[itemName]--;
                            if (fromDB.egos[itemName] <= 0) delete fromDB.egos[itemName];
                            toDB.egos[itemName] = (toDB.egos[itemName] || 0) + 1;
                        }
                    }

                    transferItem(p1Data, p2Data, trade.p1.offer);
                    transferItem(p2Data, p1Data, trade.p2.offer);
                    saveDatabase();
                    activeTrades.delete(tId);

                    const embed = new EmbedBuilder().setTitle('✅ 交易成功！').setColor(0x2A9D8F)
                        .setDescription(`**${trade.p1.name}** 獲得了 ${trade.p2.offer}\n**${trade.p2.name}** 獲得了 ${trade.p1.offer}`);
                    return interaction.update({ embeds: [embed], components: [] });
                } else {
                    return interaction.reply({ content: `✅ 您已確認。等待對方確認...`, ephemeral: true });
                }
            }
        }
    } catch (e) {
        console.error('互動事件錯誤:', e);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ 系統發生錯誤。', ephemeral: true }).catch(()=>{});
        }
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => console.error('❌ 登入失敗：', err));
