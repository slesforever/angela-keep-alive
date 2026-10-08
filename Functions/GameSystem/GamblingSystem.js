// Functions/GameSystem/GamblingSystem.js
// Starcoins 經濟：/sc pay、/sc work、/sc bank、/gamble
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const MIN_BET = 10;
const MAX_BET = 50_000;
const GAMBLE_COOLDOWN = 5_000;
const WORK_COOLDOWN = 60 * 60 * 1000;
const DAILY_BANK_RATE = 0.0001; // 0.01% / day，刻意保持很低
const cooldowns = new Map();

function number(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function applyBankInterest(player) {
    const now = Date.now();
    const last = Number(player.bankLastInterestAt) || now;
    const days = Math.floor((now - last) / 86_400_000);
    if (days <= 0) { player.bankLastInterestAt ||= now; return 0; }
    const balance = number(player.bankStarCoins);
    const interest = Math.floor(balance * (Math.pow(1 + DAILY_BANK_RATE, days) - 1));
    player.bankStarCoins = balance + interest;
    player.bankLastInterestAt = last + days * 86_400_000;
    return interest;
}
function saveEconomy(userId, username, player) { player.username = username || player.username || 'Player'; savePlayerData(null, userId, player); }
function moneyEmbed(title, description, color, interaction) {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setTimestamp()] });
}

async function handleGamble(client, interaction) {
    const userId = interaction.user.id;
    const amount = number(interaction.options.getInteger('amount'));
    const now = Date.now();
    const last = cooldowns.get(`gamble:${userId}`) || 0;
    if (now - last < GAMBLE_COOLDOWN) return interaction.reply({ content: `⏳ 請稍後 ${Math.ceil((GAMBLE_COOLDOWN - now + last) / 1000)} 秒再試。`, ephemeral: true });
    if (amount < MIN_BET || amount > MAX_BET) return interaction.reply({ content: `❌ 下注範圍是 ${MIN_BET.toLocaleString()}–${MAX_BET.toLocaleString()} Starcoins。`, ephemeral: true });
    const player = getOrCreatePlayer(null, userId, interaction.user.username);
    const current = number(player.starCoins);
    if (current < amount) return interaction.reply({ content: `❌ Starcoins 不足。持有：🌟 ${current.toLocaleString()}，需要：🌟 ${amount.toLocaleString()}`, ephemeral: true });
    cooldowns.set(`gamble:${userId}`, now);
    const win = Math.random() < 0.5;
    player.starCoins = win ? current + amount : current - amount;
    saveEconomy(userId, interaction.user.username, player);
    return moneyEmbed(win ? '🎰 賭博結果 — 勝利！' : '🎰 賭博結果 — 失敗',
        `${win ? '🎉 50/50 命中！' : '💥 下注全損。'}\n\n**下注：** 🌟 ${amount.toLocaleString()}\n**變化：** 🌟 ${win ? '+' : '-'}${amount.toLocaleString()}\n**現持有：** 🌟 ${player.starCoins.toLocaleString()}`,
        win ? 0x2ed573 : 0xff4757, interaction);
}

async function handleScPay(interaction) {
    const target = interaction.options.getUser('target');
    const amount = number(interaction.options.getInteger('amount'));
    if (!target || target.bot || target.id === interaction.user.id || amount <= 0) return interaction.reply({ content: '❌ 請選擇其他玩家，並輸入大於 0 的 Starcoins。', ephemeral: true });
    const sender = getOrCreatePlayer(null, interaction.user.id, interaction.user.username);
    if (number(sender.starCoins) < amount) return interaction.reply({ content: '❌ 你的 Starcoins 不足。', ephemeral: true });
    const receiver = getOrCreatePlayer(null, target.id, target.username);
    sender.starCoins = number(sender.starCoins) - amount;
    receiver.starCoins = number(receiver.starCoins) + amount;
    saveEconomy(interaction.user.id, interaction.user.username, sender);
    saveEconomy(target.id, target.username, receiver);
    return interaction.reply({ content: `💸 <@${interaction.user.id}> 支付了 🌟 **${amount.toLocaleString()} Starcoins** 給 <@${target.id}>。` });
}

async function handleScWork(interaction) {
    const key = `work:${interaction.user.id}`;
    const now = Date.now();
    const last = cooldowns.get(key) || 0;
    if (now - last < WORK_COOLDOWN) return interaction.reply({ content: `⏳ 你已經工作過了，${Math.ceil((WORK_COOLDOWN - now + last) / 60_000)} 分鐘後再來。`, ephemeral: true });
    const player = getOrCreatePlayer(null, interaction.user.id, interaction.user.username);
    const earned = 100 + Math.floor(Math.random() * 201);
    player.starCoins = number(player.starCoins) + earned;
    player.lastWorkAt = now;
    cooldowns.set(key, now);
    saveEconomy(interaction.user.id, interaction.user.username, player);
    return interaction.reply({ content: `🧰 你完成了一份工作，獲得 🌟 **${earned.toLocaleString()} Starcoins**！\n目前持有：🌟 **${player.starCoins.toLocaleString()}**` });
}

async function handleScBank(interaction) {
    const sub = interaction.options.getString('action') || interaction.options.getSubcommand();
    const player = getOrCreatePlayer(null, interaction.user.id, interaction.user.username);
    const interest = applyBankInterest(player);
    if (sub === 'balance') {
        saveEconomy(interaction.user.id, interaction.user.username, player);
        return interaction.reply({ content: `🏦 銀行餘額：🌟 **${number(player.bankStarCoins).toLocaleString()}**\n錢包餘額：🌟 **${number(player.starCoins).toLocaleString()}**${interest ? `\n本次低息收益：🌟 +${interest}` : ''}` });
    }
    const amount = number(interaction.options.getInteger('amount'));
    if (amount <= 0) return interaction.reply({ content: '❌ 金額必須大於 0。', ephemeral: true });
    if (sub === 'deposit') {
        if (number(player.starCoins) < amount) return interaction.reply({ content: '❌ 錢包 Starcoins 不足。', ephemeral: true });
        player.starCoins = number(player.starCoins) - amount;
        player.bankStarCoins = number(player.bankStarCoins) + amount;
    } else {
        if (number(player.bankStarCoins) < amount) return interaction.reply({ content: '❌ 銀行餘額不足。', ephemeral: true });
        player.bankStarCoins = number(player.bankStarCoins) - amount;
        player.starCoins = number(player.starCoins) + amount;
    }
    saveEconomy(interaction.user.id, interaction.user.username, player);
    return interaction.reply({ content: `${sub === 'deposit' ? '🏦 存入' : '🏧 提出'} 🌟 **${amount.toLocaleString()} Starcoins** 完成。\n銀行：🌟 ${number(player.bankStarCoins).toLocaleString()} ｜ 錢包：🌟 ${number(player.starCoins).toLocaleString()}${interest ? `\n低息收益：🌟 +${interest}` : ''}` });
}

async function handleSc(client, interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'pay') return handleScPay(interaction);
    if (sub === 'work') return handleScWork(interaction);
    if (sub === 'bank') return handleScBank(interaction);
    return handleGamble(client, interaction);
}

function giveStarCoins(targetId, amount, username) {
    const player = getOrCreatePlayer(null, targetId, username);
    player.starCoins = number(player.starCoins) + number(amount);
    saveEconomy(targetId, username, player);
    return player;
}

module.exports = { handleGamble, handleSc, giveStarCoins, applyBankInterest, MIN_BET, MAX_BET };
