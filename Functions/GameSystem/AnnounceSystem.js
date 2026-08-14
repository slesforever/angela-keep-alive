// Functions/GameSystem/AnnounceSystem.js
// 全伺服器公告系統
// 僅限 Sles 可發布，各伺服器管理員可設定接收頻道
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const ANNOUNCE_CONFIG_PATH = path.join(
    process.cwd(),
    'data',
    'announce-config.json'
);

// ─────────────────────────────────────────────
// 設定讀取 / 儲存
// ─────────────────────────────────────────────

function getAnnounceConfig() {
    try {
        if (
            fs.existsSync(
                ANNOUNCE_CONFIG_PATH
            )
        ) {
            return JSON.parse(
                fs.readFileSync(
                    ANNOUNCE_CONFIG_PATH,
                    'utf8'
                )
            );
        }
    } catch (err) {
        console.error(
            '[AnnounceSystem] 讀取設定失敗:',
            err.message
        );
    }

    return {};
}

function saveAnnounceConfig(config) {
    try {
        fs.mkdirSync(
            path.dirname(
                ANNOUNCE_CONFIG_PATH
            ),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            ANNOUNCE_CONFIG_PATH,
            JSON.stringify(
                config,
                null,
                2
            ),
            'utf8'
        );
    } catch (err) {
        console.error(
            '[AnnounceSystem] 儲存設定失敗:',
            err.message
        );
    }
}

// ─────────────────────────────────────────────
// 設定公告接收頻道
// ─────────────────────────────────────────────

function setAnnounceChannel(
    guildId,
    channelId
) {
    const config =
        getAnnounceConfig();

    config[guildId] =
        channelId;

    saveAnnounceConfig(
        config
    );
}

// ─────────────────────────────────────────────
// 移除公告頻道
// ─────────────────────────────────────────────

function removeAnnounceChannel(
    guildId
) {
    const config =
        getAnnounceConfig();

    delete config[guildId];

    saveAnnounceConfig(
        config
    );
}

// ─────────────────────────────────────────────
// 廣播公告
// ─────────────────────────────────────────────

async function broadcastAnnouncement(
    client,
    interaction,
    messageText
) {
    const config =
        getAnnounceConfig();

    const entries =
        Object.entries(
            config
        );

    if (
        entries.length === 0
    ) {
        return interaction.reply({
            content:
                '⚠️ 目前沒有任何伺服器設置了公告頻道。',
            flags: 64
        });
    }

    await interaction.deferReply({
        flags: 64
    });

    // 保留使用者在 Modal 裡輸入的換行
    const finalMessage =
        String(
            messageText || ''
        ).trim();

    if (!finalMessage) {
        return interaction.editReply({
            content:
                '❌ 公告內容不能為空。'
        });
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                '📢 Angela 系統公告'
            )
            .setColor(
                0x00b4d8
            )
            .setDescription(
                finalMessage.slice(
                    0,
                    4096
                )
            )
            .setFooter({
                text:
                    '由 Angela 系統最高主管 Sles 發布'
            })
            .setTimestamp();

    let successCount = 0;
    let failCount = 0;

    for (
        const [
            guildId,
            channelId
        ]
        of entries
    ) {
        try {
            const channel =
                await client.channels
                    .fetch(
                        channelId
                    )
                    .catch(() => null);

            if (
                !channel ||
                !channel.isTextBased?.()
            ) {
                failCount++;
                continue;
            }

            await channel.send({
                embeds: [
                    embed
                ],
                allowedMentions: {
                    parse: []
                }
            });

            successCount++;

        } catch (err) {
            failCount++;

            console.error(
                `[AnnounceSystem] ${guildId} 公告發送失敗:`,
                err.message
            );
        }
    }

    await interaction.editReply({
        content:
            `✅ 公告已發送至 **${successCount}** 個伺服器。` +
            (
                failCount
                    ? `（${failCount} 個失敗）`
                    : ''
            )
    });
}

module.exports = {
    setAnnounceChannel,
    removeAnnounceChannel,
    broadcastAnnouncement,
    getAnnounceConfig,
};
