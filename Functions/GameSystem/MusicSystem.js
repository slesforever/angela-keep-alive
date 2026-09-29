// Functions/GameSystem/MusicSystem.js
'use strict';
const play = require('play-dl');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } = require('@discordjs/voice');
const queues = new Map();
const RESOLVE_TIMEOUT_MS = 20000;
const STREAM_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + '逾時，請稍後再試。')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// 判斷是否為「一般播放清單」，排除 YouTube 動態生成的 Mix 播放清單 (list=RD...)
const isYoutubePlaylist = url => {
    if (!/(youtube\.com|youtu\.be)/i.test(url)) return false;
    const match = url.match(/[?&]list=([^&]+)/i);
    if (!match) return false;
    const listId = match[1];
    // RD 開頭的是YouTube個人化/動態Mix電台，API無法讀取全表，當作單曲處理
    return !listId.startsWith('RD');
};

const makeTrack = (x, source) => ({ 
    url: x.url, 
    title: x.title || x.name || x.name_raw || '未命名歌曲', 
    source 
});

async function resolve(url) {
    if (/open\.spotify\.com\/(track|album|playlist)/i.test(url)) {
        throw new Error('目前不支援 Spotify 連結；請改用 YouTube 或 SoundCloud 連結（不需要 API）。');
    }

    // 1. YouTube 實體播放清單 (非 RD 播單)
    if (isYoutubePlaylist(url)) {
        const p = await withTimeout(play.playlist_info(url, { incomplete: true }), RESOLVE_TIMEOUT_MS, 'YouTube 播放清單讀取');
        return (await withTimeout(p.all_videos(), RESOLVE_TIMEOUT_MS, 'YouTube 播放清單讀取')).slice(0, 100).map(x => makeTrack(x, 'YouTube')).filter(x => x.url);
    }

    // 2. SoundCloud 連結
    if (/soundcloud\.com/i.test(url)) {
        const item = await withTimeout(play.soundcloud(url), RESOLVE_TIMEOUT_MS, 'SoundCloud 連結讀取');
        if (typeof item.all_tracks === 'function') return (await withTimeout(item.all_tracks(), RESOLVE_TIMEOUT_MS, 'SoundCloud 播放清單讀取')).slice(0, 100).map(x => makeTrack(x, 'SoundCloud')).filter(x => x.url);
        return [makeTrack(item, 'SoundCloud')];
    }

    // 3. 一般 YouTube 連結 (含 list=RD... 動態 Mix 網址) 或關鍵字搜尋
    // 改用 play.search 避開 "Sign in to confirm you’re not a bot" 阻擋
    const searchResults = await withTimeout(play.search(url, { limit: 1 }), RESOLVE_TIMEOUT_MS, 'YouTube 讀取');
    if (!searchResults || !searchResults.length) {
        throw new Error('找不到可播放的歌曲。');
    }
    return [makeTrack(searchResults[0], 'YouTube')];
}

async function next(guildId) {
    const q = queues.get(guildId);
    if (!q || !q.tracks.length) {
        stop(guildId);
        return;
    }
    const t = q.tracks.shift();
    try {
        const s = await withTimeout(play.stream(t.url), STREAM_TIMEOUT_MS, '音訊串流');
        const r = createAudioResource(s.stream, { inputType: s.type || StreamType.WebmOpus, inlineVolume: true });
        r.volume?.setVolume(.8);
        q.player.play(r);
        await q.text.send('▶️ 正在播放：**' + t.title + '**（' + t.source + '）').catch(() => {});
    } catch (err) {
        await q.text.send('⚠️ 無法播放 **' + t.title + '**，已跳過。').catch(() => {});
        return next(guildId);
    }
}

async function handlePlay(client, interaction) {
    const voice = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '❌ 你必須先加入一個語音頻道。', ephemeral: true });

    const url = interaction.options.getString('musiclink', true).trim();
    await interaction.deferReply();

    let tracks;
    try {
        tracks = await resolve(url);
    } catch (err) {
        return interaction.editReply('❌ 讀取音樂連結失敗：' + err.message.slice(0, 1200));
    }
    if (!tracks.length) return interaction.editReply('❌ 找不到可播放的曲目。');

    let q = queues.get(interaction.guild.id);

    if (!q) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
        q = { connection: null, player, tracks: [], text: interaction.channel, channelId: null };
        queues.set(interaction.guild.id, q);

        player.on(AudioPlayerStatus.Idle, () => next(interaction.guild.id));
        player.on('error', err => interaction.channel.send('⚠️ 播放器錯誤：' + err.message.slice(0, 300)).catch(() => {}));
    }

    // 當機器人不在該語音頻道，或是使用者在別的語音頻道時，自動加入/移動過去
    if (!q.connection || q.channelId !== voice.id) {
        const connection = joinVoiceChannel({
            channelId: voice.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator
        });

        connection.subscribe(q.player);
        q.connection = connection;
        q.channelId = voice.id;
    }

    q.text = interaction.channel;
    q.tracks.push(...tracks);

    if (q.player.state.status === AudioPlayerStatus.Idle) {
        await next(interaction.guild.id);
    }

    return interaction.editReply('✅ 已加入 **' + tracks.length + '** 首歌曲到播放佇列。' + (tracks.length > 1 ? ' 播放清單會依序播放。' : ''));
}

function stop(guildId) {
    const q = queues.get(guildId);
    if (!q) return;
    q.player.stop(true);
    if (q.connection) {
        q.connection.destroy();
    }
    queues.delete(guildId);
}

module.exports = { handlePlay, stop };
