// Functions/GameSystem/StarboardSystem.js
// 星星榜：訊息累積 3 顆 ⭐ 後轉發
// 支援純文字、圖片、影片與附件
// 第一次達到門檻時 Tag 原訊息作者一次
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

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

const STAR_THRESHOLD = 3;

// ─────────────────────────────────────────────
// JSON 工具
// ─────────────────────────────────────────────

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(
            `[Starboard] 讀取 JSON 失敗 ${file}:`,
            err.message
        );

        return fallback;
    }
}

function saveJson(file, value) {
    try {
        fs.mkdirSync(
            path.dirname(file),
            { recursive: true }
        );

        fs.writeFileSync(
            file,
            JSON.stringify(value, null, 2),
            'utf8'
        );
    } catch (err) {
        console.error(
            `[Starboard] 儲存失敗 ${file}:`,
            err.message
        );
    }
}

// ─────────────────────────────────────────────
// 設定
// ─────────────────────────────────────────────

function getStarboardConfig() {
    return loadJson(CONFIG_PATH, {});
}

function setStarboardChannel(guildId, channelId) {
    const config = getStarboardConfig();

    config[guildId] = channelId;

    saveJson(CONFIG_PATH, config);

    console.log(
        `[Starboard] Guild ${guildId} 星星榜頻道設定為 ${channelId}`
    );
}

function getStarboardChannel(guildId) {
    const config = getStarboardConfig();

    return config[guildId] || null;
}

// ─────────────────────────────────────────────
// 上榜訊息資料
// ─────────────────────────────────────────────

function getPosts() {
    return loadJson(POSTS_PATH, {});
}

function setPost(originalId, starboardId) {
    const posts = getPosts();

    posts[originalId] = starboardId;

    saveJson(POSTS_PATH, posts);
}

function removePost(originalId) {
    const posts = getPosts();

    delete posts[originalId];

    saveJson(POSTS_PATH, posts);
}

// ─────────────────────────────────────────────
// 附件
// ─────────────────────────────────────────────

function getAttachments(message) {
    if (!message?.attachments?.values) {
        return [];
    }

    return [...message.attachments.values()];
}

function isImage(attachment) {
    const contentType = String(
        attachment?.contentType || ''
    );

    const url = String(
        attachment?.url || ''
    );

    return (
        contentType.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url)
    );
}

function isVideo(attachment) {
    const contentType = String(
        attachment?.contentType || ''
    );

    const url = String(
        attachment?.url || ''
    );

    return (
        contentType.startsWith('video/') ||
        /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url)
    );
}

// ─────────────────────────────────────────────
// Starboard Reaction Handler
// ─────────────────────────────────────────────

async function handleStarboardReaction(
    client,
    reaction,
    user
) {
    try {
        // Reaction 是 partial 時抓完整資料
        if (reaction?.partial) {
            await reaction.fetch().catch(() => null);
        }

        if (!reaction) {
            return;
        }

        // 只處理 ⭐
        if (reaction.emoji?.name !== '⭐') {
            return;
        }

        // Message 是 partial 時抓完整資料
        let message = reaction.message;

        if (message?.partial) {
            message = await message.fetch().catch(() => null);
        }

        if (!message) {
            return;
        }

        // Bot 的反應不處理
        if (user?.bot) {
            return;
        }

        const guildId =
            message.guildId ||
            message.guild?.id;

        if (!guildId) {
            return;
        }

        // 取得星星榜頻道
        const starboardChannelId =
            getStarboardChannel(guildId);

        if (!starboardChannelId) {
            console.log(
                `[Starboard] Guild ${guildId} 尚未設定星星榜頻道`
            );
            return;
        }

        // 如果本身就是星星榜頻道，不處理
        if (
            message.channelId ===
            starboardChannelId
        ) {
            return;
        }

        const count = Number(
            reaction.count || 0
        );

        console.log(
            `[Starboard] ${message.id} ⭐ ${count}/${STAR_THRESHOLD}`
        );

        const posts = getPosts();

        const existingId =
            posts[message.id];

        // 取得星星榜頻道
        const channel =
            await client.channels
                .fetch(starboardChannelId)
                .catch(err => {
                    console.error(
                        '[Starboard] 取得星星榜頻道失敗:',
                        err.message
                    );

                    return null;
                });

        if (!channel?.isTextBased?.()) {
            console.error(
                '[Starboard] 星星榜頻道不是文字頻道:',
                starboardChannelId
            );

            return;
        }

        // ─────────────────────────────────────
        // 尚未達到 3 顆
        // ─────────────────────────────────────

        if (count < STAR_THRESHOLD) {
            // 沒有上榜過，什麼都不用做
            if (!existingId) {
                return;
            }

            // 已經上榜但現在掉到 2 顆以下 → 刪除
            const oldPost =
                await channel.messages
                    .fetch(existingId)
                    .catch(() => null);

            if (oldPost) {
                await oldPost
                    .delete()
                    .catch(() => {});
            }

            removePost(message.id);

            console.log(
                `[Starboard] ${message.id} 星星下降到 ${count}，已從星星榜移除`
            );

            return;
        }

        // ─────────────────────────────────────
        // 建立附件資料
        // ─────────────────────────────────────

        const attachments =
            getAttachments(message);

        const image =
            attachments.find(isImage);

        const video =
            attachments.find(
                attachment =>
                    !image ||
                    attachment.id !== image.id
            );

        const otherAttachments =
            attachments
                .filter(attachment => {
                    if (image && attachment.id === image.id) {
                        return false;
                    }

                    if (video && attachment.id === video.id) {
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
        // 內容
        // ─────────────────────────────────────

        let description = '';

        if (message.content?.trim()) {
            description =
                message.content.trim();
        } else if (image) {
            description = '🖼️ 圖片貼文';
        } else if (video) {
            description = '🎬 影片貼文';
        } else if (attachments.length) {
            description = '📎 附件貼文';
        } else {
            description = '（無文字內容）';
        }

        // ─────────────────────────────────────
        // 作者資料
        // ─────────────────────────────────────

        const authorName =
            message.author?.globalName ||
            message.author?.username ||
            '未知使用者';

        const avatarURL =
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
                    iconURL: avatarURL
                })
                .setDescription(
                    description.slice(0, 4096)
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
                            `<#${message.channelId}>`,
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

        // 第一張圖片
        if (image) {
            embed.setImage(image.url);
        }

        // 其他附件
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
        // 不再 Tag
        // ─────────────────────────────────────

        if (existingId) {
            const starboardMessage =
                await channel.messages
                    .fetch(existingId)
                    .catch(() => null);

            if (starboardMessage) {
                await starboardMessage
                    .edit({
                        content:
                            `⭐ ${count} ｜ <#${message.channelId}>`,
                        embeds: [embed]
                    })
                    .catch(err => {
                        console.error(
                            '[Starboard] 更新貼文失敗:',
                            err.message
                        );
                    });

                return;
            }

            // 記錄還在，但 Discord 訊息已不存在
            removePost(message.id);
        }

        // ─────────────────────────────────────
        // 第一次達到 3 顆
        // Tag 原作者一次
        // ─────────────────────────────────────

        const sent =
            await channel.send({
                content:
                    `⭐ ${count} ｜ <#${message.channelId}> ｜ <@${message.author.id}>`,

                embeds: [embed],

                allowedMentions: {
                    users: [
                        message.author.id
                    ]
                }
            })
            .catch(err => {
                console.error(
                    '[Starboard] 發送星星榜貼文失敗:',
                    err.message
                );

                return null;
            });

        if (!sent) {
            return;
        }

        // 儲存原訊息 → 星星榜訊息
        setPost(
            message.id,
            sent.id
        );

        console.log(
            `[Starboard] ${message.id} 已進入星星榜 → ${sent.id}`
        );

    } catch (err) {
        console.error(
            '[Starboard] 處理 Reaction 時發生錯誤:',
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
