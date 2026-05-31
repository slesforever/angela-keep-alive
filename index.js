const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
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
            equipped: null
        };
        const baseSinners = identitiesData.identities?.['0'] || [];
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
const activeTrades = new Map();

// ==================== 🎲 機率與抽卡核心 ====================
const RARITY_RATES = {
    'Special': 0.0001,
    '0000': 0.0050,
    'Egos': 0.0130,
    '000': 0.0290,
    '00': 0.1500,
    '0': 0.8029
};

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
    const r = Math.random() * 0.1971;
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

// ==================== 📡 觀測系統 (精準抓取最新推文/Steam) ====================
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
            
            // 🔥 直接鎖定第一個 <item> 標籤，絕對不抓到頻道介紹
            const itemMatch = text.match(/<item>([\s\S]*?)<\/item>/);
            if (itemMatch) {
                success = true;
                const itemBlock = itemMatch[1];
                let link = itemBlock.match(/<link>(.*?)<\/link>/)?.[1];
                const id = itemBlock.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];
                const title = itemBlock.match(/<title>([\s\S]*?)<\/title>/)?.[1];

                if (link && id) {
                    link = link.replace('http://', 'https://');
                    
                    if (!lastTweetId) {
                        lastTweetId = id; 
                        if (manual && interaction) await interaction.reply(`✅ 成功連線推特節點。當前最新推文：\n${link}`);
                    } else if (id !== lastTweetId || manual) {
                        if (!manual) lastTweetId = id;
                        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                        const msg = `🔔 ${PING_ROLE_MENTION} **[Twitter官方公告]**\n${title ? `> ${title}\n` : ''}${link.replace('twitter.com', 'vxtwitter.com')}`;
                        if (channel) await channel.send(msg);
                        if (manual && interaction) await interaction.reply(`✅ 已手動抓取最新推文並發送通知！\n${link}`);
                    } else {
                        if (manual && interaction) await interaction.reply(`✅ 成功連線，但目前沒有新推文。`);
                    }
                    break; 
                }
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
                if (manual && interaction) await interaction.reply(`✅ 成功連線 Steam API。最新新聞：${newsItem.title}`);
            } else if (newsItem.gid !== lastSteamNewsId || manual) {
                if (!manual) lastSteamNewsId = newsItem.gid;
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🚂 [Steam 官方新聞] ${newsItem.title}`)
                        .setURL(newsItem.url)
                        .setColor(0x00A8E8)
                        .setDescription('偵測到 Limbus Company 在 Steam 發布了新公告。')
                        .setTimestamp();
                    await channel.send({ content: `🔔 ${PING_ROLE_MENTION}`, embeds: [embed] });
                    if (manual && interaction) await interaction.reply(`✅ 已手動抓取 Steam 新聞並發送通知！`);
                }
            } else {
                if (manual && interaction) await interaction.reply(`✅ 成功連線 Steam，但目前沒有新公告。`);
            }
        }
    } catch (e) {
        if (manual && interaction) await interaction.reply(`❌ **Steam 觀測失敗**：API 連線錯誤。`);
    }
}

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

// 🔥 編輯訊息版本的 List 翻頁構建器
function buildListEmbed(rarity, page) {
    const baseRate = RARITY_RATES[rarity];
    const allPool = identitiesData.identities[rarity] || [];
    const upPool = identitiesData.upTargets[rarity] || [];
    const stdPool = allPool.filter(id => !upPool.includes(id));

    let desc = `**總基礎機率：** ${(baseRate * 100).toFixed(2)}%\n\n`;
    if (upPool.length > 0 && upPool[0] !== null) {
        desc += `✨ **[Rate Up]** (每隻 ${((baseRate * 0.25) / upPool.length * 100).toFixed(4)}%):\n${upPool.map(i => `• ${i}`).join('\n')}\n\n`;
    }

    const itemsPerPage = 15;
    const totalPages = Math.max(1, Math.ceil(stdPool.length / itemsPerPage));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * itemsPerPage;
    const pageItems = stdPool.slice(start, start + itemsPerPage);

    if (stdPool.length > 0) {
        desc += `🔹 **[普通] (頁數 ${safePage + 1}/${totalPages})**:\n${pageItems.map(i => `• ${i}`).join('\n')}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`📈 提取機率分析 - ${rarityToStars(rarity)}`)
        .setColor(0x457B9D)
        .setDescription(desc);

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('list_select')
            .setPlaceholder('切換查看其他卡池...')
            .addOptions(Object.keys(RARITY_RATES).map(r => ({ label: `${r} 卡池`, value: r })))
    );

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`list_nav_${rarity}_${safePage - 1}`).setLabel('◀上一頁').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`list_nav_${rarity}_${safePage + 1}`).setLabel('下一頁▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage === totalPages - 1)
    );

    return { embeds: [embed], components: [selectMenuRow, navRow] };
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
    if (cmd === '!testtweet') return checkTwitterUpdates(true, message);
    if (cmd === '!teststeam') return checkSteamUpdates(true, message);
    if (cmd === '!givelunacy') {
        if (message.author.username !== 'sles_forever') return message.reply('❌ 權限不足。');
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return message.reply('📝 格式：`!givelunacy @user 數量`');
        getPlayer(target.id).lunacy += amount;
        saveDatabase();
        return message.reply(`✅ 成功發放 ${amount} Lunacy。`);
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
            const upTarget = identitiesData.pullUpIdentity(rarity);
            
            let finalName;
            let display;

            if (upTarget && Math.random() < 0.25) {
                finalName = upTarget;
                display = `✨ **[PICK-UP!]** ${finalName}`;
            } else {
                finalName = identitiesData.pullIdentity(rarity);
                display = finalName;
            }

            if (rarity === 'Egos') player.egos[finalName] = (player.egos[finalName] || 0) + 1;
            else player.inventory[finalName] = (player.inventory[finalName] || 0) + 1;
            
            results.push(`${display} (${rarityToStars(rarity)})`);
        }
        saveDatabase();
        return message.reply(isTen ? `✨ **十連提取結果 (剩餘 ${player.lunacy})：**\n${results.join('\n')}` : `🎯 **單抽結果 (剩餘 ${player.lunacy})：**\n${results[0]}`);
    }

    // ---------------- 🎒 檔案館 (!pack / !check) ----------------
    if (cmd === '!pack' || cmd === '!check') {
        const targetUser = message.mentions.users.first() || message.author;
        getPlayer(targetUser.id);
        return message.reply(buildPackEmbed(targetUser.id, 0));
    }

    // ---------------- 📈 UI 機率表 (!list) ----------------
    if (cmd === '!list') {
        const embed = new EmbedBuilder().setTitle(`📈 提取機率總覽`).setColor(0x457B9D).setDescription('請從下方選單選擇稀有度查看詳細名單（支援翻頁）：');
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
        if (player.team.length === 0) return message.reply('⚠️ 主管，請先透過 `!pack` 編排作戰隊伍。');

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
        if (target.bot) return message.reply('❌ 無法與 AI 交易。');

        const tradeId = Date.now().toString();
        activeTrades.set(tradeId, {
            p1: { id: message.author.id, name: message.author.username, offer: null, confirmed: false },
            p2: { id: target.id, name: target.username, offer: null, confirmed: false }
        });

        const embed = new EmbedBuilder().setTitle('🔄 交易請求').setDescription(`<@${target.id}>，**${message.author.username}** 發起交易。是否接受？`).setColor(0xF4A261);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('✅ 接受').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('❌ 拒絕').setStyle(ButtonStyle.Danger)
        );
        return message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
    }
});

// ==================== 🎛️ 全域互動處理核心 (編輯訊息翻頁保證) ====================
client.on('interactionCreate', async (interaction) => {
    try {
        // ---------------- 🎒 檔案館導覽 (直接 update 編輯原訊息) ----------------
        if (interaction.isButton() && interaction.customId.startsWith('pack_')) {
            const parts = interaction.customId.split('_');
            const action = parts[1];
            const targetId = parts[2];
            const arg = parts[3];

            if (interaction.user.id !== targetId && interaction.user.id !== 'sles_forever') {
                return interaction.reply({ content: '❌ 無法操作他人的面板。', ephemeral: true });
            }

            // 🔥 完美實現「翻頁改成編輯訊息」
            if (action === 'nav') return interaction.update(buildPackEmbed(targetId, parseInt(arg)));
            if (action === 'back') return interaction.update(buildPackEmbed(targetId, 0));
            
            if (action === 'equip' || action === 'team') {
                const pData = getPlayer(targetId);
                const invKeys = Object.keys(pData.inventory);
                if (invKeys.length === 0) return interaction.reply({ content: '❌ 背包空無一物。', ephemeral: true });

                const embed = new EmbedBuilder()
                    .setTitle(action === 'equip' ? '🎖️ 選擇要裝備的人格' : '👥 編排戰鬥隊伍')
                    .setDescription(action === 'team' ? `隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}` : '請選擇裝備。')
                    .setColor(0x457B9D);

                // 🔥 自動拆分下拉選單，防止超過 25 項被截斷 (最高支援 100 項)
                const rows = [];
                for (let i = 0; i < invKeys.length && rows.length < 4; i += 25) {
                    const chunk = invKeys.slice(i, i + 25);
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`do_${action}_${targetId}_${i}`)
                        .setPlaceholder(`選擇 (第 ${Math.floor(i/25)+1} 頁)...`)
                        .addOptions(chunk.map(k => ({ label: k.substring(0, 100), value: k })));
                    rows.push(new ActionRowBuilder().addComponents(menu));
                }
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`pack_back_${targetId}`).setLabel('🔙 返回').setStyle(ButtonStyle.Secondary)
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
                if (pData.team.includes(selection)) pData.team = pData.team.filter(x => x !== selection);
                else {
                    if (pData.team.length >= 7) return interaction.reply({ content: '❌ 隊伍上限 7 人！', ephemeral: true });
                    pData.team.push(selection);
                }
                saveDatabase();
                const embed = new EmbedBuilder().setTitle('👥 編排戰鬥隊伍').setDescription(`隊伍 (${pData.team.length}/7)：\n${pData.team.join(', ') || '無'}`).setColor(0x457B9D);
                return interaction.update({ embeds: [embed] });
            }
        }

        // ---------------- 📈 List 機率表翻頁邏輯 ----------------
        if (interaction.isStringSelectMenu() && interaction.customId === 'list_select') {
            const rarity = interaction.values[0];
            // 🔥 直接透過 update 編輯原訊息，並產生對應的翻頁按鈕
            return interaction.update(buildListEmbed(rarity, 0));
        }

        if (interaction.isButton() && interaction.customId.startsWith('list_nav_')) {
            const parts = interaction.customId.split('_');
            const rarity = parts[2];
            const page = parseInt(parts[3]);
            // 🔥 按下上一頁/下一頁時，直接編輯訊息內容
            return interaction.update(buildListEmbed(rarity, page));
        }

        // ---------------- ⚔️ 戰鬥系統 UI ----------------
        if (interaction.isStringSelectMenu() && interaction.customId === 'stage_select') {
            const player = getPlayer(interaction.user.id);
            const [powerStr, rewardStr] = interaction.values[0].split('_');
            const eFinal = parseInt(powerStr) * (0.9 + Math.random() * 0.2);
            
            let pClash = 0;
            player.team.forEach(() => { pClash += Math.floor(Math.random()*25 + 10); }); // 簡化判定
            const pFinal = pClash * (0.8 + Math.random() * 0.4);
            const isWin = pFinal >= eFinal;

            const embed = new EmbedBuilder().setTitle(`⚔️ 戰鬥結算`).addFields(
                { name: '🔹 隊伍判定', value: `${Math.floor(pFinal)}`, inline: true },
                { name: '🔸 敵方判定', value: `${Math.floor(eFinal)}`, inline: true },
                { name: '🏆 結果', value: isWin ? `✅ 獲得 ${rewardStr} Lunacy` : '❌ 全滅', inline: false }
            ).setColor(isWin ? 0x2A9D8F : 0xE63946);

            if (isWin) { player.lunacy += parseInt(rewardStr); saveDatabase(); }
            return interaction.update({ embeds: [embed], components: [] });
        }

        // ---------------- 🔄 交易系統 (突破 25 項限制) ----------------
        if (interaction.customId.startsWith('trade_')) {
            const parts = interaction.customId.split('_');
            const act = parts[1];
            const tId = parts[2];
            const trade = activeTrades.get(tId);

            if (!trade) return interaction.reply({ content: '❌ 交易過期。', ephemeral: true });

            if (act === 'acc') {
                if (interaction.user.id !== trade.p2.id) return interaction.reply({ content: '❌ 僅限被邀請者操作。', ephemeral: true });
                const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F).addFields(
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
                return interaction.update({ content: '❌ 交易已拒絕。', embeds: [], components: [] });
            }

            if (act === 'pick') {
                const playerKey = parts[3];
                if (interaction.user.id !== trade[playerKey].id) return interaction.reply({ content: '❌ 非您的按鈕。', ephemeral: true });
                
                const pData = getPlayer(interaction.user.id);
                const allItems = [...Object.keys(pData.inventory), ...Object.keys(pData.egos)];
                if (allItems.length === 0) return interaction.reply({ content: '❌ 背包為空。', ephemeral: true });

                // 🔥 多組下拉選單：一次性展開最多 125 樣物品給玩家選擇 (5行x25項)
                const rows = [];
                for (let i = 0; i < allItems.length && rows.length < 5; i += 25) {
                    const chunk = allItems.slice(i, i + 25);
                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`trade_sel_${tId}_${playerKey}_${i}`)
                        .setPlaceholder(`選擇物品 (第 ${Math.floor(i/25)+1} 頁)...`)
                        .addOptions(chunk.map(item => ({ label: item.substring(0, 100), value: item })));
                    rows.push(new ActionRowBuilder().addComponents(menu));
                }
                
                return interaction.reply({ content: '請選擇要擺上交易桌的物品：', components: rows, ephemeral: true });
            }

            if (act === 'sel') {
                const playerKey = parts[3];
                trade[playerKey].offer = interaction.values[0];
                trade.p1.confirmed = false; trade.p2.confirmed = false;
                
                const embed = new EmbedBuilder().setTitle('🔄 交易終端').setColor(0x2A9D8F).addFields(
                    { name: `P1: ${trade.p1.name}`, value: `提供: ${trade.p1.offer || '尚未選擇'}`, inline: true },
                    { name: `P2: ${trade.p2.name}`, value: `提供: ${trade.p2.offer || '尚未選擇'}`, inline: true }
                );
                
                await interaction.update({ content: '✅ 已選擇，請在原對話框按下確認交易。', components: [] });
                return interaction.message.edit({ embeds: [embed] });
            }

            if (act === 'ok') {
                const isP1 = interaction.user.id === trade.p1.id;
                const isP2 = interaction.user.id === trade.p2.id;
                if (!isP1 && !isP2) return interaction.reply({ content: '❌ 無權限。', ephemeral: true });
                if (!trade.p1.offer || !trade.p2.offer) return interaction.reply({ content: '❌ 雙方皆須放上物品。', ephemeral: true });

                if (isP1) trade.p1.confirmed = true;
                if (isP2) trade.p2.confirmed = true;

                if (trade.p1.confirmed && trade.p2.confirmed) {
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
                    return interaction.reply({ content: `✅ 您已確認。等待對方...`, ephemeral: true });
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
