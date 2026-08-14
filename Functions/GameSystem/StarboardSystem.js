// Functions/GameSystem/StarboardSystem.js
// 星星榜系統
// 支援 Discord 論壇頻道（Forum Channel）中的貼文 / Thread
// 支援純文字、圖片、影片與附件
// ⭐ 達到 3 顆後進入星星榜
// 第一次進榜會 Tag 原作者
// 後續增加星星只更新數量，不會再次 Tag
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// ─────────────────────────────────────────────
// 路徑
// ─────────────────────────────────────────────

const CONFIG_PATH = path.join(
    process.cwd(),
    'data',
    'starboard-config.json'
);

const POSTS_PATH = path.join(
    process.cwd(),
    'data',
    'starboard-posts.json'
);

// 需要幾顆星才上榜
const STAR_THRESHOLD = 3;

// ─────────────────────────────────────────────
// JSON 工具
// ─────────────────────────────────────────────

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(file, 'utf8');

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (err) {
        console.error(
            `[Starboard] 讀取 JSON 失敗: ${file}`,
            err.message
        );

        return fallback;
    }
}

function saveJson(file, value) {
    try {
        fs.mkdirSync(
            path.dirname(file),
            {
                recursive: true
            }
        );

        fs.writeFileSync(
            file,
            JSON.stringify(value, null, 2),
            'utf8'
        );
    } catch (err) {
        console.error(
            `[Starboard] 儲存 JSON 失敗: ${file}`,
            err.message
        );
    }
}

// ─────────────────────────────────────────────
// Starboard 設定
// ─────────────────────────────────────────────

function getStarboardConfig() {
    return loadJson(
        CONFIG_PATH,
        {}
    );
}

function setStarboardChannel(
    guildId,
    channelId
) {
    const config =
        getStarboardConfig();

    config[guildId] = channelId;

    saveJson(
        CONFIG_PATH,
        config
    );

    console.log(
        `[Starboard] ✅ Guild ${guildId} 星星榜頻道已設定為 ${channelId}`
    );
}

function getStarboardChannel(guildId) {
    const config =
        getStarboardConfig();

    return config[guildId] || null;
}

// ─────────────────────────────────────────────
// 已上榜訊息
// original message ID → starboard message ID
// ─────────────────────────────────────────────

function getPosts() {
    return loadJson(
        POSTS_PATH,
        {}
    );
}

function setPost(
    originalId,
    starboardId
) {
    const posts =
        getPosts();

    posts[originalId] = starboardId;

    saveJson(
        POSTS_PATH,
        posts
    );
}

function removePost(originalId) {
    const posts =
        getPosts();

    delete posts[originalId];

    saveJson(
        POSTS_PATH,
        posts
    );
}

// ─────────────────────────────────────────────
// 附件工具
// ─────────────────────────────────────────────

function getAttachments(message) {
    if (
        !message ||
        !message.attachments ||
        typeof message.attachments.values !== 'function'
    ) {
        return [];
    }

    return [
        ...message.attachments.values()
    ];
}

function isImage(attachment) {
    const contentType =
        String(
            attachment?.contentType || ''
        );

    const url =
        String(
            attachment?.url || ''
        );

    return (
        contentType.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url)
    );
}

function isVideo(attachment) {
    const contentType =
        String(
            attachment?.contentType || ''
        );

    const url =
        String(
            attachment?.url || ''
        );

    return (
        contentType.startsWith('video/') ||
        /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url)
    );
}

// ─────────────────────────────────────────────
// Reaction Handler
// ─────────────────────────────────────────────

async function handleStarboardReaction(
    client,
    reaction,
    user
) {
    try {
        console.log(
            '[Starboard] 📥 收到 Reaction 事件'
        );

        // ─────────────────────────────────────
        // 基本檢查
        // ─────────────────────────────────────

        if (!reaction) {
            console.log(
                '[Starboard] reaction 不存在'
            );
            return;
        }

        // ─────────────────────────────────────
        // Partial Reaction
        // ─────────────────────────────────────

        if (reaction.partial) {
            console.log(
                '[Starboard] Reaction 是 partial，正在 fetch...'
            );

            const fetchedReaction =
                await reaction
                    .fetch()
                    .catch(err => {
                        console.error(
                            '[Starboard] ❌ Reaction fetch 失敗:',
                            err.message
                        );

                        return null;
                    });

            if (!fetchedReaction) {
                return;
            }

            reaction = fetchedReaction;
        }

        // ─────────────────────────────────────
        // 只處理 ⭐
        // ─────────────────────────────────────

        const emojiName =
            reaction.emoji?.name;

        if (emojiName !== '⭐') {
            console.log(
                `[Starboard] 不是 ⭐，而是 ${emojiName || '未知 Emoji'}`
            );
            return;
        }

        console.log(
            '[Starboard] ⭐ 收到星星反應'
        );

        // ─────────────────────────────────────
        // 忽略 Bot
        // ─────────────────────────────────────

        if (user?.bot) {
            console.log(
                '[Starboard] 反應來自 Bot，跳過'
            );
            return;
        }

        // ─────────────────────────────────────
        // Message
        // ─────────────────────────────────────

        let message =
            reaction.message;

        if (!message) {
            console.log(
                '[Starboard] 找不到 reaction.message'
            );
            return;
        }

        if (message.partial) {
            console.log(
                '[Starboard] Message 是 partial，正在 fetch...'
            );

            const fetchedMessage =
                await message
                    .fetch()
                    .catch(err => {
                        console.error(
                            '[Starboard] ❌ Message fetch 失敗:',
                            err.message
                        );

                        return null;
                    });

            if (!fetchedMessage) {
                return;
            }

            message = fetchedMessage;
        }

        // ─────────────────────────────────────
        // Guild ID
        // 論壇貼文實際上是在 Thread 裡
        // ─────────────────────────────────────

        const guildId =
            message.guildId ||
            message.guild?.id;

        if (!guildId) {
            console.log(
                '[Starboard] 找不到 Guild ID'
            );
            return;
        }

        // ─────────────────────────────────────
        // Channel / Thread
        // ─────────────────────────────────────

        const messageChannelId =
            message.channelId ||
            message.channel?.id;

        if (!messageChannelId) {
            console.log(
                '[Starboard] 找不到 Message Channel ID'
            );
            return;
        }

        console.log(
            `[Starboard] Message ID: ${message.id}`
        );

        console.log(
            `[Starboard] Channel / Thread ID: ${messageChannelId}`
        );

        console.log(
            `[Starboard] Channel Type: ${message.channel?.type ?? 'unknown'}`
        );

        // ─────────────────────────────────────
        // Starboard 頻道
        // ─────────────────────────────────────

        const starboardChannelId =
            getStarboardChannel(guildId);

        if (!starboardChannelId) {
            console.log(
                `[Starboard] ⚠️ Guild ${guildId} 尚未設定星星榜頻道`
            );
            return;
        }

        // 不處理星星榜本身
        if (
            messageChannelId ===
            starboardChannelId
        ) {
            return;
        }

        // ─────────────────────────────────────
        // 星星數量
        // ─────────────────────────────────────

        const count =
            Number(
                reaction.count || 0
            );

        console.log(
            `[Starboard] ⭐ ${count}/${STAR_THRESHOLD}`
        );

        // ─────────────────────────────────────
        // 找星星榜頻道
        // ─────────────────────────────────────

        const starboardChannel =
            await client.channels
                .fetch(starboardChannelId)
                .catch(err => {
                    console.error(
                        '[Starboard] ❌ 無法取得星星榜頻道:',
                        err.message
                    );

                    return null;
                });

        if (
            !starboardChannel ||
            !starboardChannel.isTextBased?.()
        ) {
            console.error(
                '[Starboard] ❌ 星星榜頻道不是文字頻道'
            );
            return;
        }

        // ─────────────────────────────────────
        // 原訊息 → 星星榜訊息
        // ─────────────────────────────────────

        const posts =
            getPosts();

        const existingId =
            posts[message.id];

        // ─────────────────────────────────────
        // 未達 3 顆
        // ─────────────────────────────────────

        if (
            count <
            STAR_THRESHOLD
        ) {
            if (!existingId) {
                return;
            }

            console.log(
                `[Starboard] ${message.id} 已掉出門檻`
            );

            const oldPost =
                await starboardChannel.messages
                    .fetch(existingId)
                    .catch(() => null);

            if (oldPost) {
                await oldPost
                    .delete()
                    .catch(err => {
                        console.error(
                            '[Starboard] 刪除舊貼文失敗:',
                            err.message
                        );
                    });
            }

            removePost(
                message.id
            );

            console.log(
                '[Starboard] 🗑️ 已從星星榜移除'
            );

            return;
        }

        // ─────────────────────────────────────
        // 附件
        // ─────────────────────────────────────

        const attachments =
            getAttachments(message);

        const image =
            attachments.find(
                attachment =>
                    isImage(attachment)
            );

        const video =
            attachments.find(
                attachment =>
                    isVideo(attachment) &&
                    (
                        !image ||
                        attachment.id !== image.id
                    )
            );

        // 其他附件
        const otherAttachments =
            attachments
                .filter(attachment => {
                    if (
                        image &&
                        attachment.id === image.id
                    ) {
                        return false;
                    }

                    if (
                        video &&
                        attachment.id === video.id
                    ) {
                        return false;
                    }

                    return true;
                })
                .map(
                    attachment =>
                        `📎 [${attachment.name || '附件'}](${attachment.url})`
                )
                .join('\n');

        // ─────────────────────────────────────
        // 描述
        // ─────────────────────────────────────

        let description;

        if (
            message.content &&
            message.content.trim()
        ) {
            description =
                message.content.trim();
        } else if (image) {
            description =
                '🖼️ 圖片貼文';
        } else if (video) {
            description =
                '🎬 影片貼文';
        } else if (attachments.length > 0) {
            description =
                '📎 附件貼文';
        } else {
            description =
                '（無文字內容）';
        }

        // ─────────────────────────────────────
        // 作者
        // ─────────────────────────────────────

        const authorId =
            message.author?.id;

        const authorName =
            message.author?.globalName ||
            message.author?.username ||
            '未知使用者';

        const authorAvatar =
            message.author?.displayAvatarURL?.() ||
            undefined;

        // ─────────────────────────────────────
        // Embed
        // ─────────────────────────────────────

        const embed =
            new EmbedBuilder()
                .setColor(0xffd700)
                .setAuthor({
                    name: authorName,
                    ...(authorAvatar
                        ? {
                            iconURL: authorAvatar
                        }
                        : {})
                })
                .setDescription(
                    description.slice(
                        0,
                        4096
                    )
                )
                .addFields(
                    {
                        name: '來源',
                        value:
                            `[前往原始訊息](${message.url})`,
                        inline: true
                    },
                    {
                        name: '頻道',
                        value:
                            `<#${messageChannelId}>`,
                        inline: true
                    },
                    {
                        name: '⭐ 數量',
                        value:
                            String(count),
                        inline: true
                    }
                )
                .setTimestamp(
                    message.createdAt ||
                    new Date()
                );

        // ─────────────────────────────────────
        // 圖片
        // ─────────────────────────────────────

        if (image) {
            embed.setImage(
                image.url
            );
        }

        // ─────────────────────────────────────
        // 其他附件
        // ─────────────────────────────────────

        if (otherAttachments) {
            embed.addFields({
                name: '其他附件',
                value:
                    otherAttachments.slice(
                        0,
                        1024
                    )
            });
        }

        // ─────────────────────────────────────
        // 已經上榜
        // 只更新數量
        // 不 Tag
        // ─────────────────────────────────────

        if (existingId) {
            console.log(
                `[Starboard] 找到舊星星榜訊息: ${existingId}`
            );

            const starboardMessage =
                await starboardChannel.messages
                    .fetch(existingId)
                    .catch(() => null);

            if (starboardMessage) {
                await starboardMessage
                    .edit({
                        content:
                            `⭐ ${count} ｜ <#${messageChannelId}>`,
                        embeds: [
                            embed
                        ]
                    })
                    .catch(err => {
                        console.error(
                            '[Starboard] ❌ 更新星星榜訊息失敗:',
                            err.message
                        );
                    });

                console.log(
                    `[Starboard] ✅ 星星榜已更新為 ${count} 顆`
                );

                return;
            }

            // 資料庫有記錄
            // 但是 Discord 訊息已經不存在
            console.log(
                '[Starboard] 舊星星榜訊息不存在，重新建立'
            );

            removePost(
                message.id
            );
        }

        // ─────────────────────────────────────
        // 第一次達到門檻
        // Tag 一次
        // ─────────────────────────────────────

        let sendContent =
            `⭐ ${count} ｜ <#${messageChannelId}>`;

        if (authorId) {
            sendContent +=
                ` ｜ <@${authorId}>`;
        }

        console.log(
            '[Starboard] 🌟 第一次達到門檻，正在建立星星榜訊息'
        );

        const sent =
            await starboardChannel
                .send({
                    content:
                        sendContent,

                    embeds: [
                        embed
                    ],

                    allowedMentions:
                        authorId
                            ? {
                                users: [
                                    authorId
                                ]
                            }
                            : {
                                users: []
                            }
                })
                .catch(err => {
                    console.error(
                        '[Starboard] ❌ 發送星星榜訊息失敗:',
                        err.message
                    );

                    return null;
                });

        if (!sent) {
            return;
        }

        // 儲存原訊息與星星榜訊息的對應
        setPost(
            message.id,
            sent.id
        );

        console.log(
            `[Starboard] ✅ 已成功上榜: ${message.id} → ${sent.id}`
        );

    } catch (err) {
        console.error(
            '[Starboard] ❌ handleStarboardReaction 發生錯誤:',
            err
        );
    }
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

module.exports = {
    setStarboardChannel,
    getStarboardChannel,
    handleStarboardReaction,
    STAR_THRESHOLD
};
