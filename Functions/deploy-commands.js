// Functions/deploy-commands.js
// 手動註冊指令；Startup.js 上線時也會以同一套核心指令註冊到各伺服器。
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const admin = PermissionFlagsBits.Administrator;
const commands = [
    new SlashCommandBuilder().setName('pull').setDescription('開啟狂氣提取介面'),
    new SlashCommandBuilder().setName('pack').setDescription('查看背包與資源'),
    new SlashCommandBuilder().setName('list').setDescription('查看卡池機率與清單'),
    new SlashCommandBuilder().setName('limbusids').setDescription('查看角色 ID 與中英文名稱'),
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
    new SlashCommandBuilder().setName('leave').setDescription('離開語音'),
    new SlashCommandBuilder().setName('status').setDescription('查看狀態'),
    new SlashCommandBuilder().setName('setchannel').setDescription('設定系統頻道').setDefaultMemberPermissions(admin)
        .addStringOption(o => o.setName('type').setDescription('頻道類型').setRequired(true).addChoices(
            { name: '系統通知', value: 'notify' }, { name: 'Rate Up', value: 'rateup' }, { name: '新聞', value: 'news' },
            { name: '升級公告', value: 'level' }, { name: 'Sles公告', value: 'announce' }, { name: '星星榜', value: 'starboard' },
            { name: '紀錄', value: 'audit' }, { name: '翻譯輸出', value: 'translate-output' }, { name: '切換翻譯來源', value: 'translate-source' }))
        .addChannelOption(o => o.setName('target_channel').setDescription('目標文字頻道').addChannelTypes(ChannelType.GuildText).setRequired(true)),
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
    new SlashCommandBuilder().setName('help').setDescription('顯示指令清單'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('⏳ 正在註冊斜線指令...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ 斜線指令註冊成功');
    } catch (err) { console.error('❌ 註冊失敗:', err); }
})();
