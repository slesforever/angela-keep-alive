// Functions/GameSystem/ServerConfigStorage.js
// Angela 伺服器設定儲存系統
//
// 設定會被序列化後存進 Discord 指定的「儲存頻道」。
// Bot 重啟 / 更新後會重新掃描該頻道並恢復設定。
//
// 儲存資料不是玩家資料。
// 每個 Guild 各自一份設定。
// 儲存頻道可由伺服器管理員使用 /setstoragechannel 設定。

'use strict';

const {
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const STORAGE_MARKER = 'ANGELA_SERVER_CONFIG_V1';
const STORAGE_TITLE = '🔒 Angela Server Configuration';

// ─────────────────────────────────────────────
// 記憶體快取
// guildId -> {
//     storageChannelId: string,
//     config: object
// }
// ─────────────────────────────────────────────

const serverConfigs = new Map();

// ─────────────────────────────────────────────
// 預設結構
// ─────────────────────────────────────────────

function createDefaultConfig() {
    return {
        notifyChannelId: '',
        rateUpChannelId: '',
        newsChannelId: '',

        levelChannelId: '',
        announceChannelId: '',
        starboardChannelId: '',
        auditChannelId: '',
        translationOutputChannelId: '',
        translationSourceChannelIds: [],

        storageChannelId: ''
    };
}

function normalizeConfig(config = {}) {
    const base = createDefaultConfig();

    return {
        ...base,
        ...config,

        translationSourceChannelIds:
            Array.isArray(config.translationSourceChannelIds)
                ? [...new Set(
                    config.translationSourceChannelIds
                        .filter(Boolean)
                        .map(String)
                )]
                : []
    };
}

// ─────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────

function getMemoryEntry(guildId) {
    if (!serverConfigs.has(guildId)) {
        serverConfigs.set(guildId, {
            storageChannelId: '',
            config: createDefaultConfig()
        });
    }

    return serverConfigs.get(guildId);
}

function getGuildConfig(guildId) {
    if (!guildId) {
        return createDefaultConfig();
    }

    return normalizeConfig(
        getMemoryEntry(guildId).config
    );
}

function setGuildConfig(guildId, config) {
    if (!guildId) return;

    const entry = getMemoryEntry(guildId);

    entry.config = normalizeConfig(config);

    if (entry.config.storageChannelId) {
        entry.storageChannelId =
            entry.config.storageChannelId;
    }
}

// ─────────────────────────────────────────────
// Discord 設定訊息格式
// ─────────────────────────────────────────────

function buildStorageEmbed(
    guildId,
    config
) {
    const safeConfig = normalizeConfig(config);

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(STORAGE_TITLE)
        .setDescription(
            '這是 Angela 的伺服器設定資料。\n' +
            '請勿手動修改此訊息。Bot 更新 / 重啟時會從此訊息恢復設定。'
        )
        .addFields({
            name: 'Guild ID',
            value: `\`${guildId}\``,
            inline: false
        })
        .setFooter({
            text: STORAGE_MARKER
        })
        .setTimestamp();
}

// ─────────────────────────────────────────────
// 找到設定訊息
// ─────────────────────────────────────────────

async function findConfigMessage(
    channel,
    guildId
) {
    if (!channel?.isTextBased?.()) {
        return null;
    }

    let before = undefined;

    // 最多掃幾頁，避免特殊情況無限抓
    for (let page = 0; page < 20; page++) {
        const options = {
            limit: 100
        };

        if (before) {
            options.before = before;
        }

        const messages =
            await channel.messages
                .fetch(options)
                .catch(() => null);

        if (!messages?.size) {
            break;
        }

        for (const message of messages.values()) {
            if (message.author?.bot !== true) {
                continue;
            }

            if (
                message.embeds?.[0]?.footer?.text !==
                STORAGE_MARKER
            ) {
                continue;
            }

            const guildField =
                message.embeds[0]
                    ?.fields
                    ?.find(
                        field =>
                            field.name === 'Guild ID'
                    );

            if (!guildField) {
                continue;
            }

            const storedGuildId =
                guildField.value
                    .replace(/`/g, '')
                    .trim();

            if (
                storedGuildId === String(guildId)
            ) {
                return message;
            }
        }

        const oldest =
            messages.last();

        if (!oldest) {
            break;
        }

        before = oldest.id;

        if (messages.size < 100) {
            break;
        }
    }

    return null;
}

// ─────────────────────────────────────────────
// 將設定寫入 Discord
// ─────────────────────────────────────────────

async function saveGuildConfigToDiscord(
    client,
    guildId,
    patch = {}
) {
    if (!client || !guildId) {
        return false;
    }

    const current =
        getGuildConfig(guildId);

    const merged =
        normalizeConfig({
            ...current,
            ...patch
        });

    setGuildConfig(
        guildId,
        merged
    );

    const storageChannelId =
        merged.storageChannelId;

    if (!storageChannelId) {
        console.warn(
            `[ServerConfig] Guild ${guildId} 尚未設定儲存頻道`
        );

        return false;
    }

    const channel =
        await client.channels
            .fetch(storageChannelId)
            .catch(err => {
                console.error(
                    `[ServerConfig] 無法取得儲存頻道 ${storageChannelId}:`,
                    err.message
                );

                return null;
            });

    if (!channel?.isTextBased?.()) {
        console.error(
            `[ServerConfig] ${storageChannelId} 不是文字頻道`
        );

        return false;
    }

    const embed =
        buildStorageEmbed(
            guildId,
            merged
        );

    // JSON 放在訊息文字中。
    // 目前設定項目非常少，所以遠小於 Discord 2000 字限制。
    const payload = {
        marker: STORAGE_MARKER,
        guildId: String(guildId),
        version: 1,
        updatedAt: new Date().toISOString(),
        config: merged
    };

    const content =
        '```json\n' +
        JSON.stringify(
            payload,
            null,
            2
        ) +
        '\n```';

    let existingMessage =
        await findConfigMessage(
            channel,
            guildId
        );

    if (existingMessage) {
        await existingMessage
            .edit({
                content,
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            })
            .catch(err => {
                console.error(
                    `[ServerConfig] 更新 Guild ${guildId} 設定訊息失敗:`,
                    err.message
                );
            });

        console.log(
            `[ServerConfig] ♻️ Guild ${guildId} 設定已更新`
        );

        return true;
    }

    const sent =
        await channel
            .send({
                content,
                embeds: [embed],
                allowedMentions: {
                    parse: []
                }
            })
            .catch(err => {
                console.error(
                    `[ServerConfig] 建立 Guild ${guildId} 設定訊息失敗:`,
                    err.message
                );

                return null;
            });

    if (!sent) {
        return false;
    }

    console.log(
        `[ServerConfig] 💾 Guild ${guildId} 設定已寫入 Discord 儲存頻道`
    );

    return true;
}

// ─────────────────────────────────────────────
// 從 Discord 還原一個 Guild
// ─────────────────────────────────────────────

async function restoreGuildConfig(
    client,
    guildId,
    storageChannelId = null
) {
    if (!client || !guildId) {
        return false;
    }

    const channelId =
        storageChannelId ||
        getGuildConfig(guildId)
            .storageChannelId;

    if (!channelId) {
        return false;
    }

    const channel =
        await client.channels
            .fetch(channelId)
            .catch(() => null);

    if (!channel?.isTextBased?.()) {
        return false;
    }

    const message =
        await findConfigMessage(
            channel,
            guildId
        );

    if (!message) {
        console.log(
            `[ServerConfig] Guild ${guildId} 在儲存頻道找不到設定`
        );

        return false;
    }

    const raw = String(
        message.content || ''
    );

    const match =
        raw.match(
            /```json\s*([\s\S]*?)\s*```/i
        );

    if (!match) {
        console.warn(
            `[ServerConfig] Guild ${guildId} 的設定訊息格式錯誤`
        );

        return false;
    }

    let payload;

    try {
        payload =
            JSON.parse(
                match[1]
            );
    } catch (err) {
        console.error(
            `[ServerConfig] Guild ${guildId} JSON 解析失敗:`,
            err.message
        );

        return false;
    }

    if (
        payload?.marker !==
        STORAGE_MARKER
    ) {
        return false;
    }

    if (
        String(payload?.guildId) !==
        String(guildId)
    ) {
        return false;
    }

    const restored =
        normalizeConfig(
            payload.config || {}
        );

    restored.storageChannelId =
        String(channelId);

    setGuildConfig(
        guildId,
        restored
    );

    console.log(
        `[ServerConfig] ✅ Guild ${guildId} 設定已從 Discord 還原`
    );

    return true;
}

// ─────────────────────────────────────────────
// 設定儲存頻道
// ─────────────────────────────────────────────

async function setStorageChannel(
    client,
    guild,
    channelId
) {
    if (!client || !guild || !channelId) {
        return false;
    }

    const channel =
        await client.channels
            .fetch(channelId)
            .catch(() => null);

    if (!channel?.isTextBased?.()) {
        return false;
    }

    // 更新記憶體
    const config =
        getGuildConfig(
            guild.id
        );

    config.storageChannelId =
        String(channelId);

    setGuildConfig(
        guild.id,
        config
    );

    // ─────────────────────────────────────
    // 嘗試將頻道變成「只有管理員可以看」
    //
    // Administrator 會繞過 @everyone deny。
    // Bot 自己會被明確允許。
    // ─────────────────────────────────────

    try {
        await channel.permissionOverwrites.edit(
            guild.roles.everyone,
            {
                ViewChannel: false
            }
        );

        const me =
            guild.members.me ||
            await guild.members
                .fetch(client.user.id)
                .catch(() => null);

        if (me) {
            await channel.permissionOverwrites.edit(
                me,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    EmbedLinks: true,
                    ManageMessages: true
                }
            );
        }

    } catch (err) {
        console.warn(
            `[ServerConfig] 無法自動設定儲存頻道權限:`,
            err.message
        );
    }

    // 先保存一份目前設定
    return saveGuildConfigToDiscord(
        client,
        guild.id,
        config
    );
}

// ─────────────────────────────────────────────
// 啟動時掃描所有 Guild
// ─────────────────────────────────────────────

async function restoreAllGuildConfigs(
    client
) {
    if (!client) return;

    console.log(
        '[ServerConfig] ═════════════════════════════'
    );

    console.log(
        '[ServerConfig] 🔍 開始掃描 Discord 伺服器設定'
    );

    let restored = 0;

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        // 如果 memory 沒有設定 storage，
        // 暫時無法知道 storage 在哪。
        //
        // 所以第一次使用時需要 /setstoragechannel。
        const memory =
            serverConfigs.get(
                guild.id
            );

        if (
            !memory?.storageChannelId
        ) {
            continue;
        }

        const ok =
            await restoreGuildConfig(
                client,
                guild.id,
                memory.storageChannelId
            );

        if (ok) {
            restored++;
        }
    }

    console.log(
        `[ServerConfig] ✅ 已恢復 ${restored} 個伺服器設定`
    );

    console.log(
        '[ServerConfig] ═════════════════════════════'
    );
}

// ─────────────────────────────────────────────
// 重要：從已知 storage channel 反向還原
//
// 這個版本支援把 storage channel ID 本身放在
// 環境變數 / 本機 config 中，方便第一次啟動。
//
// 完整真正「完全無本機資料」時，Discord 本身
// 無法在沒有任何入口資訊的情況下知道哪個頻道
// 是 storage，所以 /setstoragechannel 第一次
// 還是需要設定一次。
// ─────────────────────────────────────────────

module.exports = {
    STORAGE_MARKER,

    createDefaultConfig,
    normalizeConfig,

    getGuildConfig,
    setGuildConfig,

    setStorageChannel,
    saveGuildConfigToDiscord,
    restoreGuildConfig,
    restoreAllGuildConfigs
};
