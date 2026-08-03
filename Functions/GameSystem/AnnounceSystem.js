// Functions/GameSystem/AnnounceSystem.js
// 全伺服器公告系統 — 僅限 Sles 可發布，各伺服器管理員可設定接收頻道
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const ANNOUNCE_CONFIG_PATH = path.join(process.cwd(), 'data', 'announce-config.json');

function getAnnounceConfig() {
    try {
        if (fs.existsSync(ANNOUNCE_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(ANNOUNCE_CONFIG_PATH, 'utf8'));
        }
    } catch {}
    return {};
}

function saveAnnounceConfig(config) {
    try {
        fs.mkdirSync(path.dirname(ANNOUNCE_CONFIG_PATH), { recursive: true });
        fs.writeFileSync(ANNOUNCE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        console.error('[AnnounceSystem] 儲存設定失敗:', err.message);
    }
}

// 設定某個伺服器的公告接收頻道（伺服器管理員可設定）
function setAnnounceChannel(guildId, channelId) {
    const config = getAnnounceConfig();
    config[guildId] = channelId;
    saveAnnounceConfig(config);
}

// 移除公告頻道設定
function removeAnnounceChannel(guildId) {
    const config = getAnnounceConfig();
    delete config[guildId];
    saveAnnounceConfig(config);
}

// Sles 發送全伺服器公告
async function broadcastAnnouncement(client, interaction, messageText) {
    const config = getAnnounceConfig();
    const entries = Object.entries(config);

    if (entries.length === 0) {
        return interaction.reply({
            content: '⚠️ 目前沒有任何伺服器設置了公告頻道。',
            ephemeral: true,
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
        .setTitle('📢 Angela 系統公告')
        .setColor(0x00b4d8)
        .setDescription(messageText)
        .setFooter({ text: '由 Angela 系統最高主管 Sles 發布' })
        .setTimestamp();

    let successCount = 0;
    let failCount = 0;

    for (const [guildId, channelId] of entries) {
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) { failCount++; continue; }
            await channel.send({ embeds: [embed] });
            successCount++;
        } catch {
            failCount++;
        }
    }

    await interaction.editReply({
        content: `✅ 公告已發送至 **${successCount}** 個伺服器。${failCount ? `（${failCount} 個失敗）` : ''}`,
    });
}

module.exports = {
    setAnnounceChannel,
    removeAnnounceChannel,
    broadcastAnnouncement,
    getAnnounceConfig,
};
