// Functions/Startup.js
'use strict';
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType, 
    Events,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
    Collection
} = require('discord.js');
const express = require('express');
const fs      = require('fs');
const path    = require('path');

// ─── 確保資料目錄與設定檔存在 ─────────────────────────────────
const BASE_DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_DIR   = path.join(BASE_DATA_DIR, 'players');
const CONFIG_PATH   = path.join(BASE_DATA_DIR, 'config.json');

try { fs.mkdirSync(PLAYERS_DIR, { recursive: true }); } catch {}

const defaultConfig = {
    notifyChannelId: process.env.NOTIFY_CHANNEL_ID || '',
    rateUpChannelId: process.env.RATEUP_ANNOUNCE_CHANNEL || '',
    newsChannelId:   process.env.NEWS_CHANNEL_ID || '',
};

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return { ...defaultConfig, ...JSON.parse(data) };
        }
    } catch (err) {
        console.error('⚠️ 讀取 config.json 失敗，使用預設值:', err.message);
    }
    return defaultConfig;
}

function saveConfig(newConfig) {
    try {
        const current = getConfig();
        const updated = { ...current, ...newConfig };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
        return updated;
    } catch (err) {
        console.error('❌ 儲存 config.json 失敗:', err.message);
        return null;
    }
}

const identitiesData         = require('./GameSystem/Pulls/identitiesData.js');
const { startNewsCheckLoop } = require('./Newscheck.js');
const { handleCommands }     = require('./Commanders.js');

const PORT = process.env.PORT || 3000;

// ─── Keep-alive HTTP server ────────────────────────────────────
const app = express();
app.get('/',       (_, res) => res.send('Angela is online.'));
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`🌐 HTTP server 已啟動 port ${PORT}`));

// ─── Discord client ────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ─── 載入指令模組（pullmenu.js 等）────────────────────────────
client.commands = new Collection();
try {
    const pullCmd = require('./pullmenu.js');
    if (pullCmd?.data && typeof pullCmd?.execute === 'function') {
        client.commands.set(pullCmd.data.name, pullCmd);
        console.log(`[Startup] ✅ 載入指令: /${pullCmd.data.name}`);
    }
} catch (err) {
    console.error('[Startup] pullmenu.js 載入失敗:', err.message);
}

// ─── 內建斜線指令 (已去重：僅保留唯一定義) ────────────────────────
const allSlashCommands = [
 // 1. 抽卡
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('進行抽取人格/E.G.O')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('選擇抽卡次數')
                .addChoices(
                    { name: '單抽 (1次)', value: 1 },
                    { name: '十連抽 (10次)', value: 10 }
                )),


    // 2. 背包與機率
    new SlashCommandBuilder().setName('pack').setDescription('查看 LC 主頁式背包與資源介面'),
    new SlashCommandBuilder().setName('list').setDescription('查看當前卡池機率與清單'),

    // 3. 戰鬥與隊伍
    new SlashCommandBuilder().setName('battle').setDescription('選擇難度進入戰鬥並獲取狂氣'),
    new SlashCommandBuilder().setName('party').setDescription('查看與管理出戰隊伍陣容'),

    // 4. 罪人管理
    new SlashCommandBuilder().setName('sinner').setDescription('查看罪人詳細資料與清單'),
    new SlashCommandBuilder().setName('uptie').setDescription('進行罪人人格/E.G.O 連結提升'),
    new SlashCommandBuilder().setName('equip').setDescription('更換罪人裝備與人格'),
    new SlashCommandBuilder().setName('threads').setDescription('查詢當前持有絲線與資源'),

    // 5. 鏡光迷宮
    new SlashCommandBuilder().setName('md').setDescription('開啟或查看鏡光迷宮進度'),

    // 6. 娛樂小工具
    new SlashCommandBuilder()
        .setName('gayrate')
        .setDescription('測量目標的男同指數')
        .addUserOption(opt => opt.setName('target').setDescription('要測試的目標對象 (預設為自己)')),

    new SlashCommandBuilder()
        .setName('lesbianrate')
        .setDescription('測量目標的女同指數')
        .addUserOption(opt => opt.setName('target').setDescription('要測試的目標對象 (預設為自己)')),

       // 6.5 語音頻道控制
    new SlashCommandBuilder().setName('join').setDescription('讓機器人加入你目前所在的語音頻道'),
    new SlashCommandBuilder().setName('leave').setDescription('讓機器人離開目前所在的語音頻道'),
    new SlashCommandBuilder().setName('status').setDescription('查看機器人目前的運行狀態'),
    
    // 7. 說明選單
    new SlashCommandBuilder().setName('help').setDescription('顯示 Angela 系統全部斜線指令選單'),

    // ─── 伺服器管理員專用指令 ───────────────────────────────────
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('【伺服器管理員】設定 Angela 系統各項通知頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('請選擇要設定的頻道類型')
                .setRequired(true)
                .addChoices(
                    { name: '🟢 系統上線通知頻道', value: 'notify' },
                    { name: '📢 Rate Up 抽卡公告頻道', value: 'rateup' },
                    { name: '📰 新聞與社群動態頻道', value: 'news' },
                ))
        .addChannelOption(option =>
            option.setName('target_channel')
                .setDescription('選擇目標文字頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('steam')
        .setDescription('【伺服器管理員】手動觸發 Steam 最新更新檢測')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tweet')
        .setDescription('【伺服器管理員】手動觸發 Twitter 最新推文檢測')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('【伺服器管理員】手動觸發 YouTube 最新影片檢測')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ─── 最高特權擁有者專用指令 (僅限 Sles ID: 1330463890122735642) ───
    new SlashCommandBuilder()
        .setName('givelunacy')
        .setDescription('👑【Sles 專屬】發放狂氣 (可給個人或全伺服器)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家 (若發給全服可留空)'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家 (預設 False)')),

    new SlashCommandBuilder()
        .setName('givefragments')
        .setDescription('👑【Sles 專屬】發放碎片 (可給個人或全伺服器)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家 (若發給全服可留空)'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家 (預設 False)')),

    new SlashCommandBuilder()
        .setName('givescrolls')
        .setDescription('👑【Sles 專屬】發放抽卡券 (可給個人或全伺服器)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家 (若發給全服可留空)'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家 (預設 False)')),

    new SlashCommandBuilder()
        .setName('givethreads')
        .setDescription('👑【Sles 專屬】發放絲線 (可給個人或全伺服器)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家 (若發給全服可留空)'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家 (預設 False)')),

    new SlashCommandBuilder()
        .setName('updaterewards')
        .setDescription('👑【Sles 專屬】更新獎勵設置')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('updatebuff')
        .setDescription('👑【Sles 專屬】更新倍率 Buff')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// ─── 工具函式 ──────────────────────────────────────────────────
function rarityLabel(rarity) {
    return ({
        'Color Fixer': '👑 Color Fixer',
        'Special':     '🌀 Special',
        '0000':        '✨ ★★★★',
        'Egos':        '🔮 E.G.O',
        '000':         '★★★',
        '00':          '★★',
        '0':           '★'
    })[rarity] || rarity;
}

async function announceCurrentRateUps(botClient) {
    const config = getConfig();
    if (!config.rateUpChannelId) return;

    try {
        const channel = await botClient.channels.fetch(config.rateUpChannelId);
        if (!channel) return;

        const up = identitiesData.upTargets || {};
        const sections = Object.entries(up)
            .filter(([, v]) => Array.isArray(v) && v.length)
            .map(([r, items]) => `### ${rarityLabel(r)}\n${items.map(i => `• ${i}`).join('\n')}`);
            
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(0xffd166)
                .setTitle('📢 Rate Up 人格與物資資料已成功載入')
                .setDescription(sections.length ? sections.join('\n\n') : '目前沒有設定任何 Rate Up 對象。')
                .setTimestamp()],
        });
    } catch (err) {
        console.error('❌ Rate Up 公告發送失敗:', err.message);
    }
}

// ─── 處理斜線指令 (InteractionCreate) ─────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setchannel') {
        const type = interaction.options.getString('type');
        const targetChannel = interaction.options.getChannel('target_channel');

        if (type === 'notify') {
            saveConfig({ notifyChannelId: targetChannel.id });
            await interaction.reply({
                content: `「主管，系統上線通知頻道已重定向至 ${targetChannel}。」`,
                flags: MessageFlags.Ephemeral
            });
        } else if (type === 'rateup') {
            saveConfig({ rateUpChannelId: targetChannel.id });
            await interaction.reply({
                content: `「主管，Rate Up 公告發射頻道已重定向至 ${targetChannel}。」`,
                flags: MessageFlags.Ephemeral
            });
        } else if (type === 'news') {
            saveConfig({ newsChannelId: targetChannel.id });
            await interaction.reply({
                content: `「主管，新聞與社群監測頻道已重定向至 ${targetChannel}。」`,
                flags: MessageFlags.Ephemeral
            });
        }
        return;
    }

    try {
        await handleCommands(client, interaction);
    } catch (err) {
        console.error('❌ 斜線指令執行錯誤:', err.stack || err.message);
        const errorMsg = { content: `「系統錯誤：${err.message}」`, flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorMsg).catch(() => {});
        } else {
            await interaction.reply(errorMsg).catch(() => {});
        }
    }
});

// ─── 上線事件：清除舊全域指令，並重置伺服器區域指令 ─────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`);

    try {
        // 🔥 關鍵修復：清空舊全域指令，防止 Discord 殘留重複指令
        await client.application.commands.set([]);
        
        const commandData = allSlashCommands.map(cmd => cmd.toJSON());
        for (const guild of client.guilds.cache.values()) {
            await guild.commands.set(commandData);
        }
        console.log('✅ 全域舊指令已清空，伺服器區域指令已重新註冊！');
    } catch (err) {
        console.error('❌ 註冊斜線指令失敗:', err.message);
    }

    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: ActivityType.Custom, state: '羅蘭。我不能在這裡停下。哪怕這是一條沒有盡頭的荊棘之路，哪怕最後只能迎來毫無意義的毀滅……我也要親手為這長達百年的悲劇畫上句號' }],
    });

    const config = getConfig();
    if (config.notifyChannelId) {
        try {
            const channel = await client.channels.fetch(config.notifyChannelId);
            if (channel) {
                await channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
                        .setColor(0x00b4d8)
                        .setDescription('「主管，精神脈衝已重新對齊。\n全域舊指令已抹除，特權與新聞檢測模組已完美校正。」')
                        .setTimestamp()],
                });
            }
        } catch (err) {
            console.error('❌ 上線報告發送失敗:', err.message);
        }
    }

    await announceCurrentRateUps(client);
    startNewsCheckLoop(client);
    console.log('📡 [排程] Newscheck 循環已啟動');
});

// ─── 錯誤保護與登入 ───────────────────────────────────────────
client.on('error', err => console.error('Discord 客戶端錯誤:', err.message));
process.on('unhandledRejection', err => console.error('未捕捉的 Promise 拒絕:', err?.message || err));
process.on('uncaughtException', err => console.error('未捕捉的例外錯誤:', err?.message || err));

module.exports = { getConfig, saveConfig };

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN || TOKEN === 'DISCORD_TOKEN') {
    console.error('❌ 請設定環境變數 DISCORD_TOKEN');
    process.exit(1);
}
client.login(TOKEN);
