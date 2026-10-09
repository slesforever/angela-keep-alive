// Functions/deploy-commands.js
// 手動註冊指令；Startup.js 上線時也會以同一套核心指令註冊到各伺服器。
const {
    Client,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const admin = PermissionFlagsBits.Administrator;
const commands = [
    new SlashCommandBuilder().setName('pull_limbuscompany').setDescription('開啟 LightSeeds 提取介面'),
    new SlashCommandBuilder().setName('pack_limbuscompany').setDescription('查看背包與資源'),
    new SlashCommandBuilder().setName('list_limbuscompany').setDescription('查看卡池機率與清單'),
    new SlashCommandBuilder().setName('battle').setDescription('選擇難度進入戰鬥'),
    new SlashCommandBuilder().setName('party').setDescription('查看與管理隊伍'),
    new SlashCommandBuilder().setName('sinner').setDescription('查看罪人資料'),
    new SlashCommandBuilder().setName('uptie').setDescription('提升連結'),
    new SlashCommandBuilder().setName('equip').setDescription('更換裝備'),
    new SlashCommandBuilder().setName('threads').setDescription('查詢絲線'),
    new SlashCommandBuilder().setName('md').setDescription('開啟鏡光迷宮'),
    new SlashCommandBuilder().setName('rank').setDescription('查看等級與 XP').addUserOption(o => o.setName('target').setDescription('目標玩家')),
    new SlashCommandBuilder().setName('leaderboard').setDescription('查看 XP TOP 10'),
    new SlashCommandBuilder().setName('language').setDescription('選擇顯示語言').addStringOption(o => o.setName('language').setDescription('語言').setRequired(true).addChoices({ name: '繁體中文', value: 'zh' }, { name: 'English', value: 'en' })),
    new SlashCommandBuilder().setName('sc').setDescription('Starcoins 經濟系統')
        .addSubcommand(s => s.setName('pay').setDescription('支付 Starcoins').addUserOption(o => o.setName('target').setDescription('收款玩家').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('金額').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('work').setDescription('工作取得 Starcoins'))
        .addSubcommand(s => s.setName('bank').setDescription('銀行操作').addStringOption(o => o.setName('action').setDescription('操作').setRequired(true).addChoices({ name: '存錢', value: 'deposit' }, { name: '拿錢', value: 'withdraw' }, { name: '查看餘額', value: 'balance' })).addIntegerOption(o => o.setName('amount').setDescription('金額').setMinValue(1))),
    new SlashCommandBuilder().setName('gamble').setDescription('Starcoins 50/50 賭博').addIntegerOption(o => o.setName('amount').setDescription('下注金額').setRequired(true).setMinValue(10).setMaxValue(50000)),
    new SlashCommandBuilder().setName('gayrate').setDescription('男同指數').addUserOption(o => o.setName('target').setDescription('目標玩家')),
    new SlashCommandBuilder().setName('lesbianrate').setDescription('女同指數').addUserOption(o => o.setName('target').setDescription('目標玩家')),
    new SlashCommandBuilder().setName('join').setDescription('加入語音'),
    new SlashCommandBuilder().setName('play').setDescription('播放 YouTube 或 SoundCloud 音樂（支援播放清單）').addStringOption(o => o.setName('musiclink').setDescription('音樂或播放清單連結').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('離開語音'),
    new SlashCommandBuilder().setName('marry').setDescription('查看婚姻狀態或發送結婚請求')
        .addSubcommand(s => s.setName('status').setDescription('查看自己的婚姻狀態與配偶'))
        .addSubcommand(s => s.setName('request').setDescription('向指定使用者發送結婚請求').addUserOption(o => o.setName('target').setDescription('選擇要結婚的使用者').setRequired(true)))
        .addSubcommand(s => s.setName('cancel').setDescription('取消你發送中的結婚請求')),
    new SlashCommandBuilder().setName('divorce').setDescription('離婚；不選對象會顯示可選配偶').addUserOption(o => o.setName('target').setDescription('選擇要離婚的配偶')),
    new SlashCommandBuilder().setName('status').setDescription('查看狀態'),
    new SlashCommandBuilder().setName('setchannel').setDescription('設定系統頻道').setDefaultMemberPermissions(admin)
        .addStringOption(o => o.setName('type').setDescription('頻道類型').setRequired(true).addChoices(
            { name: '系統通知', value: 'notify' }, { name: 'Rate Up', value: 'rateup' }, { name: '新聞', value: 'news' },
            { name: '升級公告', value: 'level' }, { name: 'Sles公告', value: 'announce' }, { name: '星星榜', value: 'starboard' },
            { name: '紀錄', value: 'audit' }, { name: '翻譯輸出', value: 'translate-output' }, { name: '切換翻譯來源', value: 'translate-source' }, { name: 'AI 自動回覆', value: 'ai' }, { name: 'AI 記憶庫', value: 'ai-memory' }))
        .addChannelOption(o => o.setName('target_channel').setDescription('目標文字頻道').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('aipersona').setDescription('切換此頻道的 AI 人格').setDefaultMemberPermissions(admin)
        .addStringOption(o => o.setName('persona').setDescription('選擇人格').setRequired(true).addChoices(
            { name: 'Angela（冷靜可靠的圖書館 AI 主管）', value: 'default' },
            { name: '安潔菈（傲嬌、嘴硬心軟）', value: 'tsundere' },
            { name: '博士（博學、求知欲強）', value: 'scholar' },
            { name: '小安（親切的朋友）', value: 'buddy' },
            { name: '光鑽（溫柔、認真、努力家）', value: 'satono' })),
    new SlashCommandBuilder().setName('setlevelchannel').setDescription('設定升級公告頻道').setDefaultMemberPermissions(admin).addChannelOption(o => o.setName('target_channel').setDescription('頻道').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('setannouncechannel').setDescription('設定全域公告頻道').setDefaultMemberPermissions(admin).addChannelOption(o => o.setName('target_channel').setDescription('頻道').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('givestarcoins').setDescription('Sles專屬：發放 Starcoins').setDefaultMemberPermissions(admin).addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true).setMinValue(1)).addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)),
    new SlashCommandBuilder().setName('takelightseeds').setDescription('Sles專屬：扣除 LightSeeds').setDefaultMemberPermissions(admin).addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true).setMinValue(1)).addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)),
    new SlashCommandBuilder().setName('givelightseeds').setDescription('Sles專屬：發放 LightSeeds').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givefragments').setDescription('Sles專屬：發放碎片').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givescrolls').setDescription('Sles專屬：發放抽卡券').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givethreads').setDescription('Sles專屬：發放絲線').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('announce').setDescription('Sles專屬：全伺服器公告').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('message').setDescription('內容').setRequired(true)),
    new SlashCommandBuilder().setName('shop').setDescription('開啟商城 UI'),
    new SlashCommandBuilder().setName('shop-add').setDescription('Sles專屬：上架商城商品').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('name').setDescription('商品名稱').setRequired(true)).addStringOption(o => o.setName('info').setDescription('商品資訊')).addIntegerOption(o => o.setName('lightseeds').setDescription('LightSeeds 價格').setMinValue(0)).addIntegerOption(o => o.setName('starcoins').setDescription('StarCoins 價格').setMinValue(0)).addIntegerOption(o => o.setName('minlevel').setDescription('最低等級').setMinValue(0)).addIntegerOption(o => o.setName('stock').setDescription('庫存').setMinValue(1)),
    new SlashCommandBuilder().setName('shop-remove').setDescription('Sles專屬：下架商城商品').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('item_id').setDescription('商品 ID').setRequired(true)),
    new SlashCommandBuilder().setName('shop-confirm').setDescription('Sles專屬：確認商城序號已交付').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('code').setDescription('購買序號').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway-create').setDescription('建立抽獎活動').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('prize_name').setDescription('獎品名稱').setRequired(true)).addIntegerOption(o => o.setName('winners').setDescription('抽出人數').setRequired(true).setMinValue(1).setMaxValue(20)).addStringOption(o => o.setName('prize_info').setDescription('獎品資訊')).addIntegerOption(o => o.setName('max_participants').setDescription('最多參加人數').setMinValue(1).setMaxValue(10000)).addIntegerOption(o => o.setName('min_level').setDescription('最低等級').setMinValue(0).setMaxValue(100)).addIntegerOption(o => o.setName('entry_lightseeds').setDescription('參加扣除 LightSeeds').setMinValue(0)).addIntegerOption(o => o.setName('entry_starcoins').setDescription('參加扣除 StarCoins').setMinValue(0)).addIntegerOption(o => o.setName('prize_lightseeds').setDescription('得獎發放 LightSeeds').setMinValue(0)).addIntegerOption(o => o.setName('prize_starcoins').setDescription('得獎發放 StarCoins').setMinValue(0)).addIntegerOption(o => o.setName('duration').setDescription('持續分鐘').setMinValue(1).setMaxValue(10080)),
    new SlashCommandBuilder().setName('giveaway-end').setDescription('提前結束抽獎').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('id').setDescription('抽獎 ID').setRequired(true)),
    new SlashCommandBuilder().setName('profile').setDescription('查看完整個人資料').addUserOption(o => o.setName('target').setDescription('查看其他玩家')),
    new SlashCommandBuilder().setName('updateprofile').setDescription('編輯個人資料（每天最多 2 次）')
        .addStringOption(o => o.setName('bio').setDescription('自我介紹（最多 500 字）').setMaxLength(500))
        .addStringOption(o => o.setName('origin').setDescription('經驗來源（最多 300 字）').setMaxLength(300))
        .addStringOption(o => o.setName('image_url').setDescription('背景圖片網址（banner）'))
        .addStringOption(o => o.setName('title').setDescription('裝備稱號')),
    new SlashCommandBuilder().setName('title').setDescription('查看或裝備稱號')
        .addStringOption(o => o.setName('action').setDescription('操作').setRequired(true).addChoices({ name: '查看列表', value: 'list' }, { name: '裝備', value: 'equip' }, { name: '卸下', value: 'unequip' }))
        .addStringOption(o => o.setName('name').setDescription('稱號名稱')),
    new SlashCommandBuilder().setName('checkin').setDescription('每日簽到'),
    new SlashCommandBuilder().setName('help').setDescription('顯示指令清單'),
].map(command => command.toJSON());

const token = (process.env.DISCORD_TOKEN || '').trim();

if (!token) {
    console.error('❌ 請設定環境變數 DISCORD_TOKEN');
    process.exitCode = 1;
} else {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    client.once(Events.ClientReady, async () => {
        try {
            // 由登入後的 client.application.id 識別 App，
            // 不再要求另外設定 CLIENT_ID。
            await client.application.commands.set([]);

            let registeredGuilds = 0;
            for (const guild of client.guilds.cache.values()) {
                await guild.commands.set(commands);
                registeredGuilds++;
            }

            console.log(
                `✅ Slash Commands 註冊完成：${registeredGuilds} 個 Guild`
            );
        } catch (err) {
            console.error('❌ 註冊失敗:', err.message);
            process.exitCode = 1;
        } finally {
            client.destroy();
        }
    });

    client.login(token).catch(err => {
        console.error('❌ Discord 登入失敗:', err.message);
        process.exitCode = 1;
    });
}
