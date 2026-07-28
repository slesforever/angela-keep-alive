// deploy-commands.js
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
    // 抽卡
    new SlashCommandBuilder()
        .setName('pull')
        .setDescription('開啟狂氣提取介面'),

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

    // 管理員指令
    new SlashCommandBuilder()
        .setName('givelunacy')
        .setDescription('[管理員] 發放狂氣')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givefragments')
        .setDescription('[管理員] 發放碎片')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givescrolls')
        .setDescription('[管理員] 發放抽卡券')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('givethreads')
        .setDescription('[管理員] 發放絲線')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('updaterewards')
        .setDescription('[管理員] 更新獎勵設置')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('updatebuff')
        .setDescription('[管理員] 更新倍率 Buff')
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
        console.log('✅ 所有斜線指令註冊成功！');
    } catch (error) {
        console.error('❌ 指令註冊失敗:', error);
    }
})();
