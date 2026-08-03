// Functions/GameSystem/StarboardSystem.js
// 星星榜 — 訊息累積 3 顆 ⭐ 反應即自動發到指定頻道
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'starboard-config.json');
const POSTS_PATH  = path.join(process.cwd(), 'data', 'starboard-posts.json');
const STAR_THRESHOLD = 3;

function loadJson(p, fallback) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    return fallback;
}
function saveJson(p, data) {
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.error('[Starboard] 儲存失敗:', e.message); }
}

function getStarboardConfig() { return loadJson(CONFIG_PATH, {}); }
function setStarboardChannel(guildId, channelId) {
    const c = getStarboardConfig(); c[guildId] = channelId; saveJson(CONFIG_PATH, c);
}
function getStarboardChannel(guildId) { return getStarboardConfig()[guildId] || null; }

const getPosts = () => loadJson(POSTS_PATH, {});
const setPost  = (origId, sbId) => { const m = getPosts(); m[origId] = sbId; saveJson(POSTS_PATH, m); };

async function handleStarboardReaction(client, reaction, user) {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message;
    if (msg?.partial) await msg.fetch().catch(() => null);
    if (!msg || msg.author?.bot) return;
    if (reaction.emoji?.name !== '⭐') return;

    const guildId = msg.guild?.id;
    if (!guildId) return;
    const channelId = getStarboardChannel(guildId);
    if (!channelId || msg.channel?.id === channelId) return;

    const count = reaction.count || 0;
    if (count < STAR_THRESHOLD) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL?.() })
        .setDescription(msg.content || '(此訊息無文字內容)')
        .addFields(
            { name: '來源', value: `[前往原始訊息](${msg.url})`, inline: true },
            { name: '頻道', value: msg.channel.toString(), inline: true },
            { name: '⭐ 數量', value: `${count}`, inline: true },
        )
        .setTimestamp(msg.createdAt ?? new Date());

    const existing = getPosts()[msg.id];
    if (existing) {
        const sbMsg = await channel.messages.fetch(existing).catch(() => null);
        if (sbMsg) {
            await sbMsg.edit({ content: `⭐ ${count} ｜ <#${msg.channel.id}>`, embeds: [embed] }).catch(() => {});
            return;
        }
    }
    const sent = await channel.send({ content: `⭐ ${count} ｜ <#${msg.channel.id}>`, embeds: [embed] });
    setPost(msg.id, sent.id);
}

module.exports = { setStarboardChannel, getStarboardChannel, handleStarboardReaction, STAR_THRESHOLD };
