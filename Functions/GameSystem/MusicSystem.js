// Functions/GameSystem/MusicSystem.js
'use strict';
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } = require('@discordjs/voice');
const Innertube = require('youtubei.js');
const play = require('play-dl'); // 僅用於 SoundCloud（無反爬問題）

const queues = new Map();
const RESOLVE_TIMEOUT_MS = 20000;
const STREAM_TIMEOUT_MS = 20000;

// Innertube 單例（免 cookie，使用內部 Web Client）
let _yt = null;
async function getYt() {
    if (!_yt) _yt = await Innertube.create();
    return _yt;
}

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
    return !match[1].startsWith('RD');
};

const makeTrack = (id, title, source) => ({
    url: 'https://www.youtube.com/watch?v=' + id,
    videoId: id,
    title: title || '未命名歌曲',
    source
});

// ── 取 YouTube 音訊串流（webm/opus 優先，可直接餵給 Discord，免 ffmpeg）──
async function getYoutubeStream(videoId) {
    const yt = await getYt();
    const info = await withTimeout(yt.getInfo(videoId), STREAM_TIMEOUT_MS, 'YouTube 影片資訊');
    const formats = (info.streaming_data?.adaptive_formats || []).filter(f => f.has_audio && !f.has_video);
    if (!formats.length) throw new Error('找不到可播放的音訊格式。');

    // 優先選 webm/opus（Discord 原生支援，最穩）
    let format = formats.find(f => /webm/i.test(f.mime_type || '') && /opus/i.test(f.codecs || ''));
    let inputType = StreamType.WebmOpus;
    if (!format) {
        // 退而求其次：最高音訊位元率
        format = formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        inputType = /webm/i.test(format.mime_type || '') ? StreamType.WebmOpus : StreamType.Arbitrary;
    }
    const stream = await info.download({ format });
    return { stream, inputType };
}

async function resolve(url) {
    if (/open\.spotify\.com/i.test(url)) {
        throw new Error('目前不支援 Spotify 連結；請改用 YouTube 或 SoundCloud 連結。');
    }

    // 1. YouTube 實體播放清單（非 RD Mix）
    if (isYoutubePlaylist(url)) {
        const yt = await getYt();
        const listMatch = url.match(/[?&]list=([^&]+)/i);
        const playlist = await withTimeout(yt.getPlaylist(listMatch[1]), RESOLVE_TIMEOUT_MS, 'YouTube 播放清單讀取');
        const vids = (playlist.videos || []).slice(0, 100);
        return vids.map(v => makeTrack(v.id, v.title?.text || v.title, 'YouTube')).filter(t => t.videoId);
    }

    // 2. SoundCloud（用 play-dl）
    if (/soundcloud\.com/i.test(url)) {
        const item = await withTimeout(play.soundcloud(url), RESOLVE_TIMEOUT_MS, 'SoundCloud 連結讀取');
        if (typeof item.all_tracks === 'function') {
            const tracks = await withTimeout(item.all_tracks(), RESOLVE_TIMEOUT_MS, 'SoundCloud 播放清單讀取');
            return tracks.slice(0, 100).map(x => ({ url: x.url, title: x.name || '未命名歌曲', source: 'SoundCloud' })).filter(x => x.url);
        }
        return [{ url: item.url, title: item.name || '未命名歌曲', source: 'SoundCloud' }];
    }

    // 3. 直接 YouTube 連結（watch?v= / youtu.be / shorts / embed，含 list=RD 動態 Mix）
    const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i.exec(url);
    if (yt) {
        const id = yt[1];
        let title = 'YouTube 歌曲';
        try {
            const ytInst = await getYt();
            const info = await withTimeout(ytInst.getInfo(id), 8000, 'YouTube 影片資訊');
            if (info?.basic_info?.title) title = info.basic_info.title;
        } catch (_) { /* 仍可直接串流 */ }
        return [makeTrack(id, title, 'YouTube')];
    }

    // 4. 關鍵字搜尋（非 URL 輸入）
    const ytInst = await getYt();
    const search = await withTimeout(ytInst.search(url, { type: 'video' }), RESOLVE_TIMEOUT_MS, 'YouTube 搜尋');
    const first = search?.videos?.[0];
    if (!first?.id) throw new Error('找不到可播放的歌曲。');
    return [makeTrack(first.id, first.title?.text || first.title, 'YouTube')];
}

async function streamOnce(track) {
    if (track.source === 'SoundCloud') {
        const s = await withTimeout(play.stream(track.url), STREAM_TIMEOUT_MS, 'SoundCloud 串流');
        return { stream: s.stream, inputType: s.type || StreamType.Arbitrary };
    }
    // YouTube：失敗重試一次
    try { return await getYoutubeStream(track.videoId); }
    catch (e) { console.warn('[Music] YouTube 串流第一次失敗,重試:', e.message); }
    return getYoutubeStream(track.videoId);
}

async function next(guildId) {
    const q = queues.get(guildId);
    if (!q || !q.tracks.length) { stop(guildId); return; }
    const t = q.tracks.shift();
    try {
        const { stream, inputType } = await streamOnce(t);
        const r = createAudioResource(stream, { inputType, inlineVolume: true });
        r.volume?.setVolume(.8);
        q.player.play(r);
        await q.text.send('▶️ 正在播放：**' + t.title + '**（' + t.source + '）').catch(() => {});
    } catch (err) {
        await q.text.send('⚠️ 無法播放 **' + t.title + '**，已跳過。(' + err.message.slice(0, 80) + ')').catch(() => {});
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
    if (q.connection) q.connection.destroy();
    queues.delete(guildId);
}

module.exports = { handlePlay, stop };
