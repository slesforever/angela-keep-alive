// Functions/GameSystem/PacksAndData.js
const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./Pulls/identitiesData.js');

const STORAGE_CHANNEL_ID = '1510947300212477972';

async function loadUserInventory(client, userId) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) {
            console.error('❌ 找不到指定的儲存頻道，請檢查機器人權限。');
            return [];
        }

        const messages = await channel.messages.fetch({ limit: 100 });
        const targetMsg = messages.find(m => m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`));

        if (targetMsg) {
            const parts = targetMsg.content.split(' || ');
            const jsonStr = parts[2];
            return JSON.parse(jsonStr);
        }
    } catch (err) {
        console.error(`❌ 讀取玩家 ${userId} 頻道存檔失敗:`, err.message);
    }
    return [];
}

async function saveUserInventory(client, userId, inventory) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) return;

        const formatContent = `📥 DATA_SAVE || ${userId} || ${JSON.stringify(inventory)}`;
        await channel.send(formatContent);
        console.log(`💾 [核心資料庫] 玩家 ${userId} 的最新數據已成功上傳至儲存頻道！`);
    } catch (err) {
        console.error(`❌ 寫入玩家 ${userId} 頻道存檔失敗:`, err.message);
    }
}

function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

async function handleInventory(client, message) {
    const userId = message.author.id;
    const msg = message.content.trim();

    if (msg.startsWith('!list')) {
        const egoList = identitiesData.pool['Egos'] || [];
        const pool000 = identitiesData.pool['000'] || [];
        const pool00 = identitiesData.pool['00'] || [];

        const MAX_FIELD = 900;

        function buildFieldValue(arr) {
            let text = '';
            for (const item of arr) {
                const line = `• ${item}\n`;
                if ((text + line).length > MAX_FIELD) {
                    text += `…（共 ${arr.length} 項）`;
                    break;
                }
                text += line;
            }
            return text.trim() || '無';
        }

        const listEmbed = new EmbedBuilder()
            .setTitle('📂 Angela 檔案庫 - 當前可提取物資總覽')
            .setColor(0x74b9ff)
            .addFields(
                { name: `🔮 E.G.O 池（${egoList.length} 項）`, value: buildFieldValue(egoList) },
                { name: `🔥 精英 000 人格（${pool000.length} 項）`, value: buildFieldValue(pool000) },
                { name: `⭐ 標準 00 人格（${pool00.length} 項）`, value: buildFieldValue(pool00) }
            )
            .setFooter({ text: '輸入 !pull 或 !十連 即可消耗狂氣進行人格提取。' });

        return message.reply({ embeds: [listEmbed] });
    }

    if (msg.startsWith('!pack') || msg === '!bag') {
        const loadingMsg = await message.reply('「主管，正在從腦葉核心紀錄通道中，遠端對齊您的個人收容數據...」');

        const userInventory = await loadUserInventory(client, userId);

        if (userInventory.length === 0) {
            return loadingMsg.edit('「主管，您的個人收容室在核心通道中空空如也。請先使用 `!pull` 提取您的人格。」');
        }

        const itemCounts = {};
        userInventory.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });

        const allLines = Object.entries(itemCounts)
            .map(([item, count]) => `• **${item}** x${count}`);

        const MAX_DESC = 3800;
        let description = '### **當前已同步的人格與自我 (E.G.O)：**\n\n';
        for (const line of allLines) {
            if ((description + line + '\n').length > MAX_DESC) {
                description += `\n_（還有更多項目，共 ${userInventory.length} 件）_`;
                break;
            }
            description += line + '\n';
        }

        const packEmbed = new EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
            .setTitle('🗃️ 邊獄公司 - 員工個人收容倉庫 (雲端備份版)')
            .setColor(0x2ed573)
            .setDescription(description)
            .setFooter({ text: `儲存軌道識別碼: ${userId} | 總計 ${userInventory.length} 件收容物` })
            .setTimestamp();

        return loadingMsg.edit({ content: null, embeds: [packEmbed] });
    }
}

module.exports = { handleInventory, loadUserInventory, saveUserInventory };
