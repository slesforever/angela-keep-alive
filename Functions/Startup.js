// Functions/Startup.js
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const identitiesData = require('./GameSystem/Pulls/identitiesData.js'); 

// 引入同層的其他核心模組
const { startNewsCheckLoop } = require('./Newscheck.js');
const { handleCommands } = require('./Commanders.js');

const NOTIFY_CHANNEL_ID = '1402282604165730348';
const RATEUP_ANNOUNCE_CHANNEL_ID = '1510153086281187330';

// 1. 建立 Discord 機器人本體
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// 輔助：星級轉換
function rarityToStars(rarity) {
    if (rarity === 'Color Fixer') return '👑 Color Fixer';
    if (rarity === 'Special') return '🌀 Special';
    if (rarity === '0000') return '✨ ★★★★';
    if (rarity === 'Egos') return '🔮 E.G.O';
    if (rarity === '000') return '★★★';
    if (rarity === '00') return '★★';
    return '★';
}

// 輔助：格式化池子
function normalizeRateUpList(rarity) {
    const rateUpSource = identitiesData.upTargets || identitiesData.rateUpIds || identitiesData.targetIdentities || {};
    const value = rateUpSource[rarity];
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return [value];
    return [];
}

async function announceCurrentRateUps(botClient) {
    try {
        const channel = await botClient.channels.fetch(RATEUP_ANNOUNCE_CHANNEL_ID);
        if (!channel) return;
        const rarities = ['Color Fixer', 'Special', '0000', 'Egos', '000', '00', '0'];
        const sections = [];
        for (const r of rarities) {
            const list = normalizeRateUpList(r);
            if (list.length) sections.push(`### ${rarityToStars(r)}\n${list.map(v => `• ${v}`).join('\n')}`);
        }
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd166)
                    .setTitle('📢 Rate Up 人格與物資資料已成功載入')
                    .setDescription(sections.length ? sections.join('\n\n') : '目前池內沒有設定任何 Rate Up 對象。')
                    .setTimestamp()
            ]
        });
    } catch (err) {
        console.error('Rate Up 公告失敗:', err);
    }
}

// =================【 核心監聽：持續接收指令 】=================
// 只要這段程式碼掛載著，機器人對玩家訊息的監聽就不會中斷
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    if (typeof handleCommands === 'function') {
        try {
            await handleCommands(client, message);
        } catch (err) {
            console.error('❌ 指令執行模組發生內部錯誤:', err);
        }
    }
});

// =================【 核心監聽：上線準備完畢 】=================
client.once('ready', async () => {
    console.log(`🤖 Angela 系統脈衝對齊。主入口已由 Startup.js 成功激活：${client.user.tag}`);
    
    client.user.setPresence({
        status: 'idle',
        activities: [{ name: 'customstatus', type: 4, state: 'Sles被我吃掉了' }]
    });

    // 發送上線報告
    try {
        const channel = await client.channels.fetch(NOTIFY_CHANNEL_ID);
        if (channel) {
            const loginEmbed = new EmbedBuilder()
                .setTitle('🟢 系統連線：AI 助理 Angela 已重新上線')
                .setColor(0x00b4d8)
                .setDescription('「主管，精神脈衝已重新對齊。核心系統與指令發射器已就緒，隨時待命。」')
                .setTimestamp();
            await channel.send({ embeds: [loginEmbed] });
        }
    } catch (err) {
        console.error('❌ 上線報告發送失敗:', err.message);
    }

    // 載入當前 RateUp 資訊
    await announceCurrentRateUps(client);

    // =================【 核心監聽：啟動 Newscheck 背景無限循環 】=================
    if (typeof startNewsCheckLoop === 'function') {
        console.log('📡 [排程激活] 正在啟動 Newscheck 每分鐘自動觀測任務...');
        startNewsCheckLoop(client);
    }
});

// =================【 核心啟動登入 】=================
// 請確保你的環境變數有填寫，或者直接替換成你的 Token 字串
const TOKEN = process.env.DISCORD_TOKEN || 'DISCORD_TOKEN';
client.login(TOKEN);
