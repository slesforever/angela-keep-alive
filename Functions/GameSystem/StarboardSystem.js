// Functions/GameSystem/StarboardSystem.js
// 星星榜：訊息累積 3 顆 ⭐ 後轉發，支援純文字、圖片、影片與附件
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'starboard-config.json');
const POSTS_PATH  = path.join(process.cwd(), 'data', 'starboard-posts.json');
const STAR_THRESHOLD = 3;

function loadJson(file, fallback) {
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
    catch { return fallback; }
}
function saveJson(file, value) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
    catch (err) { console.error('[Starboard] 儲存失敗:', err.message); }
}
function getStarboardConfig() { return loadJson(CONFIG_PATH, {}); }
function setStarboardChannel(guildId, channelId) { const c = getStarboardConfig(); c[guildId] = channelId; saveJson(CONFIG_PATH, c); }
function getStarboardChannel(guildId) { return getStarboardConfig()[guildId] || null; }
function getPosts() { return loadJson(POSTS_PATH, {}); }
function setPost(originalId, starboardId) { const posts = getPosts(); posts[originalId] = starboardId; saveJson(POSTS_PATH, posts); }

function getAttachments(message) {
    return [...(message.attachments?.values?.() || [])];
}
function isImage(attachment) {
    return String(attachment?.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(attachment?.url || '');
}

async function handleStarboardReaction(client, reaction) {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const message = reaction.message;
    if (message?.partial) await message.fetch().catch(() => null);
    if (!message || message.author?.bot || reaction.emoji?.name !== '⭐') return;

    const guildId = message.guild?.id;
    if (!guildId) return;
    const channelId = getStarboardChannel(guildId);
    if (!channelId || message.channel?.id === channelId) return;

    const count = reaction.count || 0;
    const posts = getPosts();
    const existingId = posts[message.id];
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    // 少於門檻時，若星星榜已有貼文就刪掉，避免移除星星後仍留在榜上。
    if (count < STAR_THRESHOLD) {
        if (existingId) {
            const oldPost = await channel.messages.fetch(existingId).catch(() => null);
            if (oldPost) await oldPost.delete().catch(() => {});
            delete posts[message.id];
            saveJson(POSTS_PATH, posts);
        }
        return;
    }

    const attachments = getAttachments(message);
    const image = attachments.find(isImage);
    const otherAttachments = attachments.filter(a => a !== image).map(a => `[${a.name || '附件'}](${a.url})`).join('\n');
    const description = message.content?.trim() || (image ? '🖼️ 圖片貼文' : attachments.length ? '📎 附件貼文' : '（無文字內容）');

    const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL?.() })
        .setDescription(description.slice(0, 4096))
        .addFields(
            { name: '來源', value: `[前往原始訊息](${message.url})`, inline: true },
            { name: '頻道', value: `<#${message.channel.id}>`, inline: true },
            { name: '⭐ 數量', value: `${count}`, inline: true },
        )
        .setTimestamp(message.createdAt || new Date());
    if (image) embed.setImage(image.url);
    if (otherAttachments) embed.addFields({ name: '其他附件', value: otherAttachments.slice(0, 1024) });

    if (existingId) {
        const starboardMessage = await channel.messages.fetch(existingId).catch(() => null);
        if (starboardMessage) {
            await starboardMessage.edit({ content: `⭐ ${count} ｜ <#${message.channel.id}>`, embeds: [embed] }).catch(() => {});
            return;
        }
    }
    const sent = await channel.send({ content: `⭐ ${count} ｜ <#${message.channel.id}>`, embeds: [embed] }).catch(() => null);
    if (sent) setPost(message.id, sent.id);
}

module.exports = { setStarboardChannel, getStarboardChannel, handleStarboardReaction, STAR_THRESHOLD };
