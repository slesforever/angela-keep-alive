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
    Collection,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');

const express = require('express');
const fs      = require('fs');
const path    = require('path');

// ─── 確保資料目錄與設定檔存在 ─────────────────────────────────

const BASE_DATA_DIR = path.join(
    process.cwd(),
    'data'
);

const PLAYERS_DIR = path.resolve(
    process.env.PLAYER_DATA_DIR || path.join(BASE_DATA_DIR, 'players')
);

const CONFIG_PATH = path.join(
    BASE_DATA_DIR,
    'config.json'
);

try {
    fs.mkdirSync(
        PLAYERS_DIR,
        {
            recursive: true
        }
    );
} catch {}

// ─────────────────────────────────────────────
// 預設設定
// ─────────────────────────────────────────────

const defaultConfig = {
    notifyChannelId:
        process.env.NOTIFY_CHANNEL_ID || '',

    rateUpChannelId:
        process.env.RATEUP_ANNOUNCE_CHANNEL || '',

    newsChannelId:
        process.env.NEWS_CHANNEL_ID || '',

    backupChannelId:
        process.env.PLAYER_BACKUP_CHANNEL_ID || '',
};

function getConfig() {
    try {
        if (
            fs.existsSync(
                CONFIG_PATH
            )
        ) {
            const data =
                fs.readFileSync(
                    CONFIG_PATH,
                    'utf8'
                );

            return {
                ...defaultConfig,
                ...JSON.parse(data)
            };
        }
    } catch (err) {
        console.error(
            '⚠️ 讀取 config.json 失敗，使用預設值:',
            err.message
        );
    }

    return {
        ...defaultConfig
    };
}

function saveConfig(newConfig) {
    try {
        const current =
            getConfig();

        const updated = {
            ...current,
            ...newConfig
        };

        fs.writeFileSync(
            CONFIG_PATH,
            JSON.stringify(
                updated,
                null,
                2
            ),
            'utf8'
        );

        return updated;

    } catch (err) {
        console.error(
            '❌ 儲存 config.json 失敗:',
            err.message
        );

        return null;
    }
}

// ─────────────────────────────────────────────
// 載入各系統
// ─────────────────────────────────────────────

const identitiesData =
    require(
        './GameSystem/Pulls/identitiesData.js'
    );

const {
    startNewsCheckLoop,
    setNotifyChannel
} = require(
    './LimbusNewscheck.js'
);

const {
    handleCommands
} = require(
    './Commanders.js'
);

const ShopSystem = require('./GameSystem/ShopSystem.js');
const GiveawaySystem = require('./GameSystem/GiveawayEventSystem.js');
const AIChatSystem = require('./GameSystem/AIChatSystem.js');
const ProfileSystem = require('./GameSystem/ProfileSystem.js');
const CheckInSystem = require('./GameSystem/CheckInSystem.js');
const WatchdogSystem = require('./GameSystem/WatchdogSystem.js');
const NewYearSystem = require('./GameSystem/NewYearSystem.js');
const MarriageSystem = require('./GameSystem/MarriageSystem.js');

const {
    handleMessageXp,
    startVoiceXpTimer,
    announceMonthlyLeaderboard,
    trackVoiceJoin,
    trackVoiceLeave,
    bootstrapVoiceTracking
} = require(
    './GameSystem/LevelSystem.js'
);

const {
    handleStarboardReaction,
    scanAllGuildForums,
    setStarboardChannel: _setStarboard
} = require(
    './GameSystem/StarboardSystem.js'
);

const {
    setAuditChannel,
    logMessageDelete,
    logVoiceChange,
    logMemberChange,
    logGuildChange
} = require(
    './GameSystem/AuditSystem.js'
);

const {
    setTranslationOutput,
    setTranslationConfig,
    toggleTranslationSource,
    getTranslationConfig,
    handleTranslationMessage
} = require(
    './GameSystem/TranslationSystem.js'
);

const {
    localizeInteraction
} = require(
    './GameSystem/LanguageSystem.js'
);

const {
    restoreFromBackupChannel
} = require(
    './GameSystem/PacksAndData.js'
);

const {
    getGuildConfig,
    saveGuildConfigToDiscord,
    restoreAllGuildConfigs,
    setStorageChannel
} = require(
    './GameSystem/ServerConfigStorage.js'
);

// ─────────────────────────────────────────────
// 常數
// ─────────────────────────────────────────────

const SUPER_ADMIN_ID =
    '1330463890122735642';

const PORT =
    process.env.PORT || 3000;

// ─────────────────────────────────────────────
// Keep-alive HTTP server
// ─────────────────────────────────────────────

const app =
    express();

app.get(
    '/',
    (_, res) =>
        res.send(
            'Angela is online.'
        )
);

app.get(
    '/health',
    (_, res) =>
        res.json({
            status: 'ok',
            uptime: process.uptime()
        })
);

app.listen(
    PORT,
    () =>
        console.log(
            `🌐 HTTP server 已啟動 port ${PORT}`
        )
);

// ─────────────────────────────────────────────
// Discord Client
// ─────────────────────────────────────────────

const client =
    new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessageReactions,
        ],
    });

// ─────────────────────────────────────────────
// 載入指令模組
// ─────────────────────────────────────────────

client.commands =
    new Collection();

try {
    const pullCmd =
        require(
            './pullmenu.js'
        );

    if (
        pullCmd?.data &&
        typeof pullCmd?.execute ===
            'function'
    ) {
        client.commands.set(
            pullCmd.data.name,
            pullCmd
        );

        console.log(
            `[Startup] ✅ 載入指令: /${pullCmd.data.name}`
        );
    }

} catch (err) {
    console.error(
        '[Startup] pullmenu.js 載入失敗:',
        err.message
    );
}

// ─────────────────────────────────────────────
// Slash Commands
// ─────────────────────────────────────────────

const allSlashCommands = [

    // ─────────────────────────────────────
    // 抽卡
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('pull_limbuscompany')
        .setDescription(
            'Open the LightSeeds extraction interface'
        ),

    // ─────────────────────────────────────
    // 背包 / 機率
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('pack_limbuscompany')
        .setDescription(
            'View your inventory and resources'
        ),

    new SlashCommandBuilder()
        .setName('list_limbuscompany')
        .setDescription(
            'View gacha pool rates and item list'
        ),

    // ─────────────────────────────────────
    // 戰鬥 / 隊伍
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('battle')
        .setDescription(
            'Choose a difficulty and enter battle'
        ),

    new SlashCommandBuilder()
        .setName('party')
        .setDescription(
            'View and manage your party'
        ),

    // ─────────────────────────────────────
    // 罪人
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('sinner')
        .setDescription(
            'View sinner details'
        ),

    new SlashCommandBuilder()
        .setName('uptie')
        .setDescription(
            'Upgrade sinner uptie level'
        ),

    new SlashCommandBuilder()
        .setName('equip')
        .setDescription(
            'Change equipped identity'
        ),

    new SlashCommandBuilder()
        .setName('threads')
        .setDescription(
            'Check your thread resources'
        ),

    // ─────────────────────────────────────
    // 鏡光迷宮
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('md')
        .setDescription(
            'Open Mirror Dungeon'
        ),

    // ─────────────────────────────────────
    // 等級
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('rank')
        .setDescription(
            'Check your level and XP'
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'View another player\'s level (default: yourself)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('language')
        .setDescription(
            'Set your display language'
        )
        .addStringOption(
            opt =>
                opt
                    .setName('language')
                    .setDescription(
                        'Language'
                    )
                    .setRequired(true)
                    .addChoices(
                        {
                            name: '繁體中文',
                            value: 'zh'
                        },
                        {
                            name: 'English',
                            value: 'en'
                        }
                    )
        ),

    // ─────────────────────────────────────
    // Starcoins
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('sc')
        .setDescription(
            '🌟 Starcoins economy system'
        )
        .addSubcommand(
            sub =>
                sub
                    .setName('pay')
                    .setDescription(
                        'Pay Starcoins to another player'
                    )
                    .addUserOption(
                        opt =>
                            opt
                                .setName('target')
                                .setDescription(
                                    'Recipient'
                                )
                                .setRequired(true)
                    )
                    .addIntegerOption(
                        opt =>
                            opt
                                .setName('amount')
                                .setDescription(
                                    'Amount'
                                )
                                .setRequired(true)
                                .setMinValue(1)
                    )
        )
        .addSubcommand(
            sub =>
                sub
                    .setName('work')
                    .setDescription(
                        'Work to earn Starcoins'
                    )
        )
        .addSubcommand(
            sub =>
                sub
                    .setName('bank')
                    .setDescription(
                        'Deposit, withdraw, or check bank Starcoins'
                    )
                    .addStringOption(
                        opt =>
                            opt
                                .setName('action')
                                .setDescription(
                                    'Action'
                                )
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name: 'Deposit',
                                        value: 'deposit'
                                    },
                                    {
                                        name: 'Withdraw',
                                        value: 'withdraw'
                                    },
                                    {
                                        name: 'Balance',
                                        value: 'balance'
                                    }
                                )
                    )
                    .addIntegerOption(
                        opt =>
                            opt
                                .setName('amount')
                                .setDescription(
                                    'Amount (required for deposit/withdraw)'
                                )
                                .setMinValue(1)
                    )
        ),

    new SlashCommandBuilder()
        .setName('gamble')
        .setDescription(
            'Gamble your Starcoins (50/50)'
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Bet amount (10–50000)'
                    )
                    .setRequired(true)
                    .setMinValue(10)
                    .setMaxValue(50000)
        ),

    // ─────────────────────────────────────
    // 娛樂
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('gayrate')
        .setDescription(
            'Measure gay rate'
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (default: yourself)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('lesbianrate')
        .setDescription(
            'Measure lesbian rate'
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (default: yourself)'
                    )
        ),

    // ─────────────────────────────────────
    // 語音
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('join')
        .setDescription(
            'Join your voice channel'
        ),

    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play YouTube or SoundCloud music (supports playlists)')
        .addStringOption(option => option.setName('musiclink').setDescription('Music or playlist link').setRequired(true)),

    new SlashCommandBuilder()
        .setName('leave')
        .setDescription(
            'Leave voice channel'
        ),

    new SlashCommandBuilder()
        .setName('marry')
        .setDescription('View marriage status or send a marriage request')
        .addSubcommand(o =>
            o
                .setName('status')
                .setDescription('View your marriage status and spouses')
        )
        .addSubcommand(o =>
            o
                .setName('request')
                .setDescription('Send a marriage request to a user')
                .addUserOption(user =>
                    user
                        .setName('target')
                        .setDescription('User to marry')
                        .setRequired(true)
                )
        ),

    new SlashCommandBuilder()
        .setName('divorce')
        .setDescription('Divorce a spouse')
        .addUserOption(o => o.setName('target').setDescription('Spouse to divorce').setRequired(false)),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription(
            'Check bot status'
        ),

    // ─────────────────────────────────────
    // Help
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('help')
        .setDescription(
            'Show all available commands'
        ),

    // ─────────────────────────────────────
    // 伺服器管理員
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription(
            'Set system notification channels'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addStringOption(
            option =>
                option
                    .setName('type')
                    .setDescription(
                        'Channel type'
                    )
                    .setRequired(true)
                    .addChoices(
                        {
                            name: 'System Notification',
                            value: 'notify'
                        },
                        {
                            name: 'Rate Up',
                            value: 'rateup'
                        },
                        {
                            name: 'News',
                            value: 'news'
                        },
                        {
                            name: 'Level Up Announcement',
                            value: 'level'
                        },
                        {
                            name: 'Sles Announcement',
                            value: 'announce'
                        },
                        {
                            name: 'Starboard',
                            value: 'starboard'
                        },
                        {
                            name: 'Audit Log',
                            value: 'audit'
                        },
                        {
                            name: 'Translation Output',
                            value: 'translate-output'
                        },
                        {
                            name: 'Toggle Translation Source',
                            value: 'translate-source'
                        },
                        { name: 'AI Auto Reply', value: 'ai' },
                        { name: 'AI Memory', value: 'ai-memory' }
                    )
        )
        .addChannelOption(
            option =>
                option
                    .setName('target_channel')
                    .setDescription(
                        'Target text channel'
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
            .setName('aipersona')
            .setDescription('Switch AI persona for this channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addStringOption(o => o.setName('persona').setDescription('Choose persona').setRequired(true).addChoices(...AIChatSystem.getPersonaChoices()))
            .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to current channel)').addChannelTypes(ChannelType.GuildText)),
    
        new SlashCommandBuilder()
            .setName('setstoragechannel')
        .setDescription(
            'Set permanent storage channel for bot config'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addChannelOption(
            option =>
                option
                    .setName(
                        'target_channel'
                    )
                    .setDescription(
                        'Choose a text channel visible only to admins and the bot'
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('serverconfig')
        .setDescription(
            'View current channel settings'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

     new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription(
            'View XP Top 10 leaderboard'
        )
        // period=month 可查看本月 XP 排行
        .addStringOption(o => o.setName('period').setDescription('Leaderboard period').addChoices({ name: 'All', value: 'all' }, { name: 'This Month', value: 'month' })),
    
    new SlashCommandBuilder()
            .setName('achievements')
            .setDescription('View unlocked and locked achievements'),

        new SlashCommandBuilder()
            .setName('dailyquest')
            .setDescription('View daily and hourly quests'),

        new SlashCommandBuilder()
            .setName('steam')
        .setDescription(
            'Manually trigger Steam update check'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName('tweet')
        .setDescription(
            'Manually trigger Twitter update check'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName('youtube')
        .setDescription(
            'Manually trigger YouTube update check'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    // ─────────────────────────────────────
    // Sles 專屬
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription(
            '👑 Sles only: Send global announcement to all servers'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName('givestarcoins')
        .setDescription(
            '👑 Sles only: Grant Starcoins'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
                    .setMinValue(1)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player'
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('takelightseeds')
        .setDescription(
            '👑 Sles only: Deduct LightSeeds'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
                    .setMinValue(1)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player'
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('givelightseeds')
        .setDescription(
            '👑 Sles only: Grant LightSeeds (single player or all server)'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (leave empty for all server)'
                    )
        )
        .addBooleanOption(
            opt =>
                opt
                    .setName('all')
                    .setDescription(
                        'Give to all server members (default: false)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('givefragments')
        .setDescription(
            '👑 Sles only: Grant fragments'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (leave empty for all server)'
                    )
        )
        .addBooleanOption(
            opt =>
                opt
                    .setName('all')
                    .setDescription(
                        'Give to all server members (default: false)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('givescrolls')
        .setDescription(
            '👑 Sles only: Grant scrolls'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (leave empty for all server)'
                    )
        )
        .addBooleanOption(
            opt =>
                opt
                    .setName('all')
                    .setDescription(
                        'Give to all server members (default: false)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('givethreads')
        .setDescription(
            '👑 Sles only: Grant threads'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
        )
        .addUserOption(
            opt =>
                opt
                    .setName('target')
                    .setDescription(
                        'Target player (leave empty for all server)'
                    )
        )
        .addBooleanOption(
            opt =>
                opt
                    .setName('all')
                    .setDescription(
                        'Give to all server members (default: false)'
                    )
        ),

    new SlashCommandBuilder()
        .setName('updaterewards')
        .setDescription(
            '👑 Sles only: Update server reward settings'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addIntegerOption(
            opt =>
                opt
                    .setName('amount')
                    .setDescription(
                        'Amount'
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('updatebuff')
        .setDescription(
            '👑 Sles only: Update stage reward multiplier buff'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addNumberOption(
            opt =>
                opt
                    .setName('multiplier')
                    .setDescription(
                        'Multiplier (e.g. 2 = double)'
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder().setName('shop').setDescription('Open the shop UI'),
    new SlashCommandBuilder().setName('shop-add').setDescription('Sles only: Add shop item')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
        .addStringOption(o => o.setName('info').setDescription('Item info'))
        .addIntegerOption(o => o.setName('lightseeds').setDescription('LightSeeds price').setMinValue(0))
        .addIntegerOption(o => o.setName('starcoins').setDescription('StarCoins price').setMinValue(0))
        .addIntegerOption(o => o.setName('minlevel').setDescription('Minimum level').setMinValue(0))
        .addIntegerOption(o => o.setName('stock').setDescription('Stock (leave empty for unlimited)').setMinValue(1))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('shop-remove').setDescription('Sles only: Remove shop item')
        .addStringOption(o => o.setName('item_id').setDescription('Item ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('shop-confirm').setDescription('Sles only: Confirm shop order delivery')
        .addStringOption(o => o.setName('code').setDescription('Order code').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveaway-create').setDescription('Create a giveaway event')
        .addStringOption(o => o.setName('prize_name').setDescription('Prize name').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
        .addStringOption(o => o.setName('prize_info').setDescription('Prize info'))
        .addIntegerOption(o => o.setName('max_participants').setDescription('Max participants').setMinValue(1).setMaxValue(10000))
        .addIntegerOption(o => o.setName('min_level').setDescription('Minimum level').setMinValue(0).setMaxValue(100))
        .addIntegerOption(o => o.setName('entry_lightseeds').setDescription('Entry LightSeeds cost').setMinValue(0))
        .addIntegerOption(o => o.setName('entry_starcoins').setDescription('Entry StarCoins cost').setMinValue(0))
        .addIntegerOption(o => o.setName('prize_lightseeds').setDescription('Prize LightSeeds reward').setMinValue(0))
        .addIntegerOption(o => o.setName('prize_starcoins').setDescription('Prize StarCoins reward').setMinValue(0))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setMinValue(1).setMaxValue(10080))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('giveaway-end')
        .setDescription('End a giveaway early')
        .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ─────────────────────────────────────
    // 個人資料系統
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your full profile')
        .addUserOption(o => o.setName('target').setDescription('View another player')),

    new SlashCommandBuilder()
        .setName('updateprofile')
        .setDescription('Edit your profile (max 2 times/day)')
        .addStringOption(o => o.setName('bio').setDescription('Bio').setMaxLength(500))
        .addStringOption(o => o.setName('origin').setDescription('Experience origin').setMaxLength(300))
        .addStringOption(o => o.setName('image_url').setDescription('Banner image URL'))
        .addStringOption(o => o.setName('title').setDescription('Equip a title'))
        .addAttachmentOption(o => o.setName('banner').setDescription('Upload a banner image')),

    new SlashCommandBuilder()
        .setName('setbanner')
        .setDescription('Upload a banner image')
        .addAttachmentOption(o => o.setName('banner').setDescription('Choose a banner image to upload').setRequired(true)),

    new SlashCommandBuilder()
        .setName('title')
        .setDescription('View or equip titles')
        .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices(
            { name: 'List', value: 'list' },
            { name: 'Equip', value: 'equip' },
            { name: 'Unequip', value: 'unequip' },
        ))
        .addStringOption(o => o.setName('name').setDescription('Title name')),

    // ─────────────────────────────────────
    // 每日簽到
    // ─────────────────────────────────────

    new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('Daily check-in (streak bonus)'),

];

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

function rarityLabel(rarity) {
    return ({
        'Color Fixer':
            '👑 Color Fixer',

        'Special':
            '🌀 Special',

        '0000':
            '✨ ★★★★',

        'Egos':
            '🔮 E.G.O',

        '000':
            '★★★',

        '00':
            '★★',

        '0':
            '★'
    })[rarity] || rarity;
}

// ─────────────────────────────────────────────
// Rate Up 啟動公告
// ─────────────────────────────────────────────

async function announceCurrentRateUps(botClient) {
    const config = getConfig();
    if (!config.rateUpChannelId) return;

    const aliases = {
        'Color Fixer': ['Color Fixer', 'COLOR_FIXER', 'ColorFixer'],
        'Special': ['Special', 'SPECIAL'],
        '0000': ['0000', 'S4'],
        'Egos': ['Egos', 'EGOS'],
        '000': ['000', 'S3'],
        '00': ['00', 'S2'],
        '0': ['0', 'S1'],
    };
    const labels = {
        'Color Fixer': '👑 Color Fixer',
        'Special': '🌀 Special',
        '0000': '✨ ★★★★',
        'Egos': '🔮 E.G.O',
        '000': '✨ ★★★',
        '00': '⭐ ★★',
        '0': '★',
    };

    const readRateUp = rateUp => Object.entries(aliases)
        .map(([canonical, keys]) => ({
            canonical,
            values: [...new Set(keys.flatMap(key =>
                Array.isArray(rateUp?.[key]) ? rateUp[key].filter(Boolean) : []
            ))],
        }))
        .filter(group => group.values.length);

    try {
        const channel = await botClient.channels.fetch(config.rateUpChannelId);
        if (!channel) return;

        const banners = Object.entries(identitiesData.BANNERS || {})
            .map(([key, banner]) => ({ key, banner, groups: readRateUp(banner?.rateUp) }))
            .filter(({ groups }) => groups.length);

        if (!banners.length) {
            const legacyGroups = readRateUp(identitiesData.upTargets || {});
            if (legacyGroups.length) {
                banners.push({ key: 'legacy', banner: { name: '目前設定' }, groups: legacyGroups });
            }
        }

        const fields = banners.slice(0, 25).map(({ key, banner, groups }) => ({
            name: `🎯 ${banner.name || key}`.slice(0, 256),
            value: groups.map(({ canonical, values }) =>
                `**${labels[canonical] || canonical} UP**\n${values.map(value => `• ${value}`).join('\n')}`
            ).join('\n\n').slice(0, 1024),
            inline: false,
        }));

        const embed = new EmbedBuilder()
            .setColor(0xffd166)
            .setTitle('📢 Rate Up 人格與 E.G.O 機率資料已成功載入')
            .setDescription(fields.length
                ? '以下內容直接來自目前 BANNERS 卡池設定，會同時列出人格與 E.G.O。'
                : '目前沒有任何卡池設定 Rate Up 對象。')
            .setFooter({ text: '資料來源：Functions/GameSystem/Pulls/identitiesData.js' })
            .setTimestamp();

        if (fields.length) embed.addFields(fields);
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('❌ Rate Up 公告發送失敗:', err.message);
    }
}

// ─────────────────────────────────────────────
// InteractionCreate
// ─────────────────────────────────────────────

client.on(
    Events.InteractionCreate,
    async interaction => {

        // ═════════════════════════════════════
        // /announce Modal Submit
        // ═════════════════════════════════════

        if (
            interaction.isModalSubmit() &&
            interaction.customId ===
                'announce_modal'
        ) {
            try {

                // 只有 Sles
                if (
                    interaction.user.id !==
                    SUPER_ADMIN_ID
                ) {
                    return interaction.reply({
                        content:
                            '❌ 只有 Angela 系統最高主管可以使用公告功能。',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                const messageText =
                    interaction.fields.getTextInputValue(
                        'announce_content'
                    );

                if (
                    !messageText ||
                    !messageText.trim()
                ) {
                    return interaction.reply({
                        content:
                            '❌ 公告內容不能為空。',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                const {
                    broadcastAnnouncement
                } = require(
                    './GameSystem/AnnounceSystem.js'
                );

                await broadcastAnnouncement(
                    client,
                    interaction,
                    messageText
                );

            } catch (err) {
                console.error(
                    '[Announce] Modal 執行失敗:',
                    err
                );

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction
                        .editReply({
                            content:
                                `❌ 公告發送失敗：${err.message}`
                        })
                        .catch(
                            () => {}
                        );

                } else {
                    await interaction
                        .reply({
                            content:
                                `❌ 公告發送失敗：${err.message}`,
                            flags:
                                MessageFlags.Ephemeral
                        })
                        .catch(
                            () => {}
                        );
                }
            }

            return;
        }

        // ═════════════════════════════════════
        // 其他非 Slash Command interaction
        // ═════════════════════════════════════

        if (interaction.isButton() && interaction.customId.startsWith('giveaway_join:')) {
            return GiveawaySystem.joinGiveaway(client, interaction, interaction.customId.slice('giveaway_join:'.length));
        }

        if (interaction.isButton() && interaction.customId.startsWith('marry:')) return MarriageSystem.handleMarriageButton(client, interaction);
        if (interaction.isButton() && interaction.customId.startsWith('divorce:')) return MarriageSystem.handleDivorceButton(client, interaction);
            if (interaction.isButton() && interaction.customId.startsWith('claim_achievements:')) return require('./GameSystem/AchievementSystem.js').handleClaim(client, interaction, interaction.customId.slice('claim_achievements:'.length));
            if (interaction.isButton() && interaction.customId.startsWith('claim_quests:')) return require('./GameSystem/DailyQuestSystem.js').handleClaim(client, interaction, interaction.customId.slice('claim_quests:'.length));

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        localizeInteraction(
            interaction
        );

        // ═════════════════════════════════════
        // /announce
        // ═════════════════════════════════════

        if (
            interaction.commandName ===
            'announce'
        ) {

            if (
                interaction.user.id !==
                SUPER_ADMIN_ID
            ) {
                return interaction.reply({
                    content:
                        '❌ 只有 Angela 系統最高主管可以使用公告功能。',
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        'announce_modal'
                    )
                    .setTitle(
                        '📢 Angela 系統公告'
                    );

            const announcementInput =
                new TextInputBuilder()
                    .setCustomId(
                        'announce_content'
                    )
                    .setLabel(
                        '公告內容'
                    )
                    .setStyle(
                        TextInputStyle.Paragraph
                    )
                    .setPlaceholder(
                        '輸入公告內容，可以直接換行……'
                    )
                    .setRequired(true)
                    .setMaxLength(4000);

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        announcementInput
                    );

            modal.addComponents(
                row
            );

            return interaction.showModal(
                modal
            );
        }

        // ═════════════════════════════════════
        // /setstoragechannel
        // ═════════════════════════════════════

        if (
            interaction.commandName ===
            'setstoragechannel'
        ) {

            const isGuildAdmin =
                interaction.memberPermissions?.has(
                    PermissionFlagsBits.Administrator
                );

            if (!isGuildAdmin) {
                return interaction.reply({
                    content:
                        '❌ 此指令僅限伺服器管理員使用。',
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            const targetChannel =
                interaction.options.getChannel(
                    'target_channel'
                );

            const saved =
                await setStorageChannel(
                    client,
                    interaction.guild,
                    targetChannel.id
                );

            if (!saved) {
                return interaction.reply({
                    content:
                        '❌ 設定頻道失敗。請確認 Angela 能查看、讀取歷史訊息、發送訊息與嵌入連結。',
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // 第一次啟用 Discord Storage 時
            // 把舊設定搬進去
            // ─────────────────────────────

            const legacy =
                getConfig();

            const {
                getLevelChannel
            } = require(
                './GameSystem/LevelSystem.js'
            );

            const {
                getAnnounceConfig
            } = require(
                './GameSystem/AnnounceSystem.js'
            );

            const {
                getStarboardChannel
            } = require(
                './GameSystem/StarboardSystem.js'
            );

            const {
                getAuditChannel
            } = require(
                './GameSystem/AuditSystem.js'
            );

            const translation =
                getTranslationConfig(
                    interaction.guild.id
                );

            const legacyPatch = {
                notifyChannelId:
                    legacy.notifyChannelId || '',

                rateUpChannelId:
                    legacy.rateUpChannelId || '',

                newsChannelId:
                    legacy.newsChannelId || '',

                levelChannelId:
                    getLevelChannel(
                        interaction.guild.id
                    ) || '',

                announceChannelId:
                    getAnnounceConfig()[
                        interaction.guild.id
                    ] || '',

                starboardChannelId:
                    getStarboardChannel(
                        interaction.guild.id
                    ) || '',

                auditChannelId:
                    getAuditChannel(
                        interaction.guild.id
                    ) || '',

                translationOutputChannelId:
                    translation.output || '',

                translationSourceChannelIds:
                    translation.sources || []
            };

            await saveGuildConfigToDiscord(
                client,
                interaction.guild.id,
                legacyPatch
            );

            return interaction.reply({
                content:
                    `✅ 設定儲存頻道為 ${targetChannel}。\n` +
                    '之後頻道設定會寫入 Discord，重啟後會自動恢復。',
                flags:
                    MessageFlags.Ephemeral
            });
        }

        // ═════════════════════════════════════
        // /serverconfig
        // ═════════════════════════════════════

        if (
            interaction.commandName ===
            'serverconfig'
        ) {

            const config =
                getGuildConfig(
                    interaction.guild?.id
                );

            const channel =
                id =>
                    id
                        ? `<#${id}>`
                        : '未設定';

            const sourceChannels =
                config
                    .translationSourceChannelIds
                    .length
                    ? config
                        .translationSourceChannelIds
                        .map(
                            id =>
                                `<#${id}>`
                        )
                        .join(', ')
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
                    `翻譯來源：${sourceChannels}`,
                    `AI 回覆：${channel(config.aiChannelId)}`,
                    `AI 記憶庫：${channel(config.aiMemoryChannelId)}`
                ].join('\n'),

                flags:
                    MessageFlags.Ephemeral
            });
        }

        if (interaction.commandName === 'aipersona') {
                if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
                }
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                if (!channel || channel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: '請在伺服器文字頻道執行，或選擇文字頻道。', flags: MessageFlags.Ephemeral });
                }
                const persona = interaction.options.getString('persona');
                AIChatSystem.setAiChannel(interaction.guild.id, channel.id, persona);
                const patch = { aiChannelId: channel.id };
                saveConfig(patch);
                const persisted = await saveGuildConfigToDiscord(client, interaction.guild.id, patch);
                return interaction.reply({ content: '✅ 已將 ' + channel + ' 的 AI 人格切換為 **' + AIChatSystem.getPersonaLabel(persona) + '**。' + (persisted ? '' : '（提醒：尚未設定 Discord 儲存頻道。）'), flags: MessageFlags.Ephemeral });
            }

            // ═════════════════════════════════════
            // /setchannel
        // ═════════════════════════════════════

        if (
            interaction.commandName ===
            'setchannel'
        ) {

            const isGuildAdmin =
                interaction.memberPermissions?.has(
                    PermissionFlagsBits.Administrator
                );

            if (!isGuildAdmin) {
                return interaction.reply({
                    content:
                        '❌ 此指令僅限伺服器管理員使用。',
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            const type =
                interaction.options.getString(
                    'type'
                );

            const targetChannel =
                interaction.options.getChannel(
                    'target_channel'
                );

            const configTypeMap = {

                notify: {
                    key:
                        'notifyChannelId',
                    label:
                        '系統上線通知頻道'
                },

                rateup: {
                    key:
                        'rateUpChannelId',
                    label:
                        'Rate Up 公告頻道'
                },

                news: {
                    key: 'newsChannelId', label: '新聞與社群動態頻道'
                },
                ai: { key: 'aiChannelId', label: 'AI 自動回覆頻道' },
                'ai-memory': { key: 'aiMemoryChannelId', label: 'AI 記憶庫頻道' }
            };

            // ─────────────────────────────
            // notify / rateup / news
            // ─────────────────────────────

            if (
                configTypeMap[type]
            ) {

                    if (type === 'ai') {
                        AIChatSystem.setAiChannel(interaction.guild.id, targetChannel.id, 'default');
                    }

                const patch = {
                    [configTypeMap[type].key]:
                        targetChannel.id
                };

                // 原本本機 config
                saveConfig(
                    patch
                );

                // Newscheck notify 同步
                if (
                    configTypeMap[type].key ===
                    'notifyChannelId'
                ) {
                    setNotifyChannel(
                        targetChannel.id
                    );
                }

                // Discord 永久設定
                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        patch
                    );

                return interaction.reply({
                    content:
                        `「主管，${configTypeMap[type].label}已重定向至 ${targetChannel}。」` +
                        (
                            persisted
                                ? ''
                                : '（提醒：尚未設定 Discord 儲存頻道，請先使用 /setstoragechannel。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Level
            // ─────────────────────────────

            const {
                setLevelChannel:
                    _setLvCh
            } = require(
                './GameSystem/LevelSystem.js'
            );

            const {
                setAnnounceChannel:
                    _setAnnCh
            } = require(
                './GameSystem/AnnounceSystem.js'
            );

            if (
                type === 'level'
            ) {

                _setLvCh(
                    interaction.guild.id,
                    targetChannel.id
                );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            levelChannelId:
                                targetChannel.id
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ 升級公告頻道已設定至 ${targetChannel}。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Announce
            // ─────────────────────────────

            if (
                type === 'announce'
            ) {

                _setAnnCh(
                    interaction.guild.id,
                    targetChannel.id
                );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            announceChannelId:
                                targetChannel.id
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ Sles 公告接收頻道已設定至 ${targetChannel}。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Starboard
            // ─────────────────────────────

            if (
                type === 'starboard'
            ) {

                _setStarboard(
                    interaction.guild.id,
                    targetChannel.id
                );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            starboardChannelId:
                                targetChannel.id
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ 星星榜頻道已設定至 ${targetChannel}。達到 3 顆 ⭐ 的訊息將自動轉發。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Audit
            // ─────────────────────────────

            if (
                type === 'audit'
            ) {

                setAuditChannel(
                    interaction.guild.id,
                    targetChannel.id
                );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            auditChannelId:
                                targetChannel.id
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ 紀錄頻道已設定至 ${targetChannel}。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Translation Output
            // ─────────────────────────────

            if (
                type ===
                'translate-output'
            ) {

                setTranslationOutput(
                    interaction.guild.id,
                    targetChannel.id
                );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            translationOutputChannelId:
                                targetChannel.id
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ 翻譯輸出頻道已設定為 ${targetChannel}。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ─────────────────────────────
            // Translation Source
            // ─────────────────────────────

            if (
                type ===
                'translate-source'
            ) {

                const enabled =
                    toggleTranslationSource(
                        interaction.guild.id,
                        targetChannel.id
                    );

                const translationConfig =
                    getTranslationConfig(
                        interaction.guild.id
                    );

                const persisted =
                    await saveGuildConfigToDiscord(
                        client,
                        interaction.guild.id,
                        {
                            translationSourceChannelIds:
                                translationConfig.sources
                        }
                    );

                return interaction.reply({
                    content:
                        `✅ 已${enabled ? '加入' : '移除'}翻譯來源頻道：${targetChannel}。` +
                        (
                            persisted
                                ? ''
                                : '（請先使用 /setstoragechannel 才能跨重啟保存。）'
                        ),

                    flags:
                        MessageFlags.Ephemeral
                });
            }
        }

        // ═════════════════════════════════════
        // 其他指令
        // ═════════════════════════════════════

        try {

            const adminCommands = [
                'setchannel',
                'setstoragechannel',
                'serverconfig',
                'setlevelchannel',
                'setannouncechannel',
                'givelightseeds',
                'givestarcoins',
                'takelightseeds',
                'givefragments',
                'givescrolls',
                'givethreads',
                'updaterewards',
                'updatebuff',
                'announce'
            ];

            if (
                interaction.guild &&
                adminCommands.includes(
                    interaction.commandName
                )
            ) {

                const {
                    logAudit
                } = require(
                    './GameSystem/AuditSystem.js'
                );

                logAudit(
                    client,
                    interaction.guild.id,
                    '🛡️ 管理操作',
                    `<@${interaction.user.id}> 執行 /${interaction.commandName}`,
                    {
                        color:
                            0xfee75c
                    }
                ).catch(
                    () => {}
                );
            }

            // Race a deferReply against the handler so Discord never shows
            // "The application did not respond" when the handler is slow
            // (cold file reads, data loading, etc.). If the handler calls
            // interaction.reply() first, the defer is cancelled and has
            // no effect. If the handler is still working past 2.5s, the
            // defer fires and the handler's reply becomes an editReply.
            let deferred = false;
            const deferTimer = setTimeout(() => {
                if (!interaction.deferred && !interaction.replied) {
                    deferred = true;
                    interaction.deferReply().catch(() => {});
                }
            }, 2500);

            try {
                await handleCommands(
                    client,
                    interaction
                );
            } finally {
                clearTimeout(deferTimer);
            }

        } catch (err) {

            console.error(
                '❌ 斜線指令執行錯誤:',
                err.stack ||
                err.message
            );

            const errorMsg = {
                content:
                    `「系統錯誤：${err.message}」`,
                flags:
                    MessageFlags.Ephemeral
            };

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction
                    .followUp(
                        errorMsg
                    )
                    .catch(
                        () => {}
                    );

            } else {

                await interaction
                    .reply(
                        errorMsg
                    )
                    .catch(
                        () => {}
                    );
            }
        }
    }
);

// ─────────────────────────────────────────────
// messageCreate
// ─────────────────────────────────────────────

client.on(
    Events.MessageCreate,
    async message => {

        if (
            message.author?.bot
        ) {
            return;
        }

        handleMessageXp(
            client,
            message
        ).catch(
            () => {}
        );

        if (message.content?.trim().toLowerCase() === '!list') {
            require('./GameSystem/Pulls/ListSystem.js').handleList(client, message).catch(err => console.error('[List] 執行失敗:', err.message));
            return;
        }

        handleTranslationMessage(
            client,
            message
        ).catch(
            () => {}
        );
    }
);

// ─────────────────────────────────────────────
// Reaction
// ─────────────────────────────────────────────

client.on(
    Events.MessageReactionAdd,
    async (
        reaction,
        user
    ) => {

        if (user.bot) {
            return;
        }

        handleStarboardReaction(
            client,
            reaction,
            user
        ).catch(
            () => {}
        );
    }
);

client.on(
    Events.MessageReactionRemove,
    async (
        reaction,
        user
    ) => {

        if (user.bot) {
            return;
        }

        handleStarboardReaction(
            client,
            reaction,
            user
        ).catch(
            () => {}
        );
    }
);

// ─────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────

client.on(
    Events.MessageDelete,
    message =>
        logMessageDelete(
            client,
            message
        ).catch(
            () => {}
        )
);

client.on(
    Events.GuildMemberAdd,
    member =>
        logMemberChange(
            client,
            member,
            true
        ).catch(
            () => {}
        )
);

client.on(
    Events.GuildMemberRemove,
    member =>
        logMemberChange(
            client,
            member,
            false
        ).catch(
            () => {}
        )
);

client.on(
    Events.ChannelCreate,
    channel =>
        logGuildChange(
            client,
            null,
            channel,
            '頻道建立'
        ).catch(
            () => {}
        )
);

client.on(
    Events.ChannelDelete,
    channel =>
        logGuildChange(
            client,
            channel,
            null,
            '頻道刪除'
        ).catch(
            () => {}
        )
);

client.on(
    Events.ChannelUpdate,
    (
        oldChannel,
        newChannel
    ) =>
        logGuildChange(
            client,
            oldChannel,
            newChannel,
            '頻道'
        ).catch(
            () => {}
        )
);

client.on(
    Events.RoleCreate,
    role =>
        logGuildChange(
            client,
            null,
            role,
            '身分組建立'
        ).catch(
            () => {}
        )
);

client.on(
    Events.RoleDelete,
    role =>
        logGuildChange(
            client,
            role,
            null,
            '身分組刪除'
        ).catch(
            () => {}
        )
);

client.on(
    Events.RoleUpdate,
    (
        oldRole,
        newRole
    ) =>
        logGuildChange(
            client,
            oldRole,
            newRole,
            '身分組'
        ).catch(
            () => {}
        )
);


// ─────────────────────────────────────────────
// Voice State
// ─────────────────────────────────────────────

client.on(
    Events.VoiceStateUpdate,
    async (
        oldState,
        newState
    ) => {

        const userId =
            newState.member?.user?.id ||
            oldState.member?.user?.id;

        const username =
            newState.member?.user?.username ||
            oldState.member?.user?.username;

        const guildId =
            newState.guild?.id ||
            oldState.guild?.id;

        if (
            !userId ||
            newState.member?.user?.bot
        ) {
            return;
        }

        logVoiceChange(
            client,
            oldState,
            newState
        ).catch(
            () => {}
        );

        const joinedChannel =
            newState.channelId;

        const leftChannel =
            oldState.channelId;

        if (
            !leftChannel &&
            joinedChannel
        ) {

            trackVoiceJoin(
                userId,
                username,
                guildId,
                client
            );

        } else if (
            leftChannel &&
            !joinedChannel
        ) {

            trackVoiceLeave(
                userId,
                guildId,
                client,
                username
            );

        } 
    }
);

// ─────────────────────────────────────────────
// Client Ready
// ─────────────────────────────────────────────

const LEGACY_SLASH_COMMAND_NAMES = new Set([
    'setaimemory',
    'aioff'
]);

async function removeLegacySlashCommands(commandManager, scopeName) {
    const registered = await commandManager.fetch();
    let removed = 0;

    for (const command of registered.values()) {
        if (!LEGACY_SLASH_COMMAND_NAMES.has(command.name)) {
            continue;
        }

        await commandManager.delete(command.id);
        removed++;
    }

    if (removed > 0) {
        console.log(
            `[Commands] 已移除 ${scopeName} 舊 AI 指令：${removed} 個`
        );
    }
}

client.once(
    Events.ClientReady,
    async () => {

        console.log(
            `🤖 Angela 系統脈衝對齊。已激活：${client.user.tag}`
        );

        // ─────────────────────────────────────
        // 重新註冊 Slash Commands
        // ─────────────────────────────────────

        const commandData =
            allSlashCommands.map(
                cmd =>
                    cmd.toJSON()
            );

        // 舊指令清理失敗不能阻斷新指令註冊。
        try {
            await removeLegacySlashCommands(
                client.application.commands,
                '全域'
            );
        } catch (err) {
            console.warn(
                '[Commands] 清理全域舊指令失敗，繼續註冊目前指令:',
                err.message
            );
        }

        try {
            await client.application.commands.set([]);
        } catch (err) {
            console.warn(
                '[Commands] 清空全域指令失敗，繼續註冊 Guild 指令:',
                err.message
            );
        }

        let registeredGuilds = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                try {
                    await removeLegacySlashCommands(
                        guild.commands,
                        `Guild ${guild.id}`
                    );
                } catch (err) {
                    console.warn(
                        `[Commands] Guild ${guild.id} 舊指令清理失敗，仍繼續覆寫指令:`,
                        err.message
                    );
                }

                await guild.commands.set(commandData);
                registeredGuilds++;
            } catch (err) {
                console.error(
                    `[Commands] Guild ${guild.id} 指令註冊失敗:`,
                    err.message
                );
            }
        }

        console.log(
            `✅ 已註冊目前 Slash Commands：${registeredGuilds}/${client.guilds.cache.size} 個 Guild`
        );

        // ─────────────────────────────────────
        // Presence
        // ─────────────────────────────────────

        client.user.setPresence({
            status: 'idle',

            activities: [
                {
                    name:
                        'customstatus',

                    type:
                        ActivityType.Custom,

                    state:
                        '羅蘭。我不能在這裡停下。哪怕這是一條沒有盡頭的荊棘之路，哪怕最後只能迎來毫無意義的毀滅……我也要親手為這長達百年的悲劇畫上句號'
                }
            ]
        });

        // ─────────────────────────────────────
        // Discord 伺服器設定還原
        // ─────────────────────────────────────

        try {

            await restoreAllGuildConfigs(
                client
            );
            await AIChatSystem.restoreAll(
                client
            );

            const {
                setLevelChannel
            } = require(
                './GameSystem/LevelSystem.js'
            );

            const {
                setAnnounceChannel
            } = require(
                './GameSystem/AnnounceSystem.js'
            );

            for (
                const guild
                of client.guilds.cache.values()
            ) {

                const stored =
                    getGuildConfig(
                        guild.id
                    );

                const localPatch = {};

                if (
                    stored.notifyChannelId
                ) {

                    localPatch
                        .notifyChannelId =
                            stored.notifyChannelId;

                    setNotifyChannel(
                        stored.notifyChannelId
                    );
                }

                if (
                    stored.rateUpChannelId
                ) {
                    localPatch
                        .rateUpChannelId =
                            stored.rateUpChannelId;
                }

                if (
                    stored.newsChannelId
                ) {
                    localPatch
                        .newsChannelId =
                            stored.newsChannelId;
                }

                if (
                    Object.keys(
                        localPatch
                    ).length
                ) {

                    saveConfig(
                        localPatch
                    );
                }

                if (
                    stored.levelChannelId
                ) {

                    setLevelChannel(
                        guild.id,
                        stored.levelChannelId
                    );
                }

                if (
                    stored.announceChannelId
                ) {

                    setAnnounceChannel(
                        guild.id,
                        stored.announceChannelId
                    );
                }

                if (
                    stored.starboardChannelId
                ) {

                    _setStarboard(
                        guild.id,
                        stored.starboardChannelId
                    );
                }

                if (
                    stored.auditChannelId
                ) {

                    setAuditChannel(
                        guild.id,
                        stored.auditChannelId
                    );
                }

                if (
                    stored.translationOutputChannelId ||
                    stored.translationSourceChannelIds.length
                ) {

                    setTranslationConfig(
                        guild.id,
                        {
                            output:
                                stored.translationOutputChannelId,

                            sources:
                                stored.translationSourceChannelIds
                        }
                    );
                }
            }

        } catch (err) {

            console.error(
                '[Startup] Discord 伺服器設定還原失敗:',
                err.message
            );
        }

        // ─────────────────────────────────────
        // Legacy config
        // ─────────────────────────────────────

        const config =
            getConfig();

        if (
            config.notifyChannelId
        ) {

            setNotifyChannel(
                config.notifyChannelId
            );
        }

        if (
            config.notifyChannelId
        ) {

            try {

                const channel =
                    await client.channels
                        .fetch(
                            config.notifyChannelId
                        );

                if (channel) {

                    await channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    '🟢 系統連線：AI 助理 Angela 已重新上線'
                                )
                                .setColor(
                                    0x00b4d8
                                )
                                .setDescription(
                                    '「主管，精神脈衝已重新對齊。\n全域舊指令已抹除，特權與新聞檢測模組已完美校正。」'
                                )
                                .setTimestamp()
                        ]
                    });
                }

            } catch (err) {

                console.error(
                    '❌ 上線報告發送失敗:',
                    err.message
                );
            }
        }

        // ─────────────────────────────────────
        // 玩家資料備份還原
        // ─────────────────────────────────────

        try {

            const restored =
                await restoreFromBackupChannel(
                    client
                );

            if (
                restored > 0
            ) {

                console.log(
                    `📂 [Startup] 從備份頻道還原了 ${restored} 位玩家的資料`
                );
            }

        } catch (e) {

            console.error(
                '[Startup] 備份還原失敗（忽略）:',
                e.message
            );
        }

        // ─────────────────────────────────────
        // Rate Up
        // ─────────────────────────────────────

        await announceCurrentRateUps(
            client
        );

        // ─────────────────────────────────────
        // Newscheck
        // ─────────────────────────────────────

        startNewsCheckLoop(
            client
        );

        // 論壇文章可能在機器人啟動後才因新 ⭐ 達到門檻，
        // 而封存 Thread 不一定會穩定送出 reaction event。
        // 啟動時先掃一次，之後定期補掃，避免舊文章永遠漏掉。
        const scanForums = () =>
            scanAllGuildForums(client).catch(err =>
                console.error('[Starboard] 舊論壇補掃失敗:', err.message)
            );

        void scanForums();
        if (!globalThis.__STARBOARD_FORUM_SCAN_STARTED__) {
            globalThis.__STARBOARD_FORUM_SCAN_STARTED__ = true;
            setInterval(scanForums, 10 * 60 * 1000);
        }

        // ─────────────────────────────────────
        // Voice
        // ─────────────────────────────────────

        bootstrapVoiceTracking(
            client
        );

        startVoiceXpTimer(
            client
        );

        // monthly leaderboard is idempotent and checks Asia/Taipei midnight
        const monthlyLeaderboardTimer = setInterval(() => announceMonthlyLeaderboard(client).catch(err => console.error('[LevelSystem] 月榜公告失敗:', err.message)), 60_000);
        announceMonthlyLeaderboard(client).catch(err => console.error('[LevelSystem] 月榜公告失敗:', err.message));

        GiveawaySystem.resumeGiveaways(client);

        // ─────────────────────────────────────
        // 婚姻週年紀念檢查
        // ─────────────────────────────────────
        setInterval(() => MarriageSystem.checkAnniversaries(client).catch(err => console.error('[Marriage] 週年檢查失敗:', err.message)), 60_000);

        // ─────────────────────────────────────
        // 新年公告
        // ─────────────────────────────────────
        NewYearSystem.startNewYearTimer(client);

        // ─────────────────────────────────────
        // 心跳看門狗
        // ─────────────────────────────────────
        WatchdogSystem.start(client, () => client.login(process.env.DISCORD_TOKEN));
        setInterval(() => WatchdogSystem.beat(), 10_000);

        console.log(
            '📡 [排程] Newscheck / 語音 XP 計時器已啟動'
        );
    }
);

// ─────────────────────────────────────────────
// 錯誤保護
// ─────────────────────────────────────────────

client.on('shardReconnecting', () => console.warn('[Discord] 正在重新連線…'));
    client.on('shardResume', () => console.log('[Discord] 連線已恢復'));
    client.on('shardDisconnect', () => console.error('[Discord] 連線中斷'));
    client.on('invalidated', () => { console.error('[Discord] Session 已失效，交給 Render 重啟'); process.exit(1); });

    client.on(
    'error',
    err =>
        console.error(
            'Discord 客戶端錯誤:',
            err.message
        )
);

process.on(
    'unhandledRejection',
    err =>
        console.error(
            '未捕捉的 Promise 拒絕:',
            err?.message || err
        )
);

process.on('uncaughtException', err => {
      console.error('未捕捉的例外錯誤，將由 Render 重新啟動:', err?.stack || err);
      process.exitCode = 1;
      setTimeout(() => process.exit(1), 100);
    });

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

module.exports = {
    getConfig,
    saveConfig
};

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────

const TOKEN =
    process.env.DISCORD_TOKEN;

if (
    !TOKEN ||
    TOKEN ===
        'DISCORD_TOKEN'
) {

    console.error(
        '❌ 請設定環境變數 DISCORD_TOKEN'
    );

    process.exit(1);
}
AIChatSystem.init(client);
require('./GameSystem/AchievementSystem.js').init(client);
require('./GameSystem/DailyQuestSystem.js').init(client);
client.login(
    TOKEN
);
