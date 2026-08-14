// Functions/GameSystem/StarboardSystem.js
// 星星榜系統
// 支援：
// 1. 一般文字頻道訊息
// 2. Discord 論壇頻道 Forum Post
// 3. Active Forum Threads
// 4. Archived Forum Threads
// 5. 圖片 / 影片 / 其他附件
//
// ⭐ 3 顆：第一次進榜並 Tag 作者
// ⭐ 4/5/6...：只更新數量，不再次 Tag
// ⭐ 掉到 2 顆以下：移除星星榜
//
// 舊論壇貼文會在 startup 後自動掃描
'use strict';

const fs = require('fs');
const path = require('path');

const {
    EmbedBuilder,
    ChannelType
} = require('discord.js');

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

const STAR_THRESHOLD = 3;

// ─────────────────────────────────────────────
// JSON
// ─────────────────────────────────────────────

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(
            file,
            'utf8'
        );

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
            JSON.stringify(
                value,
                null,
                2
            ),
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
        `[Starboard] ✅ Guild ${guildId} 星星榜頻道：${channelId}`
    );
}

function getStarboardChannel(guildId) {
    const config =
        getStarboardConfig();

    return config[guildId] || null;
}

// ─────────────────────────────────────────────
// 已上榜訊息
// original message ID
//        ↓
// starboard message ID
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

    posts[originalId] =
        starboardId;

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
// Attachments
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
// 找 ⭐ Reaction
// ─────────────────────────────────────────────

function getStarReaction(message) {
    if (
        !message?.reactions?.cache
    ) {
        return null;
    }

    return (
        message.reactions.cache.get('⭐') ||
        message.reactions.cache.find(
            reaction =>
                reaction.emoji?.name === '⭐'
        ) ||
        null
    );
}

// ─────────────────────────────────────────────
// 強制取得目前最新 ⭐ 數量
//
// 這裡是這次修正的核心。
// 舊論壇貼文可能不在 cache 裡，
// 所以不能只相信原本 reaction.count。
// ─────────────────────────────────────────────

async function fetchLatestStarCount(
    message,
    fallbackReaction = null
) {
    try {
        let refreshedMessage =
            message;

        // 重新抓 Message
        if (
            typeof refreshedMessage.fetch ===
            'function'
        ) {
            const fetched =
                await refreshedMessage
                    .fetch(true)
                    .catch(() => null);

            if (fetched) {
                refreshedMessage =
                    fetched;
            }
        }

        // 重新抓 Channel / Thread
        try {
            if (
                refreshedMessage.channel &&
                typeof refreshedMessage.channel.fetch ===
                    'function'
            ) {
                const fetchedChannel =
                    await refreshedMessage.channel
                        .fetch()
                        .catch(() => null);

                if (
                    fetchedChannel &&
                    typeof fetchedChannel.messages?.fetch ===
                        'function'
                ) {
                    const fetchedMessage =
                        await fetchedChannel.messages
                            .fetch(
                                refreshedMessage.id
                            )
                            .catch(() => null);

                    if (fetchedMessage) {
                        refreshedMessage =
                            fetchedMessage;
                    }
                }
            }
        } catch (err) {
            console.warn(
                '[Starboard] 重新抓取 Thread/Channel 失敗:',
                err.message
            );
        }

        let starReaction =
            getStarReaction(
                refreshedMessage
            );

        // 如果 cache 還是沒有，直接從 reactions fetch
        if (
            !starReaction &&
            refreshedMessage.reactions
        ) {
            try {
                await refreshedMessage.reactions
                    .fetch();

                starReaction =
                    getStarReaction(
                        refreshedMessage
                    );
            } catch (err) {
                console.warn(
                    '[Starboard] Reaction Manager fetch 失敗:',
                    err.message
                );
            }
        }

        const count = Number(
            starReaction?.count ??
            fallbackReaction?.count ??
            0
        );

        return {
            message: refreshedMessage,
            count
        };

    } catch (err) {
        console.error(
            '[Starboard] fetchLatestStarCount 失敗:',
            err.message
        );

        return {
            message,
            count: Number(
                fallbackReaction?.count || 0
            )
        };
    }
}

// ─────────────────────────────────────────────
// 建立 Starboard Embed
// ─────────────────────────────────────────────

function createStarboardEmbed(
    message,
    count
) {
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
    // 文字內容
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

    } else if (
        attachments.length > 0
    ) {
        description =
            '📎 附件貼文';

    } else {
        description =
            '（無文字內容）';
    }

    // ─────────────────────────────────────
    // 作者
    // ─────────────────────────────────────

    const authorName =
        message.author?.globalName ||
        message.author?.username ||
        '未知使用者';

    const avatarURL =
        message.author?.displayAvatarURL?.();

    const embed =
        new EmbedBuilder()
            .setColor(0xffd700)
            .setAuthor({
                name: authorName,
                ...(avatarURL
                    ? {
                        iconURL:
                            avatarURL
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

    // 圖片
    if (image) {
        embed.setImage(
            image.url
        );
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

    return embed;
}

// ─────────────────────────────────────────────
// 處理一篇訊息
//
// allowMention = true
// → 第一次上榜 Tag 作者
//
// allowMention = false
// → 不 Tag
// ─────────────────────────────────────────────

async function processStarboardMessage(
    client,
    message,
    allowMention = true
) {
    try {
        if (!message) {
            return;
        }

        // ─────────────────────────────────────
        // Partial Message
        // ─────────────────────────────────────

        if (message.partial) {
            message =
                await message
                    .fetch()
                    .catch(err => {
                        console.error(
                            '[Starboard] Message fetch 失敗:',
                            err.message
                        );

                        return null;
                    });

            if (!message) {
                return;
            }
        }

        // ─────────────────────────────────────
        // Bot 訊息忽略
        // ─────────────────────────────────────

        if (
            message.author?.bot
        ) {
            return;
        }

        // ─────────────────────────────────────
        // Guild
        // ─────────────────────────────────────

        const guildId =
            message.guildId ||
            message.guild?.id;

        if (!guildId) {
            return;
        }

        // ─────────────────────────────────────
        // Channel / Thread
        // ─────────────────────────────────────

        const messageChannelId =
            message.channelId ||
            message.channel?.id;

        if (!messageChannelId) {
            return;
        }

        // ─────────────────────────────────────
        // Starboard 頻道
        // ─────────────────────────────────────

        const starboardChannelId =
            getStarboardChannel(
                guildId
            );

        if (!starboardChannelId) {
            console.log(
                `[Starboard] Guild ${guildId} 尚未設定星星榜頻道`
            );

            return;
        }

        // 星星榜自身不要處理
        if (
            messageChannelId ===
            starboardChannelId
        ) {
            return;
        }

        // ─────────────────────────────────────
        // 取得最新 ⭐ 數量
        // ─────────────────────────────────────

        const latest =
            await fetchLatestStarCount(
                message
            );

        message =
            latest.message;

        const count =
            latest.count;

        console.log(
            `[Starboard] ${message.id} ⭐ ${count}/${STAR_THRESHOLD}`
        );

        // ─────────────────────────────────────
        // 星星榜頻道
        // ─────────────────────────────────────

        const starboardChannel =
            await client.channels
                .fetch(
                    starboardChannelId
                )
                .catch(err => {
                    console.error(
                        '[Starboard] 取得星星榜頻道失敗:',
                        err.message
                    );

                    return null;
                });

        if (
            !starboardChannel ||
            !starboardChannel.isTextBased?.()
        ) {
            console.error(
                '[Starboard] 星星榜頻道不是文字頻道'
            );

            return;
        }

        // ─────────────────────────────────────
        // 已存在的上榜資料
        // ─────────────────────────────────────

        const posts =
            getPosts();

        const existingId =
            posts[message.id];

        // ─────────────────────────────────────
        // 低於門檻
        // ─────────────────────────────────────

        if (
            count <
            STAR_THRESHOLD
        ) {
            if (!existingId) {
                return;
            }

            console.log(
                `[Starboard] ${message.id} 已低於 ${STAR_THRESHOLD} 顆`
            );

            const oldPost =
                await starboardChannel.messages
                    .fetch(
                        existingId
                    )
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
                `[Starboard] 🗑️ ${message.id} 已從星星榜移除`
            );

            return;
        }

        // ─────────────────────────────────────
        // 建立 Embed
        // ─────────────────────────────────────

        const embed =
            createStarboardEmbed(
                message,
                count
            );

        // ─────────────────────────────────────
        // 已經上榜
        //
        // 只更新，不 Tag
        // ─────────────────────────────────────

        if (existingId) {
            const existingMessage =
                await starboardChannel.messages
                    .fetch(
                        existingId
                    )
                    .catch(() => null);

            if (existingMessage) {
                await existingMessage
                    .edit({
                        content:
                            `⭐ ${count} ｜ <#${messageChannelId}>`,
                        embeds: [
                            embed
                        ],
                        allowedMentions: {
                            parse: []
                        }
                    })
                    .catch(err => {
                        console.error(
                            '[Starboard] 更新星星榜失敗:',
                            err.message
                        );
                    });

                console.log(
                    `[Starboard] ✅ 已更新 ${message.id} → ${count} 顆`
                );

                return;
            }

            // 記錄存在，但 Discord 訊息不存在
            removePost(
                message.id
            );
        }

        // ─────────────────────────────────────
        // 第一次進榜
        // ─────────────────────────────────────

        let content =
            `⭐ ${count} ｜ <#${messageChannelId}>`;

        const authorId =
            message.author?.id;

        // 第一次進榜 Tag 作者
        if (
            allowMention &&
            authorId
        ) {
            content +=
                ` ｜ <@${authorId}>`;
        }

        const sendData = {
            content,
            embeds: [
                embed
            ],
            allowedMentions:
                allowMention &&
                authorId
                    ? {
                        users: [
                            authorId
                        ]
                    }
                    : {
                        users: []
                    }
        };

        const sent =
            await starboardChannel
                .send(
                    sendData
                )
                .catch(err => {
                    console.error(
                        '[Starboard] 發送星星榜失敗:',
                        err.message
                    );

                    return null;
                });

        if (!sent) {
            return;
        }

        setPost(
            message.id,
            sent.id
        );

        console.log(
            `[Starboard] 🌟 ${message.id} 成功進入星星榜`
        );

    } catch (err) {
        console.error(
            '[Starboard] processStarboardMessage 發生錯誤:',
            err
        );
    }
}

// ─────────────────────────────────────────────
// 新增 / 移除 ⭐
//
// messageReactionAdd
// messageReactionRemove
// ─────────────────────────────────────────────

async function handleStarboardReaction(
    client,
    reaction,
    user
) {
    try {
        if (!reaction) {
            return;
        }

        // ─────────────────────────────────────
        // 先確認 Emoji
        // partial Reaction 有可能需要 fetch
        // ─────────────────────────────────────

        if (reaction.partial) {
            const fetchedReaction =
                await reaction
                    .fetch()
                    .catch(err => {
                        console.error(
                            '[Starboard] Reaction fetch 失敗:',
                            err.message
                        );

                        return null;
                    });

            if (!fetchedReaction) {
                return;
            }

            reaction =
                fetchedReaction;
        }

        // 只處理 ⭐
        if (
            reaction.emoji?.name !== '⭐'
        ) {
            return;
        }

        // Bot 不處理
        if (user?.bot) {
            return;
        }

        console.log(
            `[Starboard] ⭐ Reaction 事件：${reaction.message?.id || 'unknown'}`
        );

        // ─────────────────────────────────────
        // Message
        // ─────────────────────────────────────

        let message =
            reaction.message;

        if (!message) {
            console.error(
                '[Starboard] reaction.message 不存在'
            );

            return;
        }

        if (message.partial) {
            const fetchedMessage =
                await message
                    .fetch()
                    .catch(err => {
                        console.error(
                            '[Starboard] Message fetch 失敗:',
                            err.message
                        );

                        return null;
                    });

            if (!fetchedMessage) {
                return;
            }

            message =
                fetchedMessage;
        }

        // ─────────────────────────────────────
        // 論壇 Thread 特別處理
        //
        // 舊 Forum Post 可能不在正常 cache，
        // 所以這裡再次抓 Thread 與原始 Message。
        // ─────────────────────────────────────

        try {
            if (
                message.channel &&
                typeof message.channel.fetch ===
                    'function'
            ) {
                const fetchedChannel =
                    await message.channel
                        .fetch()
                        .catch(() => null);

                if (
                    fetchedChannel &&
                    typeof fetchedChannel.messages?.fetch ===
                        'function'
                ) {
                    const refreshedMessage =
                        await fetchedChannel.messages
                            .fetch(
                                message.id
                            )
                            .catch(() => null);

                    if (refreshedMessage) {
                        message =
                            refreshedMessage;
                    }
                }
            }
        } catch (err) {
            console.warn(
                '[Starboard] Forum Thread 重新抓取失敗:',
                err.message
            );
        }

        // ─────────────────────────────────────
        // 最終處理
        // ─────────────────────────────────────

        await processStarboardMessage(
            client,
            message,
            true
        );

    } catch (err) {
        console.error(
            '[Starboard] handleStarboardReaction 發生錯誤:',
            err
        );
    }
}

// ─────────────────────────────────────────────
// 取得 Forum Threads
//
// Active + Archived
// ─────────────────────────────────────────────

async function fetchAllForumThreads(
    forumChannel
) {
    const threads =
        new Map();

    // ─────────────────────────────────────
    // Active
    // ─────────────────────────────────────

    try {
        const active =
            await forumChannel.threads
                .fetchActive();

        for (
            const [
                id,
                thread
            ] of active.threads
        ) {
            threads.set(
                id,
                thread
            );
        }

        console.log(
            `[Starboard] ${forumChannel.name} Active Threads: ${active.threads.size}`
        );

    } catch (err) {
        console.error(
            `[Starboard] 抓取 ${forumChannel.name} Active Threads 失敗:`,
            err.message
        );
    }

    // ─────────────────────────────────────
    // Archived
    // ─────────────────────────────────────

    let before = null;

    while (true) {
        try {
            const options = {
                type: 'public',
                limit: 100
            };

            if (before) {
                options.before =
                    before;
            }

            const archived =
                await forumChannel.threads
                    .fetchArchived(
                        options
                    );

            if (
                !archived ||
                !archived.threads ||
                archived.threads.size === 0
            ) {
                break;
            }

            for (
                const [
                    id,
                    thread
                ] of archived.threads
            ) {
                threads.set(
                    id,
                    thread
                );
            }

            console.log(
                `[Starboard] ${forumChannel.name} Archived Batch: ${archived.threads.size}`
            );

            const threadArray = [
                ...archived.threads.values()
            ];

            threadArray.sort(
                (a, b) =>
                    BigInt(a.id) >
                    BigInt(b.id)
                        ? 1
                        : -1
            );

            const oldest =
                threadArray[0];

            if (!oldest) {
                break;
            }

            if (
                archived.threads.size <
                100
            ) {
                break;
            }

            if (
                before ===
                oldest.id
            ) {
                break;
            }

            before =
                oldest.id;

        } catch (err) {
            console.error(
                `[Starboard] ${forumChannel.name} Archived Threads 取得失敗:`,
                err.message
            );

            break;
        }
    }

    return [
        ...threads.values()
    ];
}

// ─────────────────────────────────────────────
// 掃描單一論壇頻道
// ─────────────────────────────────────────────

async function scanForumChannel(
    client,
    forumChannel
) {
    if (
        !forumChannel ||
        forumChannel.type !==
            ChannelType.GuildForum
    ) {
        return {
            scanned: 0,
            added: 0
        };
    }

    console.log(
        `[Starboard] 🔍 開始掃描論壇：${forumChannel.name}`
    );

    const threads =
        await fetchAllForumThreads(
            forumChannel
        );

    let scanned = 0;
    let added = 0;

    for (
        const thread
        of threads
    ) {
        try {
            const starterMessage =
                await thread
                    .fetchStarterMessage()
                    .catch(err => {
                        console.error(
                            `[Starboard] 無法取得論壇貼文 ${thread.id}:`,
                            err.message
                        );

                        return null;
                    });

            if (!starterMessage) {
                continue;
            }

            scanned++;

            const beforePosts =
                getPosts();

            const alreadyPosted =
                Boolean(
                    beforePosts[
                        starterMessage.id
                    ]
                );

            // 舊論壇貼文掃描
            // 已經有 3 顆以上會補進星星榜
            await processStarboardMessage(
                client,
                starterMessage,
                true
            );

            const afterPosts =
                getPosts();

            if (
                !alreadyPosted &&
                afterPosts[
                    starterMessage.id
                ]
            ) {
                added++;
            }

        } catch (err) {
            console.error(
                `[Starboard] 掃描論壇 Thread ${thread.id} 失敗:`,
                err.message
            );
        }
    }

    console.log(
        `[Starboard] ✅ 論壇 ${forumChannel.name} 掃描完成：${scanned} 篇，新增上榜 ${added} 篇`
    );

    return {
        scanned,
        added
    };
}

// ─────────────────────────────────────────────
// 掃描 Guild 的論壇
// ─────────────────────────────────────────────

async function scanGuildForums(
    client,
    guild
) {
    if (!guild) {
        return;
    }

    console.log(
        `[Starboard] 🔍 開始掃描 Guild：${guild.name}`
    );

    let channels;

    try {
        channels =
            await guild.channels.fetch();

    } catch (err) {
        console.error(
            `[Starboard] 無法取得 Guild ${guild.id} 頻道:`,
            err.message
        );

        return;
    }

    const forumChannels =
        [
            ...channels.values()
        ].filter(
            channel =>
                channel &&
                channel.type ===
                    ChannelType.GuildForum
        );

    if (
        forumChannels.length === 0
    ) {
        console.log(
            `[Starboard] ${guild.name} 沒有論壇頻道`
        );

        return;
    }

    let totalScanned = 0;
    let totalAdded = 0;

    for (
        const forumChannel
        of forumChannels
    ) {
        const result =
            await scanForumChannel(
                client,
                forumChannel
            );

        if (!result) {
            continue;
        }

        totalScanned +=
            result.scanned;

        totalAdded +=
            result.added;
    }

    console.log(
        `[Starboard] 🌟 Guild ${guild.name} 舊論壇掃描完成：${totalScanned} 篇，${totalAdded} 篇新上榜`
    );
}

// ─────────────────────────────────────────────
// 掃描所有 Guild
// ─────────────────────────────────────────────

async function scanAllGuildForums(
    client
) {
    console.log(
        '[Starboard] ═════════════════════════════'
    );

    console.log(
        '[Starboard] 🔍 開始掃描所有舊論壇貼文'
    );

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        await scanGuildForums(
            client,
            guild
        );
    }

    console.log(
        '[Starboard] ✅ 所有舊論壇貼文掃描完成'
    );

    console.log(
        '[Starboard] ═════════════════════════════'
    );
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

module.exports = {
    setStarboardChannel,
    getStarboardChannel,
    handleStarboardReaction,

    scanForumChannel,
    scanGuildForums,
    scanAllGuildForums,

    STAR_THRESHOLD
};
