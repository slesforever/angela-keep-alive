// Functions/GameSystem/AuditSystem.js
// 伺服器紀錄系統：成員、語音、刪訊息、頻道/角色與管理操作
'use strict';
const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'audit-config.json');

function loadConfig() {
    try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; }
    catch { return {}; }
}
function saveConfig(config) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}
function setAuditChannel(guildId, channelId) {
    const config = loadConfig();
    config[guildId] = channelId;
    saveConfig(config);
}
function getAuditChannel(guildId) { return loadConfig()[guildId] || null; }

async function logAudit(client, guildId, title, description, options = {}) {
    if (!client || !guildId) return;
    const channelId = getAuditChannel(guildId);
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(String(description || '—').slice(0, 4000))
        .setColor(options.color || 0x5865f2)
        .setTimestamp();
    if (options.fields?.length) embed.addFields(options.fields.slice(0, 25));
    if (options.footer) embed.setFooter({ text: options.footer });
    await channel.send({ embeds: [embed] }).catch(err => console.error('[Audit] 發送失敗:', err.message));
}

async function logMessageDelete(client, message) {
    const guildId = message?.guild?.id;
    if (!guildId || message.author?.bot) return;
    const attachments = [...(message.attachments?.values?.() || [])].map(a => a.url).join('\n');
    await logAudit(client, guildId, '🗑️ 訊息已刪除',
        `作者：<@${message.author?.id || 'unknown'}>\n頻道：<#${message.channel?.id || 'unknown'}>\n內容：${message.content || '（無文字內容）'}`,
        { color: 0xed4245, fields: attachments ? [{ name: '附件', value: attachments.slice(0, 1024) }] : [] });
}

async function logVoiceChange(client, oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const member = newState.member || oldState.member;
    if (!guildId || !member || member.user?.bot) return;
    const oldName = oldState.channel?.name || '未加入語音';
    const newName = newState.channel?.name || '離開語音';
    if (oldName === newName) return;
    await logAudit(client, guildId, '🔊 語音狀態變更', `<@${member.id}>：${oldName} → ${newName}`, { color: 0x57f287 });
}

async function logMemberChange(client, member, joined) {
    if (!member?.guild?.id || member.user?.bot) return;
    await logAudit(client, member.guild.id, joined ? '📥 成員加入伺服器' : '📤 成員離開伺服器', `<@${member.id}> ${member.user?.tag || member.user?.username || ''}`, { color: joined ? 0x57f287 : 0xed4245 });
}

async function logGuildChange(client, oldValue, newValue, kind) {
    const guild = newValue || oldValue;
    if (!guild?.id) return;
    const before = oldValue?.name || oldValue?.channel?.name || oldValue?.role?.name || '—';
    const after = newValue?.name || newValue?.channel?.name || newValue?.role?.name || '—';
    await logAudit(client, guild.guild?.id || guild.id, `🛠️ ${kind}變更`, `${before} → ${after}`, { color: 0xfee75c });
}

module.exports = { setAuditChannel, getAuditChannel, logAudit, logMessageDelete, logVoiceChange, logMemberChange, logGuildChange };
