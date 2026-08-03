// deploy-commands.js
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
    // 抽卡
    new SlashCommandBuilder().setName('pull').setDescription('開啟狂狂的抽取介面'),

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

    // 語音頻道控制
    new SlashCommandBuilder().setName('join').setDescription('讓機器人加入你目前所在的語音頻道'),
    new SlashCommandBuilder().setName('leave').setDescription('讓機器人離開目前所在的語音頻道'),
    new SlashCommandBuilder().setName('status').setDescription('查看機器人目前的運行狀態'),

    // 新聞測試
    new SlashCommandBuilder().setName('steam').setDescription('手動觸發測試 Steam 最新公告'),
    new SlashCommandBuilder().setName('tweet').setDescription('手動觸發測試 Twitter 最新推文'),
    new SlashCommandBuilder().setName('yt').setDescription('手動觸發測試 YouTube 最新影片'),

    // 等級系統
    new SlashCommandBuilder().setName('rank').setDescription('查看你的等級與 XP 進度'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('查看 XP 等級排行榜 Top 10'),
    new SlashCommandBuilder().setName('gamble').setDescription('50/50 賭博 LightSeeds'),

    // 管理員指令
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('設定 Angela 系統各項頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setlevelchannel')
        .setDescription('設定升級公告頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('setannouncechannel')
        .setDescription('設定接收全域公告頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givelightseeds')
        .setDescription('發放 LightSeeds')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givefragments')
        .setDescription('發放碎片')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givescrolls')
        .setDescription('發放抽卡券')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givethreads')
        .setDescription('發放絲線')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('updaterewards')
        .setDescription('更新獎勵設置')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('updatebuff')
        .setDescription('更新倍率 Buff')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Help
    new SlashCommandBuilder().setName('help').setDescription('顯示 Angela 機器人指令清單')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('⏳ 正在向 Discord 註冊斜線指令...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ 斜線指令註冊成功');
    } catch (err) {
        console.error('❌ 註冊失敗:', err);
    }
})();
