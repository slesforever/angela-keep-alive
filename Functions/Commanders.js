// Functions/Commanders.js
// 1. 引流至 GameSystem 內部的遊戲腳本
const PacksAndData = require('./GameSystem/PacksAndData.js');
const Stages = require('./GameSystem/Stages.js');
const GiveAwaySystem = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon = require('./GameSystem/MirrorDungeon.js'); 

// 2. 引流至內嵌 Pulls 資料夾下的抽卡腳本
const PullSystem = require('./GameSystem/Pulls/PullSystem.js');

// 3. 引流至同層的新聞手動檢測
const { checkSteamUpdates, checkTwitterUpdates } = require('./Newscheck.js');

/**
 * 核心指令解析器
 */
async function handleCommands(client, message) {
    const msg = message.content.trim();

    // 抽卡核心指令 (!pull, !十連)
    if (msg.startsWith('!pull') || msg === '!單抽' || msg === '!十連') {
        if (PullSystem && typeof PullSystem.executePull === 'function') {
            return await PullSystem.executePull(client, message);
        }
    }

    // 背包與清單核心指令 (!pack, !list)
    if (msg.startsWith('!pack') || msg.startsWith('!list') || msg === '!bag') {
        if (PacksAndData && typeof PacksAndData.handleInventory === 'function') {
            return await PacksAndData.handleInventory(client, message);
        } else {
            return message.reply('❌ 報告主管，PacksAndData 內尚未導出 handleInventory 核心函數。');
        }
    }

    // 主線/關卡戰鬥核心 (!stage)
    if (msg.startsWith('!stage') || msg === '!挑戰') {
        if (Stages && typeof Stages.handleStage === 'function') {
            return await Stages.handleStage(client, message);
        }
    }

    // 鏡光迷宮核心指令 (!md, !mirror)
    if (msg.startsWith('!md') || msg.startsWith('!mirror') || msg === '!鏡光迷宮') {
        if (MirrorDungeon && typeof MirrorDungeon.handleMirrorDungeon === 'function') {
            return await MirrorDungeon.handleMirrorDungeon(client, message);
        } else {
            return message.reply('❌ 報告主管，MirrorDungeon 內尚未導出 handleMirrorDungeon 核心函數。');
        }
    }

    // 管理員福利發放系統 (!givelunacy)
    if (msg.startsWith('!givelunacy') || msg.startsWith('!updaterewards') || msg.startsWith('!updatebuff')) {
        if (GiveAwaySystem && typeof GiveAwaySystem.handleGiveAway === 'function') {
            return await GiveAwaySystem.handleGiveAway(client, message);
        }
    }

    // 手動管理員新聞觀測
    if (msg === '!steam') {
        await message.channel.sendTyping();
        return await checkSteamUpdates(client, true, message);
    }
    if (msg === '!測試官方推文' || msg === '!testtweet') {
        await message.channel.sendTyping();
        return await checkTwitterUpdates(client, true, message);
    }
}

module.exports = { handleCommands };
