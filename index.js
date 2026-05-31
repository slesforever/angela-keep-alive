const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const express = require('express');
const fs = require('fs');

// 動態載入 fetch
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
        console.log('⚠️ 找不到 players.json，已建立全新檔案館。');
        saveDatabase();
    }
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(playersDB, null, 4), 'utf8');
}

// 獲取玩家，若為新玩家則自動派發 0 星基礎人格
function getPlayer(userId) {
    if (!playersDB[userId]) {
        playersDB[userId] = {
            lunacy: 0,
            inventory: {},   // 人格名稱: 數量
            egos: {},        // EGO名稱: 數量
            team: [],        // 最多 7 人
            equipped: null,
            level: 1,
            exp: 0,
            thread: 0,
            stageProgress: 0
        };
        
        // 自動發放基礎 0 星人格 (十二罪人)
        const baseSinners = identitiesData.identities?.['0'] || identitiesData['0'] || [];
        baseSinners.forEach(sinner => {
            const name = typeof sinner === 'string' ? sinner : sinner.name;
            if (name) playersDB[userId].inventory[name] = 1;
        });
        saveDatabase();
    }
    return playersDB[userId];
}

// ==================== 🌐 網頁伺服器設定 (Render 喚醒用) ====================
const app = express();
const PORT = process.env.PORT || 3000;
const systemStartTime = new Date();
let totalUpdatesChecked = 0;

app.get('/', (req, res) => res.sendStatus(200));
app.listen(PORT, () => console.log(`網頁伺服器已在連接埠 ${PORT} 啟動`));

// ==================== 📡 系統常數與設定 ====================
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

const TARGET_USER = { username: 'LimbusCompany_B', displayName: '邊獄公司 (Limbus Company) 官方' };
const NITTER_NODES = ['https://nitter.net', 'https://nitter.poast.org', 'https://nitter.cz'];

let lastTweetId = null;
let lastSteamNewsId = null;

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

// 單抽/前九抽隨機產生器
function buildRarity() {
    const r = Math.random();
    if (r < 0.0001) return 'Special'; // 0.01%
    if (r < 0.0051) return '0000';    // 0.5%
    if (r < 0.0181) return 'Egos';    // 1.3%
    if (r < 0.0471) return '000';     // 2.9%
    if (r < 0.1971) return '00';      // 15%
    return '0';                       // 80.29%
}

// 十抽保底產生器：移除 0 的機率，重新正規化 (總權重為 0.1971)
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
    return `（種類 ${rarity} 資料庫缺失）`;
}

// ==================== 📡 公告監聽系統 ====================
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }).finally(() => clearTimeout(timeout));
}

// Twitter (X) 監聽
async function checkTwitterUpdates() {
    for (const nodeUrl of NITTER_NODES) {
        try {
            const response = await fetchWithTimeout(`${nodeUrl}/${TARGET_USER.username}/rss`);
            if (!response.ok) continue;
            const text = await response.text();
            
            const linkMatch = text.match(/<link>(.*?)<\/link>/g)?.[1];
            const guidMatch = text.match(/<guid[^>]*>(.*?)<\/guid>/);
            
            if (linkMatch && guidMatch) {
                const link = linkMatch.replace('<link>', '').replace('</link>', '').replace('http://', 'https://');
                const id = guidMatch[1];
                
                if (!lastTweetId) {
                    lastTweetId = id; 
                    break;
                } else if (id !== lastTweetId) {
                    lastTweetId = id;
                    const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                    if (channel) await channel.send(`🔔 ${PING_ROLE_MENTION} **[Twitter官方公告]**\n${link.replace('twitter.com', 'vxtwitter.com')}`);
                }
                break;
            }
        } catch (e) { /* 靜默錯誤，嘗試下一節點 */ }
    }
}

// Steam News 監聽
async function checkSteamUpdates() {
    try {
        const response = await fetchWithTimeout('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=1973530&count=1');
        const data = await response.json();
        const newsItem = data?.appnews?.newsitems?.[0];
        
        if (newsItem) {
            if (!lastSteamNewsId) {
                lastSteamNewsId = newsItem.gid;
            } else if (newsItem.gid !== lastSteamNewsId) {
                lastSteamNewsId = newsItem.gid;
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🚂 [Steam 官方新聞] ${newsItem.title}`)
                        .setURL(newsItem.url)
                        .setColor(0x00A8E8)
                        .setDescription('偵測到 Limbus Company 在 Steam 發布了新公告/更新筆記。')
                        .setFooter({ text: 'Project Moon 官方動態' })
                        .setTimestamp();
                    await channel.send({ content: `🔔 ${PING_ROLE_MENTION}`, embeds: [embed] });
                }
            }
        }
    } catch (e) { /* 靜默錯誤 */ }
}

async function performSystemChecks() {
    totalUpdatesChecked++;
    await checkTwitterUpdates();
    await checkSteamUpdates();
}

async function announceCurrentRateUps() {
    try {
        const channel = await client.channels.fetch(RATEUP_ANNOUNCE_CHANNEL_ID);
        if (!channel) return;

        const sections = [];
        ['Special', '0000', 'Egos', '000', '00', '0'].forEach(rarity => {
            const list = normalizeRateUpList(rarity);
            if (list.length) sections.push(`### ${rarity}\n${list.map(v => `• ${v}`).join('\n')}`);
        });

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd166)
                    .setTitle('📢 當期 Rate Up 卡池資料更新')
                    .setDescription(sections.length ? sections.join('\n\n') : '目前沒有設定任何 Rate Up。')
                    .setFooter({ text: '系統資料庫同步完畢' })
                    .setTimestamp()
            ]
        });
    } catch (err) { console.error('Rate Up 公告失敗:', err); }
}

// ==================== 🤖 Discord Bot 核心事件 ====================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log(`🤖 Angela 已成功登入：${client.user.tag}`);
    loadDatabase();
    
    client.user.setPresence({ status: 'idle', activities: [{ name: 'customstatus', type: 4, state: '守護光之種' }] });
    
    await announceCurrentRateUps();
    setInterval(performSystemChecks, 60 * 1000);
    performSystemChecks();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const msg = message.content.trim();
    const args = msg.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ---------------- 🗣️ 舊有純文字對話與系統查詢 ----------------
    if (cmd === '!ping') return message.reply('pong！');
    if (msg === '管理員' || msg === '主管') return message.reply('主管，您好。我是您的 AI 助理 Angela。請下達您的指示，今天也請為了擴張「光之種」而努力。');
    if (msg.toLowerCase() === 'lc' || msg === '腦葉公司') return message.reply('「直面恐懼，創造未來。」請時刻注意收容單位的逆流計數器，主管。');
    if (msg === '!逆流') {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ [WARNING] 腦葉公司緊急通告').setColor(0xff0000).setDescription('警告：當前頻道內觀測到嚴重的「心理逆流」現象！').addFields({ name: '🚨 逆流狀態', value: '第 3 階能障逆流 (Qliphoth Meltdown)', inline: false }).setImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop')] });
    }
    if (cmd === '!limbusonline' || cmd === '!邊獄人數') {
        try {
            const res = await fetchWithTimeout('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1973530');
            const data = await res.json();
            if (data?.response?.result === 1) return message.reply(`📊 **[Steam 即時數據]** 目前共有 **${data.response.player_count.toLocaleString()}** 位罪人正在《Limbus Company》中。`);
            return message.reply('❌ 無法從 Steam API 取得正確的數據。');
        } catch (error) { return message.reply('❌ 連線至 Steam 伺服器時發生內部錯誤。'); }
    }
    if (cmd === '!status' || cmd === '!狀態') {
        const uptimeHours = ((new Date() - systemStartTime) / (1000 * 60 * 60)).toFixed(1);
        return message.reply({ embeds: [new EmbedBuilder().setTitle('🧠 系統狀態報告').setColor(0x5a189a).addFields(
            { name: '🏷️ 當前標籤', value: '「被觀測者」', inline: true },
            { name: '⏳ 核心運作時間', value: `${uptimeHours} 小時`, inline: true },
            { name: '📈 檢查公告次數', value: `${totalUpdatesChecked}`, inline: true }
        )]});
    }
    if (cmd === '!ego') {
        const egos = [{n:'薄暮 (Twilight)', g:'ALEPH'}, {n:'失樂園 (Paradise Lost)', g:'ALEPH'}, {n:'擬態 (Mimicry)', g:'ALEPH'}];
        const e = egos[Math.floor(Math.random() * egos.length)];
        return message.reply({ embeds: [new EmbedBuilder().setTitle('⚔️ E.G.O 同步觀測').setColor(0xd90429).setDescription(`主管 **${message.author.username}**，同步率最高：\n**${e.n}** (\`${e.g}\`)`)] });
    }
    if (cmd === '!testtweet') {
        message.reply('⏳ 測試中，手動觸發公告擷取...');
        await checkTwitterUpdates(); await checkSteamUpdates();
        return;
    }
    if (cmd === '!findbot' || cmd === '!尋找機器人') {
        if (args.length < 2) return message.reply('❌ 請輸入要尋找的機器人名稱！');
        const term = args.slice(1).join(' ').toLowerCase();
        const bots = (await message.guild.members.fetch()).filter(m => m.user.bot && m.user.username.toLowerCase().includes(term));
        if (bots.size === 0) return message.reply('🔍 找不到該機器人。');
        return message.reply(`📌 **找到相關機器人：**\n` + bots.map(b => `🤖 **${b.user.username}** (<@${b.id}>)`).join('\n'));
    }
    if (cmd === '!help' || cmd === '!cmds') {
        return message.reply('🧠 **Angela 系統指令總覽**\n`!pull` / `!10pulls` - 提取人格 (130/1300 Lunacy)\n`!pack` / `!check [@user]` - 查看檔案館\n`!equip <人格>` - 裝備人格\n`!team <人格>` / `!team clear` - 編排戰鬥隊伍(最高7人)\n`!stages` - 選擇戰區進行作戰\n`!list` - 查看機率表\n`!trade` - 交易系統\n`!checkrateupids` - 檢視UP池\n`!givelunacy @user <數量>` - 主管發薪用');
    }

    // 初始化/取得玩家資料 (觸發基礎送禮)
    const player = getPlayer(message.author.id);

    // ---------------- 💰 主管發薪系統 ----------------
    if (cmd === '!givelunacy') {
        if (message.author.username !== 'sles_forever') {
            return message.reply('❌ 權限不足。僅有主管 (`@sles_forever`) 具備 Lunacy 發行權限。');
        }
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return message.reply('📝 格式錯誤。請使用：`!givelunacy @user 數量`');
        
        const targetPlayer = getPlayer(target.id);
        targetPlayer.lunacy += amount;
        saveDatabase();
        return message.reply(`✅ 已成功向 **${target.username}** 發放 ${amount} Lunacy。目前餘額：${targetPlayer.lunacy}`);
    }

    // ---------------- 🎲 抽卡與保底系統 (!pull / !10pulls) ----------------
    if (cmd === '!pull' || cmd === '!10pulls') {
        const isTen = (cmd === '!10pulls');
        const cost = isTen ? 1300 : 130;
        
        if (player.lunacy < cost) {
            return message.reply(`❌ **Lunacy 不足**\n當前餘額: ${player.lunacy} / 需要: ${cost}`);
        }
        
        player.lunacy -= cost;
        const results = [];
        const count = isTen ? 10 : 1;

        for (let i = 0; i < count; i++) {
            // 第10抽保底 (必定 00 以上，重新正規化)
            const rarity = (isTen && i === 9) ? buildRarityGuaranteed() : buildRarity();
            const rateUpName = pickRateUp(rarity);

            let baseName = getBaseIdentity(rarity);
            let finalName = baseName;
            let display = baseName;

            if (rateUpName && Math.random() < 0.25) {
                finalName = rateUpName;
                display = `✨ **[PICK-UP!]** ${rateUpName}`;
            }

            if (rarity === 'Egos') {
                player.egos[finalName] = (player.egos[finalName] || 0) + 1;
            } else {
                player.inventory[finalName] = (player.inventory[finalName] || 0) + 1;
            }
            results.push(`${display} (${rarityToStars(rarity)})`);
        }
        saveDatabase();

        return message.reply(
            isTen 
            ? `✨ **十連提取結果 (剩餘 ${player.lunacy} Lunacy)：**\n${results.join('\n')}` 
            : `🎯 **單抽結果 (剩餘 ${player.lunacy} Lunacy)：**\n${results[0]}`
        );
    }

    // ---------------- 🎒 檔案館與裝備 (!pack / !check / !equip) ----------------
    if (cmd === '!pack' || cmd === '!check') {
        const targetUser = message.mentions.users.first() || message.author;
        const pData = getPlayer(targetUser.id);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${targetUser.username} 的檔案館`)
            .setColor(0xE63946)
            .addFields(
                { name: '💎 Lunacy', value: `${pData.lunacy}`, inline: true },
                { name: '🎖️ 裝備中人格', value: pData.equipped || '無', inline: true },
                { name: '👥 隊伍人數', value: `${pData.team.length}/7 人`, inline: true }
            );

        let invLines = Object.entries(pData.inventory).map(([k, v]) => `• ${k} x${v}`);
        let egoLines = Object.entries(pData.egos).map(([k, v]) => `• ${k} x${v}`);
        
        let invStr = invLines.length > 0 ? invLines.join('\n') : '無';
        let egoStr = egoLines.length > 0 ? egoLines.join('\n') : '無';
        
        if (invStr.length > 1024) invStr = invStr.substring(0, 1000) + '... (資料過多省略)';
        if (egoStr.length > 1024) egoStr = egoStr.substring(0, 1000) + '... (資料過多省略)';

        embed.addFields(
            { name: '📚 持有人格', value: invStr },
            { name: '⚔️ 持有 E.G.O', value: egoStr }
        );
        
        return message.reply({ embeds: [embed] });
    }

    if (cmd === '!equip') {
        const idName = args.slice(1).join(' ');
        if (!idName) return message.reply('📝 請輸入要裝備的人格名稱！');
        if (!player.inventory[idName]) return message.reply('❌ 您的檔案館中尚未提取此人格。');
        
        player.equipped = idName;
        saveDatabase();
        return message.reply(`✅ 成功裝備：**${idName}**`);
    }

    // ---------------- 👥 隊伍系統 (!team) ----------------
    if (cmd === '!team') {
        if (args[1] === 'clear') {
            player.team = [];
            saveDatabase();
            return message.reply('🧹 隊伍已全數清空。');
        }
        const member = args.slice(1).join(' ');
        if (!member) return message.reply('📝 用法: `!team <持有人格名稱>` 或是 `!team clear`');
        if (!player.inventory[member]) return message.reply('❌ 招募失敗：您並未持有該人格。');
        if (player.team.length >= 7) return message.reply('❌ 招募失敗：隊伍已達 7 人上限。');
        if (player.team.includes(member)) return message.reply('❌ 該成員已經在隊伍中。');

        player.team.push(member);
        saveDatabase();
        return message.reply(`✅ **${member}** 已編入作戰小隊。當前人數：${player.team.length}/7`);
    }

    // ---------------- 🔄 交易系統 (!trade) (UI 翻頁保留) ----------------
    if (cmd === '!trade') {
        const pages = [
            new EmbedBuilder().setTitle('🔄 交易終端 - 第 1 頁').setDescription('目前沒有可用的交易提案。').setColor(0xF4A261),
            new EmbedBuilder().setTitle('🔄 交易終端 - 第 2 頁').setDescription('黑市模組維護中，等待財團授權。').setColor(0xF4A261)
        ];
        let currentPage = 0;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('trade_prev').setLabel('◀').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('trade_next').setLabel('▶').setStyle(ButtonStyle.Secondary)
        );

        const msg = await message.reply({ embeds: [pages[0]], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: '❌ 無權限操作', ephemeral: true });
            if (i.customId === 'trade_prev') currentPage = currentPage > 0 ? currentPage - 1 : pages.length - 1;
            if (i.customId === 'trade_next') currentPage = currentPage < pages.length - 1 ? currentPage + 1 : 0;
            await i.update({ embeds: [pages[currentPage]], components: [row] });
        });
        return;
    }

    // ---------------- 📈 UI 化機率列表 (!list) ----------------
    if (cmd === '!list') {
        const pages = [];
        for (const [rarity, baseRate] of Object.entries(RARITY_RATES)) {
            const upList = normalizeRateUpList(rarity);
            const allPool = (identitiesData.identities?.[rarity] || identitiesData[rarity] || []).map(x => typeof x === 'string' ? x : x.name);
            const stdPool = allPool.filter(id => !upList.includes(id));

            let desc = `**總基礎機率：** ${(baseRate * 100).toFixed(2)}%\n\n`;
            if (upList.length > 0) desc += `✨ **[Rate Up]** (每隻 ${((baseRate * 0.25) / upList.length * 100).toFixed(4)}%):\n${upList.map(i => `• ${i}`).join('\n')}\n\n`;
            if (stdPool.length > 0) desc += `🔹 **[普通]** (每隻 ${((baseRate * 0.75) / stdPool.length * 100).toFixed(4)}%):\n${stdPool.map(i => `• ${i}`).join('\n')}\n`;

            pages.push(new EmbedBuilder().setTitle(`📈 提取機率分析 - ${rarityToStars(rarity)}`).setColor(0x457B9D).setDescription(desc));
        }

        let currentPage = 0;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('list_prev').setLabel('◀').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('list_next').setLabel('▶').setStyle(ButtonStyle.Primary)
        );

        const msg = await message.reply({ embeds: [pages[0]], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: '❌ 這不是您的面板。', ephemeral: true });
            if (i.customId === 'list_prev') currentPage = currentPage > 0 ? currentPage - 1 : pages.length - 1;
            if (i.customId === 'list_next') currentPage = currentPage < pages.length - 1 ? currentPage + 1 : 0;
            await i.update({ embeds: [pages[currentPage]], components: [row] });
        });
        return;
    }

    if (cmd === '!checkrateupids') {
        const lines = [];
        ['Special', '0000', 'Egos', '000', '00', '0'].forEach(r => {
            const list = normalizeRateUpList(r);
            if(list.length > 0) lines.push(`**${r}**\n${list.map(v => `• ${v}`).join('\n')}`);
        });
        if (lines.length === 0) return message.reply('📭 目前沒有設定任何機率提升。');
        return message.reply(`📈 **目前機率提升項目總覽**\n\n${lines.join('\n\n')}`);
    }

    // ---------------- ⚔️ Discord UI 戰鬥系統 (!stages) ----------------
    if (cmd === '!stages') {
        if (player.team.length === 0) {
            return message.reply('⚠️ 主管，請先使用 `!team <人格名稱>` 編排隊伍。戰鬥需要人員。');
        }

        const embed = new EmbedBuilder()
            .setTitle('🗺️ 選擇作戰難度')
            .setDescription(`**當前出戰小隊 (${player.team.length}/7)：**\n${player.team.map(t=>`• ${t}`).join('\n')}\n\n*系統將綜合計算隊伍的 Speed, Coin, Clash Power 與 Sanity 決定勝負。*`)
            .setColor(0x1D3557);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('diff_select')
                .setPlaceholder('選擇戰鬥難度...')
                .addOptions([
                    { label: '沒難度', description: '敵方: 後巷流浪漢 (無威脅)', value: 'diff_1' },
                    { label: '輕鬆', description: '敵方: 後巷幫派', value: 'diff_2' },
                    { label: '中等', description: '敵方: 協會成員', value: 'diff_3' },
                    { label: '難', description: '敵方: 異想體', value: 'diff_4' },
                    { label: '地獄', description: '敵方: 高階收尾人', value: 'diff_5' }
                ])
        );

        const msg = await message.reply({ embeds: [embed], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) return i.reply({ content: '❌ 無權限操作', ephemeral: true });
            
            const diffMap = {
                'diff_1': { name: '後巷流浪漢', power: 80, reward: 50 },
                'diff_2': { name: '後巷幫派', power: 250, reward: 100 },
                'diff_3': { name: '協會成員', power: 500, reward: 300 },
                'diff_4': { name: '異想體', power: 1000, reward: 600 },
                'diff_5': { name: '高階收尾人', power: 2000, reward: 1500 }
            };

            const targetDiff = diffMap[i.values[0]];
            
            // 系統核心：基於完整屬性的 Clash 計算
            let playerClashPower = 0;
            const allIdentities = Object.values(identitiesData.identities || identitiesData).flat();

            player.team.forEach(member => {
                const info = allIdentities.find(id => typeof id === 'object' && id.name === member) || {};
                // 若屬性尚未實裝，則給予隨機基礎值防呆
                const speed = info.speed || Math.floor(Math.random()*5 + 3);
                const coin = info.coinPower || Math.floor(Math.random()*3 + 1);
                const clash = info.clashPower || Math.floor(Math.random()*15 + 10);
                const sanity = (Math.random() > 0.5 ? 45 : 0); 
                
                // 綜合計算威力
                playerClashPower += (speed * 1.5) + (clash * coin) + (sanity * 0.5);
            });

            // 引入波動亂數模擬擲硬幣
            const playerFinal = playerClashPower * (0.8 + (Math.random() * 0.4));
            const enemyFinal = targetDiff.power * (0.9 + (Math.random() * 0.2));
            const isWin = playerFinal >= enemyFinal;

            const battleEmbed = new EmbedBuilder()
                .setTitle(`⚔️ 戰鬥結算 VS ${targetDiff.name}`)
                .addFields(
                    { name: '🔹 小隊 Clash 總判定', value: `${Math.floor(playerFinal)}`, inline: true },
                    { name: '🔸 敵方 Clash 總判定', value: `${Math.floor(enemyFinal)}`, inline: true },
                    { name: '🏆 戰鬥結果', value: isWin ? '✅ 鎮壓成功' : '❌ 隊伍全滅 (精神崩潰)', inline: false }
                )
                .setColor(isWin ? 0x2A9D8F : 0xE63946);

            if (isWin) {
                player.lunacy += targetDiff.reward;
                saveDatabase();
                battleEmbed.setDescription(`恭喜通關！結算獲取 **${targetDiff.reward} Lunacy**。\n目前餘額: ${player.lunacy}`);
            } else {
                battleEmbed.setDescription(`任務失敗。請檢視陣容屬性與理智值配置。`);
            }

            await i.update({ embeds: [battleEmbed], components: [] });
        });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => console.error('❌ 登入失敗：', err));
