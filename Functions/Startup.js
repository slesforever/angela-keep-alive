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
    MessageFlags
} = require('discord.js');
const express = require('express');
const fs      = require('fs');
const path    = require('path');

// ─── 確保資料目錄與設定檔存在 ─────────────────────────────────
const BASE_DATA_DIR = path.join(process.cwd(), 'data');
const PLAYERS_DIR   = path.join(BASE_DATA_DIR, 'players');
const CONFIG_PATH   = path.join(BASE_DATA_DIR, 'config.json');

try { fs.mkdirSync(PLAYERS_DIR, { recursive: true }); } catch {}

// 預設設定檔結構
const defaultConfig = {
    notifyChannelId: process.env.NOTIFY_CHANNEL_ID || '',
    rateUpChannelId: process.env.RATEUP_ANNOUNCE_CHANNEL || '',
    newsChannelId:   process.env.NEWS_CHANNEL_ID || '',
};

// 讀取設定檔
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

// 儲存設定檔
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

// ─── 斜線指令選單定義 ──────────────────────────────────────────
const slashCommands = [
    // 頻道設定
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('【管理員】設定 Angela 系統各項通知與發射頻道')
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

    // 抽卡
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('進行抽卡')
        .addIntegerOption(opt =>
            opt.setName('count')
                .setDescription('抽卡次數')
                .addChoices(
                    { name: '單抽 (1次)', value: 1 },
                    { name: '十連抽 (10次)', value: 10 }
                )),

    // 背包 & 清單
    new SlashCommandBuilder().setName('pack').setDescription('查看 LC 主頁式背包介面'),
    new SlashCommandBuilder().setName('list').setDescription('查看全池機率與可獲得清單'),

    // 戰鬥 & 隊伍
    new SlashCommandBuilder().setName('battle').setDescription('選擇難度出戰關卡'),
    new SlashCommandBuilder().setName('party').setDescription('隊伍陣容查看與管理'),

    // 罪人系統
    new SlashCommandBuilder().setName('sinner').setDescription('罪人清單與詳細資訊'),
    new SlashCommandBuilder().setName('uptie').setDescription('進行罪人連結提升'),
    new SlashCommandBuilder().setName('equip').setDescription('更換罪人裝備與人格'),
    new SlashCommandBuilder().setName('threads').setDescription('查詢當前絲線與資源'),

    // 鏡光迷宮
    new SlashCommandBuilder().setName('md').setDescription('開啟或查看鏡光迷宮狀態'),

    // 新聞測試
    new SlashCommandBuilder().setName('steam').setDescription('手動觸發測試 Steam 最新公告'),
    new SlashCommandBuilder().setName('tweet').setDescription('手動觸發測試 Twitter 最新推文'),
    new SlashCommandBuilder().setName('yt').setDescription('手動觸發測試 YouTube 最新影片'),

    // 管理員發放指令
    new SlashCommandBuilder().setName('givelunacy').setDescription('[管理員] 發放狂氣').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('givefragments').setDescription('[管理員] 發放碎片').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('givescrolls').setDescription('[管理員] 發放抽卡券').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('givethreads').setDescription('[管理員] 發放絲線').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('updaterewards').setDescription('[管理員] 更新獎勵設置').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('updatebuff').setDescription('[管理員] 更新倍率 Buff').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Help
    new SlashCommandBuilder().setName('help').setDescription('顯示 Angela 機器人指令清單')
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

// ─── 處理斜線指令 (Interaction) ───────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // 1. 特殊指令 /setchannel 本地邏輯
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

    // 2. 其他所有斜線指令統一傳給 Commanders.js 處理
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

// ─── 上線事件與註冊斜線指令 ────────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`);

    // 一次性將所有斜線指令自動註冊給 Discord
    try {
        await client.application.commands.set(slashCommands.map(cmd => cmd.toJSON()));
        console.log('✅ 所有斜線指令（Slash Commands）已自動註冊完畢！');
    } catch (err) {
        console.error('❌ 註冊斜線指令失敗:', err.message);
    }

    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: ActivityType.Custom, state: 'Sles被我吃掉了' }],
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
                        .setDescription('「主管，精神脈衝已重新對齊。\n核心系統與指令發射器已就緒，隨時待命。」\n\n請直接輸入 `/help` 或 `/` 即可開啟指令選單。')
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
