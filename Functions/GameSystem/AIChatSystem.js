// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天系統:Gemini 自動回覆 + /setaichannel 設定頻道
'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-channel-config.json');
const MODEL = 'gemini-2.0-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const COOLDOWN_MS = 3000;

const setAIChannelCommand = new SlashCommandBuilder()
    .setName('setaichannel')
    .setDescription('設定或關閉 AI 自動回覆頻道')
    .addChannelOption(o => o.setName('channel').setDescription('設為 AI 回覆頻道;不填則關閉').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function readConfig() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
function writeConfig(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function getChannelId(guildId) { return readConfig()[guildId] || null; }
function setChannelId(guildId, channelId) { const c = readConfig(); if (channelId) c[guildId] = channelId; else delete c[guildId]; writeConfig(c); }

// 每個使用者最近的對話記憶(最多 16 則)
const histories = new Map();
const cooldowns = new Map();
function getHistory(userId) { if (!histories.has(userId)) histories.set(userId, []); return histories.get(userId); }
function pushHistory(userId, role, text) { const h = getHistory(userId); h.push({ role, parts: [{ text }] }); if (h.length > 16) h.splice(0, h.length - 16); }

async function askGemini(prompt, userId) {
    if (!API_KEY) return '⚠️ 尚未設定 GEMINI_API_KEY 環境變數。';
    pushHistory(userId, 'user', prompt);
    const body = { contents: getHistory(userId) };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`); }
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回覆內容）';
    pushHistory(userId, 'model', out);
    return out;
}

function init(client) {
    // 訊息自動回覆
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        if (message.channelId !== getChannelId(message.guild.id)) return;
        if (!message.content.trim()) return;
        const now = Date.now();
        if (now - (cooldowns.get(message.author.id) || 0) < COOLDOWN_MS) return;
        cooldowns.set(message.author.id, now);
        try {
            await message.channel.sendTyping().catch(() => {});
            const reply = await askGemini(message.content, message.author.id);
            await message.reply({ content: reply.slice(0, 2000), allowedMentions: { repliedUser: false } });
        } catch (err) {
            console.error('[AIChat] 回覆失敗:', err.message);
            await message.reply('⚠️ AI 回覆失敗,請稍後再試。').catch(() => {});
        }
    });

    // /setaichannel 處理
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'setaichannel') return;
        const ch = interaction.options.getChannel('channel');
        if (!ch) { setChannelId(interaction.guild.id, null); return interaction.reply({ content: '已關閉 AI 自動回覆。', ephemeral: true }); }
        setChannelId(interaction.guild.id, ch.id);
        return interaction.reply({ content: `已將 AI 回覆頻道設為 ${ch}。在該頻道發言我就會回覆。`, ephemeral: true });
    });

    console.log('[AIChat] 系統已載入');
}

module.exports = { init, askGemini, command: setAIChannelCommand };
