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
    backupChannelId: process.env.PLAYER_BACKUP_CHANNEL_ID || '',
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

const identitiesData             = require('./GameSystem/Pulls/identitiesData.js');
const { startNewsCheckLoop, setNotifyChannel } = require('./Newscheck.js');
const { handleCommands }         = require('./Commanders.js');
const { handleMessageXp, startVoiceXpTimer, trackVoiceJoin, trackVoiceLeave, bootstrapVoiceTracking } = require('./GameSystem/LevelSystem.js');
const { handleStarboardReaction, setStarboardChannel: _setStarboard } = require('./GameSystem/StarboardSystem.js');
const { setAuditChannel, logMessageDelete, logVoiceChange, logMemberChange, logGuildChange } = require('./GameSystem/AuditSystem.js');
const { setTranslationOutput, setTranslationConfig, toggleTranslationSource, getTranslationConfig, handleTranslationMessage } = require('./GameSystem/TranslationSystem.js');
const { localizeInteraction } = require('./GameSystem/LanguageSystem.js');
const { restoreFromBackupChannel } = require('./GameSystem/PacksAndData.js');
const {
    getGuildConfig,
    saveGuildConfigToDiscord,
    restoreAllGuildConfigs,
    setStorageChannel
} = require('./GameSystem/ServerConfigStorage.js');

const SUPER_ADMIN_ID = '1330463890122735642';
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
        GatewayIntentBits.GuildVoiceStates, // 修復 VC Bug：即時追蹤語音狀態
        GatewayIntentBits.GuildMessageReactions, 
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

// ─── 斜線指令清單 ─────────────────────────────────────────────
const allSlashCommands = [
    // 1. 抽卡
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('開啟狂氣提取介面'),

    // 2. 背包與機率
    new SlashCommandBuilder().setName('pack').setDescription('查看 LC 主頁式背包與資源介面'),
    new SlashCommandBuilder().setName('list').setDescription('查看當前卡池機率與清單（已修正顯示完整角色名稱）'),

    // 3. 戰鬥與隊伍
    new SlashCommandBuilder().setName('battle').setDescription('選擇難度進入戰鬥並獲取 LightSeeds'),
    new SlashCommandBuilder().setName('party').setDescription('查看與管理出戰隊伍陣容'),

    // 4. 罪人管理
    new SlashCommandBuilder().setName('sinner').setDescription('查看罪人詳細資料與清單'),
    new SlashCommandBuilder().setName('uptie').setDescription('進行罪人人格/E.G.O 連結提升'),
    new SlashCommandBuilder().setName('equip').setDescription('更換罪人裝備與人格'),
    new SlashCommandBuilder().setName('threads').setDescription('查詢當前持有絲線與資源'),

    // 5. 鏡光迷宮
    new SlashCommandBuilder().setName('md').setDescription('開啟或查看鏡光迷宮進度'),

    // 6. 等級系統
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('查看等級與 XP 進度')
        .addUserOption(opt => opt.setName('target').setDescription('查看其他玩家的等級（預設為自己）')),
    new SlashCommandBuilder()
        .setName('language')
        .setDescription('選擇指令顯示語言')
        .addStringOption(opt => opt.setName('language').setDescription('語言').setRequired(true).addChoices({ name: '繁體中文', value: 'zh' }, { name: 'English', value: 'en' })),

    // 7. Starcoins 經濟系統
    new SlashCommandBuilder()
        .setName('sc')
        .setDescription('🌟 Starcoins 經濟系統')
        .addSubcommand(sub => sub.setName('pay').setDescription('支付 Starcoins 給其他玩家')
            .addUserOption(opt => opt.setName('target').setDescription('收款玩家').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('支付金額').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('work').setDescription('工作取得 Starcoins'))
        .addSubcommand(sub => sub.setName('bank').setDescription('存入、提出或查看銀行 Starcoins')
            .addStringOption(opt => opt.setName('action').setDescription('銀行操作').setRequired(true)
                .addChoices({ name: '存錢', value: 'deposit' }, { name: '拿錢', value: 'withdraw' }, { name: '查看餘額', value: 'balance' }))
            .addIntegerOption(opt => opt.setName('amount').setDescription('金額（存錢/拿錢時需要）').setMinValue(1))),
    new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('使用 Starcoins 進行 50/50 賭博')
        .addIntegerOption(opt => opt.setName('amount').setDescription('下注金額（10–50000）').setRequired(true).setMinValue(10).setMaxValue(50000)),

    // 8. 娛樂小工具
    new SlashCommandBuilder()
        .setName('gayrate')
        .setDescription('測量目標的男同指數')
        .addUserOption(opt => opt.setName('target').setDescription('要測試的目標對象（預設為自己）')),
    new SlashCommandBuilder()
        .setName('lesbianrate')
        .setDescription('測量目標的女同指數')
        .addUserOption(opt => opt.setName('target').setDescription('要測試的目標對象（預設為自己）')),

    // 9. 語音頻道控制
    new SlashCommandBuilder().setName('join').setDescription('讓機器人加入你目前所在的語音頻道'),
    new SlashCommandBuilder().setName('leave').setDescription('讓機器人離開目前所在的語音頻道'),
    new SlashCommandBuilder().setName('status').setDescription('查看機器人目前的運行狀態'),

    // 10. 說明選單
    new SlashCommandBuilder().setName('help').setDescription('顯示 Angela 系統全部斜線指令選單'),

    // ─── 伺服器管理員專用 ──────────────────────────────────────
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
                    { name: '⬆️ 升級公告頻道', value: 'level' },
                    { name: '📣 Sles 公告接收頻道', value: 'announce' },
                    { name: '⭐ 星星榜頻道', value: 'starboard' },
                    { name: '📚 紀錄頻道', value: 'audit' },
                    { name: '🌐 翻譯輸出頻道', value: 'translate-output' },
                    { name: '🌐 切換翻譯來源頻道', value: 'translate-source' },
                ))
        .addChannelOption(option =>
            option.setName('target_channel')
                .setDescription('選擇目標文字頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('setstoragechannel')
        .setDescription('【伺服器管理員】設定 Angela 設定資料的永久儲存頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('target_channel')
                .setDescription('選擇一個只有管理員與 Angela 可見的文字頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('serverconfig')
        .setDescription('【伺服器管理員】查看 Angela 目前儲存的頻道設定')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('查看等級排行榜 TOP 10'),

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

    // ─── Sles 專屬特權指令 ─────────────────────────────────────
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('👑【Sles 專屬】向所有設定公告頻道的伺服器發送全域公告')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('公告內容')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('givestarcoins')
        .setDescription('👑【Sles 專屬】發放 Starcoins')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true).setMinValue(1))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家').setRequired(true)),

    new SlashCommandBuilder()
        .setName('takelightseeds')
        .setDescription('👑【Sles 專屬】扣除玩家 LightSeeds')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('扣除數量').setRequired(true).setMinValue(1))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家').setRequired(true)),

    new SlashCommandBuilder()
        .setName('givelightseeds')
        .setDescription('👑【Sles 專屬】發放 LightSeeds（可給個人或全伺服器）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家（若發給全服可留空）'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家（預設 False）')),

    new SlashCommandBuilder()
        .setName('givefragments')
        .setDescription('👑【Sles 專屬】發放人格碎片（可給個人或全伺服器）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家（若發給全服可留空）'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家（預設 False）')),

    new SlashCommandBuilder()
        .setName('givescrolls')
        .setDescription('👑【Sles 專屬】發放抽卡券（可給個人或全伺服器）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家（若發給全服可留空）'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家（預設 False）')),

    new SlashCommandBuilder()
        .setName('givethreads')
        .setDescription('👑【Sles 專屬】發放絲線（可給個人或全伺服器）')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true))
        .addUserOption(opt => opt.setName('target').setDescription('指定目標玩家（若發給全服可留空）'))
        .addBooleanOption(opt => opt.setName('all').setDescription('是否發放給伺服器所有玩家（預設 False）')),

    new SlashCommandBuilder()
        .setName('updaterewards')
        .setDescription('👑【Sles 專屬】更新全服獎勵設置')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addIntegerOption(opt => opt.setName('amount').setDescription('發放數量').setRequired(true)),

    new SlashCommandBuilder()
        .setName('updatebuff')
        .setDescription('👑【Sles 專屬】更新關卡獎勵倍率 Buff')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption(opt => opt.setName('multiplier').setDescription('倍率（例如 2 = 雙倍）').setRequired(true)),
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
    localizeInteraction(interaction);

    if (interaction.commandName === 'setstoragechannel') {
        const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isGuildAdmin) {
            return interaction.reply({ content: '❌ 此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
        }

        const targetChannel = interaction.options.getChannel('target_channel');
        const saved = await setStorageChannel(client, interaction.guild, targetChannel.id);
        if (!saved) {
            return interaction.reply({
                content: '❌ 設定頻道失敗。請確認 Angela 能查看、讀取歷史訊息、發送訊息與嵌入連結。',
                flags: MessageFlags.Ephemeral
            });
        }

        // 將舊版本機設定一併搬進 Discord，避免第一次啟用儲存頻道時遺失既有設定。
        const legacy = getConfig();
        const { getLevelChannel } = require('./GameSystem/LevelSystem.js');
        const { getAnnounceConfig } = require('./GameSystem/AnnounceSystem.js');
        const { getStarboardChannel } = require('./GameSystem/StarboardSystem.js');
        const { getAuditChannel } = require('./GameSystem/AuditSystem.js');
        const translation = getTranslationConfig(interaction.guild.id);
        const legacyPatch = {
            notifyChannelId: legacy.notifyChannelId || '',
            rateUpChannelId: legacy.rateUpChannelId || '',
            newsChannelId: legacy.newsChannelId || '',
            levelChannelId: getLevelChannel(interaction.guild.id) || '',
            announceChannelId: getAnnounceConfig()[interaction.guild.id] || '',
            starboardChannelId: getStarboardChannel(interaction.guild.id) || '',
            auditChannelId: getAuditChannel(interaction.guild.id) || '',
            translationOutputChannelId: translation.output || '',
            translationSourceChannelIds: translation.sources || []
        };
        await saveGuildConfigToDiscord(client, interaction.guild.id, legacyPatch);

        return interaction.reply({
            content: `✅ 設定儲存頻道為 ${targetChannel}。之後頻道設定會寫入 Discord，重啟後會自動恢復。`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'serverconfig') {
        const config = getGuildConfig(interaction.guild?.id);
        const channel = id => id ? `<#${id}>` : '未設定';
        const sourceChannels = config.translationSourceChannelIds.length
            ? config.translationSourceChannelIds.map(id => `<#${id}>`).join(', ')
            : '未設定';

        return interaction.reply({
            content: [
                '**Angela 伺服器頻道設定**',
                `儲存頻道：${channel(config.storageChannelId)}`,
                `系統上線：${channel(config.notifyChannelId)}`,
                `Rate Up 公告：${channel(config.rateUpChannelId)}`,
                `新聞動態：${channel(config.newsChannelId)}`,
                `升級公告：${channel(config.levelChannelId)}`,
                `Sles 公告：${channel(config.announceChannelId)}`,
                `星星榜：${channel(config.starboardChannelId)}`,
                `紀錄：${channel(config.auditChannelId)}`,
                `翻譯輸出：${channel(config.translationOutputChannelId)}`,
                `翻譯來源：${sourceChannels}`
            ].join('\n'),
            flags: MessageFlags.Ephemeral
        });
    }

    // setchannel 在這裡處理（需要 saveConfig）
    if (interaction.commandName === 'setchannel') {
        const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isGuildAdmin) {
            return interaction.reply({ content: '❌ 此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
        }
        const type = interaction.options.getString('type');
        const targetChannel = interaction.options.getChannel('target_channel');
        const configTypeMap = {
            notify: { key: 'notifyChannelId', label: '系統上線通知頻道' },
            rateup: { key: 'rateUpChannelId', label: 'Rate Up 公告頻道' },
            news:   { key: 'newsChannelId',   label: '新聞與社群動態頻道' },
        };
        if (configTypeMap[type]) {
            const patch = { [configTypeMap[type].key]: targetChannel.id };
            saveConfig(patch);
            if (configTypeMap[type].key === 'notifyChannelId') {
                setNotifyChannel(targetChannel.id);
            }
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, patch);
            return interaction.reply({
                content: `「主管，${configTypeMap[type].label}已重定向至 ${targetChannel}。」${persisted ? '' : '（提醒：尚未設定 Discord 儲存頻道，請先使用 /setstoragechannel。）'}`,
                flags: MessageFlags.Ephemeral
            });
        }
        const { setLevelChannel: _setLvCh } = require('./GameSystem/LevelSystem.js');
        const { setAnnounceChannel: _setAnnCh } = require('./GameSystem/AnnounceSystem.js');
        if (type === 'level') {
            _setLvCh(interaction.guild.id, targetChannel.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, { levelChannelId: targetChannel.id });
            return interaction.reply({ content: `✅ 升級公告頻道已設定至 ${targetChannel}。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
        if (type === 'announce') {
            _setAnnCh(interaction.guild.id, targetChannel.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, { announceChannelId: targetChannel.id });
            return interaction.reply({ content: `✅ Sles 公告接收頻道已設定至 ${targetChannel}。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
        if (type === 'starboard') {
            _setStarboard(interaction.guild.id, targetChannel.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, { starboardChannelId: targetChannel.id });
            return interaction.reply({ content: `✅ 星星榜頻道已設定至 ${targetChannel}。達到 3 顆 ⭐ 的訊息將自動轉發。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
        if (type === 'audit') {
            setAuditChannel(interaction.guild.id, targetChannel.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, { auditChannelId: targetChannel.id });
            return interaction.reply({ content: `✅ 紀錄頻道已設定至 ${targetChannel}。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
        if (type === 'translate-output') {
            setTranslationOutput(interaction.guild.id, targetChannel.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, { translationOutputChannelId: targetChannel.id });
            return interaction.reply({ content: `✅ 翻譯輸出頻道已設定為 ${targetChannel}。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
        if (type === 'translate-source') {
            const enabled = toggleTranslationSource(interaction.guild.id, targetChannel.id);
            const translationConfig = getTranslationConfig(interaction.guild.id);
            const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, {
                translationSourceChannelIds: translationConfig.sources
            });
            return interaction.reply({ content: `✅ 已${enabled ? '加入' : '移除'}翻譯來源頻道：${targetChannel}。${persisted ? '' : '（請先使用 /setstoragechannel 才能跨重啟保存。）'}`, flags: MessageFlags.Ephemeral });
        }
    }

    try {
        const adminCommands = ['setchannel', 'setstoragechannel', 'serverconfig', 'setlevelchannel', 'setannouncechannel', 'givelightseeds', 'givestarcoins', 'takelightseeds', 'givefragments', 'givescrolls', 'givethreads', 'updaterewards', 'updatebuff', 'announce'];
        if (interaction.guild && adminCommands.includes(interaction.commandName)) {
            const { logAudit } = require('./GameSystem/AuditSystem.js');
            logAudit(client, interaction.guild.id, '🛡️ 管理操作', `<@${interaction.user.id}> 執行 /${interaction.commandName}`, { color: 0xfee75c }).catch(() => {});
        }
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

// ─── messageCreate：打字 XP ───────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
    if (message.author?.bot) return;
    handleMessageXp(client, message).catch(() => {});
    handleTranslationMessage(client, message).catch(() => {});
});

// ─── messageReactionAdd：星星榜 ──────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    handleStarboardReaction(client, reaction, user).catch(() => {});
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    handleStarboardReaction(client, reaction, user).catch(() => {});
});
client.on(Events.MessageDelete, message => logMessageDelete(client, message).catch(() => {}));
client.on(Events.GuildMemberAdd, member => logMemberChange(client, member, true).catch(() => {}));
client.on(Events.GuildMemberRemove, member => logMemberChange(client, member, false).catch(() => {}));
client.on(Events.ChannelCreate, channel => logGuildChange(client, null, channel, '頻道建立').catch(() => {}));
client.on(Events.ChannelDelete, channel => logGuildChange(client, channel, null, '頻道刪除').catch(() => {}));
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => logGuildChange(client, oldChannel, newChannel, '頻道').catch(() => {}));
client.on(Events.RoleCreate, role => logGuildChange(client, null, role, '身分組建立').catch(() => {}));
client.on(Events.RoleDelete, role => logGuildChange(client, role, null, '身分組刪除').catch(() => {}));
client.on(Events.RoleUpdate, (oldRole, newRole) => logGuildChange(client, oldRole, newRole, '身分組').catch(() => {}));

// ─── voiceStateUpdate：語音 XP + VC Bug 修復 ─────────────────
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId   = newState.member?.user?.id || oldState.member?.user?.id;
    const username = newState.member?.user?.username || oldState.member?.user?.username;
    const guildId  = newState.guild?.id || oldState.guild?.id;
    if (!userId || newState.member?.user?.bot) return;
    logVoiceChange(client, oldState, newState).catch(() => {});

    const joinedChannel = newState.channelId;
    const leftChannel   = oldState.channelId;

    if (!leftChannel && joinedChannel) {
        // 加入語音頻道
        trackVoiceJoin(userId, username, guildId);
    } else if (leftChannel && !joinedChannel) {
        // 離開語音頻道
        trackVoiceLeave(userId, guildId);
    } else if (leftChannel !== joinedChannel) {
        // 切換頻道：重設計時器
        trackVoiceLeave(userId, guildId);
        trackVoiceJoin(userId, username, guildId);
    }
});

// ─── 上線事件 ─────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`);

    try {
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

    // Discord 儲存頻道是頻道設定的來源；本機 JSON 只保留相容快取。
    try {
        await restoreAllGuildConfigs(client);

        const {
            setLevelChannel,
        } = require('./GameSystem/LevelSystem.js');
        const {
            setAnnounceChannel,
        } = require('./GameSystem/AnnounceSystem.js');

        for (const guild of client.guilds.cache.values()) {
            const stored = getGuildConfig(guild.id);
            const localPatch = {};

            if (stored.notifyChannelId) {
                localPatch.notifyChannelId = stored.notifyChannelId;
                setNotifyChannel(stored.notifyChannelId);
            }
            if (stored.rateUpChannelId) localPatch.rateUpChannelId = stored.rateUpChannelId;
            if (stored.newsChannelId) localPatch.newsChannelId = stored.newsChannelId;
            if (Object.keys(localPatch).length) saveConfig(localPatch);

            if (stored.levelChannelId) setLevelChannel(guild.id, stored.levelChannelId);
            if (stored.announceChannelId) setAnnounceChannel(guild.id, stored.announceChannelId);
            if (stored.starboardChannelId) _setStarboard(guild.id, stored.starboardChannelId);
            if (stored.auditChannelId) setAuditChannel(guild.id, stored.auditChannelId);

            if (stored.translationOutputChannelId || stored.translationSourceChannelIds.length) {
                setTranslationConfig(guild.id, {
                    output: stored.translationOutputChannelId,
                    sources: stored.translationSourceChannelIds
                });
            }
        }
    } catch (err) {
        console.error('[Startup] Discord 伺服器設定還原失敗:', err.message);
    }

    const config = getConfig();
    if (config.notifyChannelId) {
        setNotifyChannel(config.notifyChannelId);
    }
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

    // ─── 從備份頻道還原玩家資料（重啟後恢復存檔）────────
    try {
        const restored = await restoreFromBackupChannel(client);
        if (restored > 0) console.log(`📂 [Startup] 從備份頻道還原了 ${restored} 位玩家的資料`);
    } catch (e) { console.error('[Startup] 備份還原失敗（忽略）:', e.message); }

    await announceCurrentRateUps(client);
    startNewsCheckLoop(client);
    bootstrapVoiceTracking(client);  // 🐛 修復：預載語音中的成員
    startVoiceXpTimer(client);
    console.log('📡 [排程] Newscheck / 語音 XP 計時器已啟動');
});

// ─── 錯誤保護與登入 ───────────────────────────────────────────
client.on('error', err => console.error('Discord 客戶端錯誤:', err.message));
process.on('unhandledRejection', err => console.error('未捕捉的 Promise 拒絕:', err?.message || err));
process.on('uncaughtException',  err => console.error('未捕捉的例外錯誤:',  err?.message || err));

module.exports = { getConfig, saveConfig };

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN || TOKEN === 'DISCORD_TOKEN') {
    console.error('❌ 請設定環境變數 DISCORD_TOKEN');
    process.exit(1);
}
client.login(TOKEN);
