// Functions/Startup.js
'use strict';
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType, 
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
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
};

function getConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return { ...defaultConfig, ...JSON.parse(data) };
        }
    } catch (err) {
        console.error('⚠️ 讀取 config.json 失敗:', err.message);
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

// ─── 定義斜線指令 ──────────────────────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('設定 Angela 的系統通知頻道')
        // 🔒 關鍵：限制只有「管理者權限」的成員才能使用
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('選擇要設定的頻道類型')
                .setRequired(true)
                .addChoices(
                    { name: '🟢 上線通知頻道 (notify)', value: 'notifyChannelId' },
                    { name: '📢 Rate Up 廣播頻道 (rateup)', value: 'rateUpChannelId' }
                )
        )
        .addChannelOption(option =>
            option.setName('target')
                .setDescription('選擇目標文字頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),
];

// 註冊斜線指令至 Discord
async function registerSlashCommands(botToken, clientId) {
    const rest = new REST({ version: '10' }).setToken(botToken);
    try {
        console.log('🔄 開始同步斜線指令 (Slash Commands)...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ 斜線指令註冊完成！');
    } catch (err) {
        console.error('❌ 斜線指令註冊失敗:', err.message);
    }
}

// ─── 處理斜線指令互動 (Interaction) ───────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setchannel') {
        const type = interaction.options.getString('type');
        const targetChannel = interaction.options.getChannel('target');

        // 寫入 config.json
        saveConfig({ [type]: targetChannel.id });

        const typeName = type === 'notifyChannelId' ? '上線通知頻道' : 'Rate Up 廣播頻道';

        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('⚙️ 系統頻道設定更新')
                .setColor(0x00b4d8)
                .setDescription(`已成功將 **${typeName}** 設定為：${targetChannel}`)
                .setTimestamp()
            ],
            ephemeral: true // 只有執行指令的管理員自己看得見訊息
        });
    }
});

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

// ─── 傳統文字指令監聽 ──────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    try {
        await handleCommands(client, message);
    } catch (err) {
        console.error('❌ 指令錯誤:', err.stack || err.message);
        message.reply(`「系統錯誤：${err.message}」`).catch(() => {});
    }
});

// ─── 上線事件 ──────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`);
    
    // 註冊斜線指令
    await registerSlashCommands(client.token, client.user.id);

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
                        .setDescription('「主管，精神脈衝已重新對齊。\n核心系統與指令發射器已就緒，隨時待命。」\n\n輸入 `!help` 查看全部指令。')
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

// ─── 錯誤保護 ──────────────────────────────────────────────────
client.on('error', err => console.error('Discord 客戶端錯誤:', err.message));
process.on('unhandledRejection', err => console.error('未捕捉的 Promise 拒絕:', err?.message || err));
process.on('uncaughtException', err => console.error('未捕捉的例外錯誤:', err?.message || err));

module.exports = { getConfig, saveConfig };

// ─── 登入 ──────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN || TOKEN === 'DISCORD_TOKEN') {
    console.error('❌ 請設定環境變數 DISCORD_TOKEN');
    process.exit(1);
}
client.login(TOKEN);
