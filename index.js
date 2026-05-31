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
const fetch = require('node-fetch');

// 載入抽卡資料池
const identitiesData = require('./identitiesData.js');

const app = express();
const PORT = process.env.PORT || 3000;

const systemStartTime = new Date();
let totalTweetsChecked = 0;
let globalRewardMultiplier = 1.0; // 預設關卡獎勵倍率 (!updatebuff 調整)

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

// 配置頻道與身分組 ID
const NOTIFY_CHANNEL_ID = '1402282604165730348';
const PING_ROLE_MENTION = '<@&1406984068725211177>';

// 鎖定主管唯一的 Discord User ID
const OWNER_ID = '1330463890122735642';

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
        console.error("讀取存檔失敗:", e);
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
        db[userId] = {
            username: username,
            lunacy: 1300,
            identities: [],
            egos: [],
            team: [], 
            equipped: null,
            level: 1,
            exp: 0,
            thread: 0
        };
        savePlayerData(db);
        return true;
    }
    if (!db[userId].team) db[userId].team = [];
    if (!db[userId].egos) db[userId].egos = [];
    if (!db[userId].identities) db[userId].identities = [];
    return false;
}

// 根據人格名稱與稀有度推導戰鬥面板數值
function calculateIdentityStats(name, rarity) {
    let hp = 130, atk = 14, def = 11, speed = 4, clashPower = 8, coinPower = 2;
    if (rarity === '00') { hp = 160; atk = 16; def = 13; speed = 5; clashPower = 10; coinPower = 3; }
    if (rarity === '000') { hp = 195; atk = 19; def = 14; speed = 6; clashPower = 12; coinPower = 4; }
    if (rarity === '0000') { hp = 230; atk = 23; def = 16; speed = 6; clashPower = 14; coinPower = 5; }
    if (rarity === 'Special') { hp = 260; atk = 25; def = 18; speed = 7; clashPower = 15; coinPower = 5; }
    if (rarity === 'Color Fixer') { hp = 310; atk = 32; def = 22; speed = 8; clashPower = 18; coinPower = 6; }
    if (rarity === 'Egos') { hp = 200; atk = 22; def = 15; speed = 5; clashPower = 16; coinPower = 4; }

    return { name, rarity, hp, maxHp: hp, atk, def, speed, clashPower, coinPower };
}

// ----------------- 扭蛋概率 -----------------
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

const pullIdentity = typeof identitiesData.pullIdentity === 'function'
    ? identitiesData.pullIdentity
    : (rarity) => {
        const pool = identitiesData.identities[rarity] || [];
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : `未知實體角色(${rarity})`;
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

// ----------------- Steam 新聞獲取模組 -----------------
async function getLatestSteamNews() {
    const response = await fetch('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1973530&count=1');
    if (!response.ok) throw new Error(`Steam API 回應錯誤: ${response.status}`);
    const data = await response.json();
    return data?.appnews?.newsitems?.[0] || null;
}

async function checkSteamUpdates(isManual = false, messageContext = null) {
    try {
        const newsItem = await getLatestSteamNews();
        if (!newsItem) return;

        const targetUrl = `https://store.steampowered.com/news/app/1973530?l=tchinese`;

        if (!lastSteamNewsId) {
            lastSteamNewsId = newsItem.gid;
            console.log(`📦 [Steam] 初始公告快取建立：${newsItem.gid}`);
            if (!isManual) return;
        }

        if (newsItem.gid !== lastSteamNewsId || isManual) {
            if(!isManual) lastSteamNewsId = newsItem.gid;

            let cleanContent = newsItem.contents.replace(/<\/?[^>]+(>|$)/g, "").substring(0, 300) + '...';
            const steamEmbed = new EmbedBuilder()
                .setTitle(`📢 Limbus Company — Steam 官方重要公告`)
                .setURL(targetUrl)
                .setDescription(`### **${newsItem.title}**\n\n${cleanContent}\n\n[👉 點擊此處查閱繁體中文官方完整板資訊](${targetUrl})`)
                .setColor(0x1a3a6c)
                .setFooter({ text: `新聞識別碼: ${newsItem.gid}` })
                .setTimestamp();

            if (isManual && messageContext) {
                await messageContext.reply({ embeds: [steamEmbed] });
            } else {
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    await channel.send({
                        content: `🔔 ${PING_ROLE_MENTION} **監測到邊獄公司發布了全新 Steam 貼文！**`,
                        embeds: [steamEmbed]
                    });
                }
            }
        }
    } catch (err) {
        console.error(`⚠️ Steam 新聞模組故障: ${err.message}`);
        if (isManual && messageContext) messageContext.reply('❌ 無法連線至 Steam 伺服器，請稍後再試。');
    }
}

// ----------------- Twitter 模組 -----------------
function parseLatestItem(xml) {
    const itemMatch = xml.match(/<item>[\s\S]*?<\/item>/);
    if (!itemMatch) return null;
    const item = itemMatch[0];
    const link = item.match(/<link>(.*?)<\/link>/)?.[1];
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];
    if (!link || !guid) return null;
    return { link: link.trim(), id: guid.trim() };
}

async function checkTwitterUpdates() {
    totalTweetsChecked++;
    for (const nodeUrl of NITTER_NODES) {
        try {
            const response = await fetch(`${nodeUrl}/${TARGET_USER.username}/rss`);
            if (!response.ok) continue;
            const text = await response.text();
            const data = parseLatestItem(text);
            if (!data) continue;

            if (!lastFetchedId) {
                lastFetchedId = data.id;
                break;
            }
            if (data.id !== lastFetchedId) {
                lastFetchedId = data.id;
                const cleanLink = data.link.split('#')[0].replace(/^https:\/\/[^/]+/, 'https://vxtwitter.com');
                const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
                if (channel) {
                    await channel.send({ content: `🔔 ${PING_ROLE_MENTION} **Project Moon 官方發布最新推特公告：**\n${cleanLink}` });
                }
            }
            break;
        } catch (e) {
            // 自動嘗試備援節點
        }
    }
}

// Express 確保運行
app.get('/', (req, res) => res.sendStatus(200));
app.listen(PORT, () => console.log(`Web 伺服器端口 ${PORT} 已就緒`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`🤖 Angela 已成功上線：${client.user.tag}`);
    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: '管理員的指令對齊中' }]
    });
    
    // 背景輪詢排程
    setInterval(() => {
        checkTwitterUpdates();
        checkSteamUpdates(false);
    }, 60 * 1000);
});

// ----------------- 訊息控制核心 -----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const db = loadPlayerData();
    checkAndRegisterPlayer(db, message.author.id, message.author.username);

    const msg = message.content.trim();
    const args = msg.split(/\s+/);

    if (msg === '!ping') return message.reply('pong！');
    if (msg === '主管' || msg === '管理員') return message.reply('主管，您好。我是您的 AI 助理 Angela。請隨時下達指令。');

    // 手動 Steam 指令
    if (msg === '!steam') {
        return checkSteamUpdates(true, message);
    }

    // ----------------- 主管專屬高級權限指令 -----------------
    if (msg.startsWith('!givelunacy') || msg.startsWith('!updaterewards') || msg.startsWith('!updatebuff')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ 權限同步失敗：您並非特定協議最高管理員。');
        }

        // !givelunacy @user 數量
        if (msg.startsWith('!givelunacy')) {
            const mention = message.mentions.users.first();
            const amount = parseInt(args[args.length - 1]);
            if (!mention || isNaN(amount)) return message.reply('❌ 語法錯誤：`!givelunacy @username 1300`');
            
            checkAndRegisterPlayer(db, mention.id, mention.username);
            db[mention.id].lunacy += amount;
            savePlayerData(db);
            return message.reply(`✅ 已成功向 <@${mention.id}> 注入 **${amount}** 點狂氣。`);
        }

        // !updaterewards 數量 (直接給予主管自己 Lunacy)
        if (msg.startsWith('!updaterewards')) {
            const amount = parseInt(args[1]);
            if (isNaN(amount)) return message.reply('❌ 語法錯誤：`!updaterewards <數量>`');
            
            db[OWNER_ID].lunacy += amount;
            savePlayerData(db);
            return message.reply(`✅ 成功向主管帳戶直接注入 **${amount}** 點狂氣！目前餘額：${db[OWNER_ID].lunacy}`);
        }

        // !updatebuff 倍率 (修改迷宮獎勵倍率)
        if (msg.startsWith('!updatebuff')) {
            const value = parseFloat(args[1]);
            if (isNaN(value) || value <= 0) return message.reply('❌ 語法錯誤：`!updatebuff <倍率>` (例如 1.5 或 2)');
            
            globalRewardMultiplier = value;
            return message.reply(`⚙️ 核心協議變更：全服鏡像迷宮通關收益倍率已成功調整為 **${globalRewardMultiplier}x**！`);
        }
    }

    // ----------------- 抽卡指令 -----------------
    if (msg === '!pull' || msg === '!10pulls') {
        const player = db[message.author.id];
        const cost = msg === '!10pulls' ? 1300 : 130;
        if (player.lunacy < cost) return message.reply(`❌ 狂氣不足！尚缺 ${cost - player.lunacy} 點。`);

        player.lunacy -= cost;
        const totalRolls = msg === '!10pulls' ? 10 : 1;
        const results = [];

        for (let i = 1; i <= totalRolls; i++) {
            const isGuaranteed = (msg === '!10pulls' && i === 10);
            const rolledRarity = rollRarity(isGuaranteed);
            const finalName = pullIdentity(rolledRarity);

            results.push({ name: finalName, rarity: rolledRarity });

            if (rolledRarity === 'Egos') {
                if (!player.egos.includes(finalName)) player.egos.push(finalName);
            } else {
                if (!player.identities.includes(finalName)) player.identities.push(finalName);
            }
        }

        savePlayerData(db);
        const embed = new EmbedBuilder()
            .setTitle(msg === '!10pulls' ? '✨ 提取報告 - 十連抽結果' : '🎯 提取報告 - 單抽結果')
            .setColor(0xffd166)
            .setDescription(results.map(r => `${r.name} (${rarityToStars(r.rarity)})`).join('\n'));
        return message.reply({ embeds: [embed] });
    }

    // ----------------- !list：動態概率觀測站 -----------------
    if (msg === '!list') {
        const embed = new EmbedBuilder()
            .setTitle('🗂️ 核心控制室 — 當前扭蛋池抽取機率清單')
            .setColor(0x3a0ca3)
            .setDescription('各稀有度分配機率將依據池內現有人格總量進行等比精確正規化劃分：\n\n' + 
                Object.keys(BASE_RATES).map(rarity => {
                    const pool = identitiesData.identities[rarity] || [];
                    const poolSize = pool.length;
                    const basePercent = (BASE_RATES[rarity] * 100).toFixed(4);
                    
                    if (poolSize === 0) return `### ${rarityToStars(rarity)} (總: ${basePercent}%)\n* 池內暫無可抽到的人格`;
                    
                    const individualPercent = ((BASE_RATES[rarity] / poolSize) * 100).toFixed(4);
                    return `### ${rarityToStars(rarity)} (總: ${basePercent}%)\n• 單體概率: \`${individualPercent}%\` (共 ${poolSize} 位)\n\`\`\`${pool.slice(0, 10).join(', ')}${pool.length > 10 ? '...' : ''}\`\`\``;
                }).join('\n')
            );
        return message.reply({ embeds: [embed] });
    }

    // ----------------- !pack：背包分頁 + UI組隊 -----------------
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
                .setDescription(`### **持有清單 (${start + 1}~${Math.min(start + pageSize, allItems.length)} / 總共 ${allItems.length} 個)**\n` + 
                    (currentItems.map((v, idx) => `**${start + idx + 1}.** ${v}`).join('\n') || '* 暫無任何物資，請使用 !pull 進行人格提取'))
                .setFooter({ text: `分頁: ${page + 1} / ${totalPages}` });
        };

        const makeComponents = (page) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pack_prev').setLabel('◀ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('pack_next').setLabel('下一頁 ▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1),
                new ButtonBuilder().setCustomId('pack_setteam').setLabel('👥 配置出擊隊伍').setStyle(ButtonStyle.Success).setDisabled(player.identities.length === 0)
            );
            return [row];
        };

        const packMsg = await message.reply({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
        const collector = packMsg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: '❌ 您無權操作他人的核心面板。', ephemeral: true });
            }

            if (interaction.customId === 'pack_prev') {
                currentPage--;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_next') {
                currentPage++;
                await interaction.update({ embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            } else if (interaction.customId === 'pack_setteam') {
                const selectOptions = player.identities.slice(0, 25).map(name => ({
                    label: name.substring(0, 25),
                    value: name
                }));

                const teamMenu = new StringSelectMenuBuilder()
                    .setCustomId('team_select_menu')
                    .setPlaceholder('請勾選欲派上戰場的人格(最多可選 7 人)...')
                    .setMinValues(1)
                    .setMaxValues(Math.min(7, selectOptions.length))
                    .addOptions(selectOptions);

                const cancelBtn = new ButtonBuilder().setCustomId('team_cancel').setLabel('返回背包').setStyle(ButtonStyle.Secondary);

                await interaction.update({
                    content: '💡 **提示：** 請在下方選單中多選您想要派上場的 1 ~ 7 位罪人：',
                    components: [new ActionRowBuilder().addComponents(teamMenu), new ActionRowBuilder().addComponents(cancelBtn)]
                });
            } else if (interaction.customId === 'team_cancel') {
                await interaction.update({ content: '', embeds: [makeEmbed(currentPage)], components: makeComponents(currentPage) });
            }
        });
    }

    // ----------------- !trade：全 UI 自動化安全交易 -----------------
    if (msg.startsWith('!trade')) {
        const receiverUser = message.mentions.users.first();
        if (!receiverUser || receiverUser.id === message.author.id) {
            return message.reply('❌ 交易協定瑕疵：請標記一位有效的其他玩家。範例：`!trade @用戶`');
        }

        const senderId = message.author.id;
        const receiverId = receiverUser.id;

        if (!db[receiverId]) return message.reply('❌ 對方尚未在控制室內留存心智共鳴對齊檔案。');

        const pSender = db[senderId];
        const pReceiver = db[receiverId];

        if (!pSender.identities.length || !pReceiver.identities.length) {
            return message.reply('❌ 雙方均需要至少持有一位人格才能啟動特許互換機制。');
        }

        let senderChosen = null;
        let receiverChosen = null;
        let senderConfirmed = false;
        let receiverConfirmed = false;

        const makeTradeEmbed = () => {
            return new EmbedBuilder()
                .setTitle('🤝 邊獄公司 — 特許物資互換雙向協議')
                .setColor(0xff9f1c)
                .setDescription(`**發起人:** <@${senderId}>\n**接收人:** <@${receiverId}>\n\n` +
                    `🔹 **發起人投入:** \`${senderChosen || '請由下方選單挑選...'}\` (確認狀態: ${senderConfirmed ? '✅ 已鎖定' : '⏳ 等待中'})\n` +
                    `🔸 **接收人投入:** \`${receiverChosen || '請由下方選單挑選...'}\` (確認狀態: ${receiverConfirmed ? '✅ 已鎖定' : '⏳ 等待中'})`)
                .setFooter({ text: '注意：雙方皆挑選好並點擊各自的確認後，系統即自動交換。' });
        };

        const makeTradeComponents = () => {
            const senderMenu = new StringSelectMenuBuilder()
                .setCustomId('trade_sender_pick')
                .setPlaceholder('👉 發起人挑選欲換出的人格...')
                .addOptions(pSender.identities.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));

            const receiverMenu = new StringSelectMenuBuilder()
                .setCustomId('trade_receiver_pick')
                .setPlaceholder('👉 接收人挑選欲換出的人格...')
                .addOptions(pReceiver.identities.slice(0, 25).map(v => ({ label: v.substring(0, 25), value: v })));

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('trade_confirm').setLabel('鎖定並確認此交易').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('trade_abort').setLabel('單方面取消交易').setStyle(ButtonStyle.Danger)
            );

            return [
                new ActionRowBuilder().addComponents(senderMenu),
                new ActionRowBuilder().addComponents(receiverMenu),
                actionRow
            ];
        };

        const tradeMsg = await message.reply({ embeds: [makeTradeEmbed()], components: makeTradeComponents() });
        const collector = tradeMsg.createMessageComponentCollector({ time: 90000 });

        collector.on('collect', async (inter) => {
            if (inter.user.id !== senderId && inter.user.id !== receiverId) {
                return inter.reply({ content: '❌ 您並非本交易協議的利害關係人。', ephemeral: true });
            }

            if (inter.customId === 'trade_sender_pick') {
                if (inter.user.id !== senderId) return inter.reply({ content: '❌ 這是發起人專屬的欄位。', ephemeral: true });
                senderChosen = inter.values[0];
                senderConfirmed = false; 
                await inter.update({ embeds: [makeTradeEmbed()] });
            } 
            else if (inter.customId === 'trade_receiver_pick') {
                if (inter.user.id !== receiverId) return inter.reply({ content: '❌ 這是接收人專屬的欄位。', ephemeral: true });
                receiverChosen = inter.values[0];
                receiverConfirmed = false;
                await inter.update({ embeds: [makeTradeEmbed()] });
            } 
            else if (inter.customId === 'trade_confirm') {
                if (inter.user.id === senderId) {
                    if (!senderChosen) return inter.reply({ content: '❌ 您尚未挑選任何換出物資。', ephemeral: true });
                    senderConfirmed = true;
                }
                if (inter.user.id === receiverId) {
                    if (!receiverChosen) return inter.reply({ content: '❌ 您尚未挑選任何換出物資。', ephemeral: true });
                    receiverConfirmed = true;
                }

                if (senderConfirmed && receiverConfirmed) {
                    const freshDb = loadPlayerData();
                    if (!freshDb[senderId].identities.includes(senderChosen) || !freshDb[receiverId].identities.includes(receiverChosen)) {
                        return inter.update({ content: '❌ 交易失敗：雙方背包物資狀態在傳輸期間已發生實體變異。', embeds: [], components: [] });
                    }

                    freshDb[senderId].identities = freshDb[senderId].identities.filter(v => v !== senderChosen);
                    freshDb[receiverId].identities = freshDb[receiverId].identities.filter(v => v !== receiverChosen);
                    freshDb[senderId].identities.push(receiverChosen);
                    freshDb[receiverId].identities.push(senderChosen);

                    savePlayerData(freshDb);
                    collector.stop();
                    return inter.update({
                        content: `🎉 **物資對齊交易成功！**\n🤝 <@${senderId}> 獲得了 \`${receiverChosen}\`\n🤝 <@${receiverId}> 獲得了 \`${senderChosen}\``,
                        embeds: [], components: []
                    });
                } else {
                    await inter.update({ embeds: [makeTradeEmbed()] });
                }
            } 
            else if (inter.customId === 'trade_abort') {
                collector.stop();
                return inter.update({ content: `❌ 本特許交易已被 <@${inter.user.id}> 撤銷中止。`, embeds: [], components: [] });
            }
        });
    }

    // ----------------- 鏡像衝突戰鬥關卡系統 -----------------
    if (msg === '!stages') {
        const embed = new EmbedBuilder()
            .setTitle('🧭 邊獄巴士 - 鏡像迷宮觀測站')
            .setColor(0xf72585)
            .setDescription(`請選擇欲派遣隊伍前往突入的心理防衛關卡難度。\n*當前全伺服器收益倍率：**${globalRewardMultiplier}x***`);

        const menu = new StringSelectMenuBuilder()
            .setCustomId('select_stage')
            .setPlaceholder('選擇戰術挑戰難度...')
            .addOptions([
                { label: '沒難度 - 後巷流浪漢', description: `基礎 50 狂氣 (目前 ${Math.round(50 * globalRewardMultiplier)})`, value: 'stage_1' },
                { label: '輕鬆 - 後巷幫派', description: `基礎 100 狂氣 (目前 ${Math.round(100 * globalRewardMultiplier)})`, value: 'stage_2' },
                { label: '中等 - 協會成員', description: `基礎 200 狂氣 (目前 ${Math.round(200 * globalRewardMultiplier)})`, value: 'stage_3' },
                { label: '難 - 異想體收容洩漏', description: `基礎 400 狂氣 (目前 ${Math.round(400 * globalRewardMultiplier)})`, value: 'stage_4' },
                { label: '地獄 - 高階收尾人', description: `基礎 800 狂氣 (目前 ${Math.round(800 * globalRewardMultiplier)})`, value: 'stage_5' }
            ]);

        return message.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // 常駐協助選單
    if (msg === '!help' || msg === '!cmds') {
        const embed = new EmbedBuilder()
            .setTitle('📋 Angela 的中央控制核心指令總覽')
            .setColor(0x06d6a0)
            .addFields(
                { name: '🚀 抽取人格', value: '`!pull` (130 狂氣) | `!10pulls` (1300 狂氣，含正規保底)', inline: false },
                { name: '🎒 個人物資', value: '`!pack` (內建分頁與 **👥 UI配置隊伍功能**)', inline: false },
                { name: '🗂️ 核心概率', value: '`!list` (查閱扭蛋池內各稀有度單體動態隨機概率)', inline: false },
                { name: '⚔️ 戰術出擊', value: '`!stages` (突入鏡像衝突戰鬥迷宮，收益受倍率調整影響)', inline: false },
                { name: '🤝 特許交易', value: '`!trade @用戶` (雙向安全 UI 下拉選單式智慧交易系統)', inline: false },
                { name: '📡 官方監控', value: '`!steam` (即時抓取 Steam 繁中活動公告)', inline: false },
                { name: '👑 管理員專屬', value: '`!updaterewards 數量` | `!updatebuff 倍率` | `!givelunacy @用戶 數量`', inline: false }
            );
        return message.reply({ embeds: [embed] });
    }
});

// ----------------- 處理跨組件互動 -----------------
client.on('interactionCreate', async (interaction) => {
    const db = loadPlayerData();
    const player = db[interaction.user.id];

    // 處理背包下拉選單組隊
    if (interaction.isStringSelectMenu() && interaction.customId === 'team_select_menu') {
        player.team = interaction.values; 
        savePlayerData(db);
        return interaction.update({
            content: `✅ **戰術出擊名單編制完畢！**\n當前上場的人格共計 **${player.team.length}** 位：\n\`\`\`${player.team.join(', ')}\`\`\``,
            embeds: [],
            components: []
        });
    }

    // 處理迷宮關卡戰鬥系統
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_stage') {
        if (!player || !player.team || player.team.length === 0) {
            return interaction.reply({ content: '❌ 您的出擊隊伍目前為空。請先去 `!pack` 點擊配置隊伍！', ephemeral: true });
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
                const dmg = active.atk * 2;
                enemyHp -= dmg;
                logs.push(`[T${turn}] ⚔️ **拼點勝出** | ${active.name.substring(0,6)}... 痛擊對手造成 ${dmg} 點創傷`);
            } else {
                const dmg = targetStage.clashPower * 2;
                active.hp -= dmg;
                logs.push(`[T${turn}] 🔺 **拼點敗北** | 戰隊遭受打擊，${active.name.substring(0,6)}... 扣減 ${dmg} HP`);
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
                .setDescription(`### **順利擊破：${targetStage.name}**\n${logs.slice(-2).join('\n')}\n\n**🎁 獎勵分配：**\n核發 💎 **${dynamicReward}** 狂氣 (內含 ${globalRewardMultiplier}x 協議乘數)！`);
        } else {
            endEmbed.setTitle('🛑 觀測中斷 - 隊伍潰散')
                .setColor(0xd90429)
                .setDescription(`### **未成功突破：${targetStage.name}**\n${logs.slice(-2).join('\n')}\n\n「主管，脈衝振幅過大，建議重新調整您的出擊隊伍配置。」`);
        }

        return interaction.editReply({ embeds: [endEmbed] });
    }
});

const TOKEN = process.env.DISCORD_TOKEN;
client.login(TOKEN).catch(err => console.error('❌ 密鑰連線阻斷:', err));
