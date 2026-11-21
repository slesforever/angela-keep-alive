// Functions/MusicSystem.js
// 音樂系統：播放 / 佇列 / skip / pause / resume / loop / stop
//
// 依賴（在專案根目錄執行）：
//   npm i @discordjs/voice @distube/ytdl-core youtube-sr
//
// 這版修正的重點：
//   1. 匯出名稱一次補齊（handlePlay / handleQueue / handleSkip ...），
//      呼叫端不管用 MusicSystem.handlePlay() 還是 MusicSystem.play() 都能通，
//      不會再出現 "MusicSystem.handlePlay is not a function"
//   2. 新增 dispatch(subcommand, interaction)：子指令名稱會自動正規化與對應別名，
//      真的找不到時直接拋出「可用名稱清單」，不用再猜
//   3. 每台伺服器各自一份佇列狀態，loop 三態（off / track / queue）行為明確
//   4. 播放器與語音連線只建立一次，佇列空了才離開，避免重複連線
//
// 可直接覆蓋 Functions/MusicSystem.js

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    getVoiceConnection,
    entersState,
    StreamType,
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const YouTube = require('youtube-sr').default;
const { EmbedBuilder } = require('discord.js');

const MAX_QUEUE = Number(process.env.MUSIC_MAX_QUEUE || 100);

const REQUEST_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
};

// guildId -> state
const guilds = new Map();

function getGuildState(guildId) {
    if (!guilds.has(guildId)) {
        guilds.set(guildId, {
            queue: [],
            player: null,
            connection: null,
            current: null,
            loop: 'off',          // off | track | queue
            paused: false,
            textChannelId: null,
            voiceChannelId: null,
            skipLoopOnce: false,
        });
    }
    return guilds.get(guildId);
}

// ── 回覆工具（相容已被 defer 或已回覆的情況）────────────────

async function defer(interaction) {
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply();
}

async function respond(interaction, payload) {
    if (interaction.deferred || interaction.replied) {
        return interaction.editReply(payload);
    }
    return interaction.reply(payload);
}

// ── 解析歌曲 ─────────────────────────────────────────────────

async function resolveTracks(input, requester) {
    const text = String(input || '').trim();
    if (!text) return [];

    if (ytdl.validateURL(text)) {
        const info = await ytdl.getInfo(text, { requestOptions: REQUEST_OPTIONS });
        const v = info.videoDetails;
        return [{
            title: v.title,
            url: v.videoUrl,
            duration: Number(v.lengthSeconds) || 0,
            requestedBy: requester || null,
            thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url || null,
        }];
    }

    const results = await YouTube.search(text, { limit: 1, type: 'video' });
    if (!results?.length) return [];

    const v = results[0];
    return [{
        title: v.title,
        url: v.url,
        duration: Math.round((v.duration || 0) / 1000),
        requestedBy: requester || null,
        thumbnail: v.thumbnail?.url || null,
    }];
}

function createStream(url) {
    return ytdl(url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        requestOptions: REQUEST_OPTIONS,
    });
}

function formatDuration(seconds) {
    const total = Number(seconds) || 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ── 語音連線與播放器 ─────────────────────────────────────────

async function ensureConnection(guild, voiceChannel) {
    const st = getGuildState(guild.id);

    if (st.connection && st.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        if (st.voiceChannelId === voiceChannel.id) return st.connection;
        st.connection.destroy();
    }

    const existing = getVoiceConnection(guild.id);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
        if (st.voiceChannelId === voiceChannel.id) {
            st.connection = existing;
            return existing;
        }
        existing.destroy();
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    st.connection = connection;
    st.voiceChannelId = voiceChannel.id;

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20000);
    } catch (_) {
        console.warn('[Music] 語音連線尚未就緒，仍先排入佇列');
    }

    return connection;
}

function ensurePlayer(guildId) {
    const st = getGuildState(guildId);
    if (st.player) return st.player;

    const player = createAudioPlayer();
    st.player = player;

    player.on(AudioPlayerStatus.Idle, () => {
        void playNext(guildId);
    });

    player.on('error', (error) => {
        console.error(`[Music] 播放器錯誤：${error.message}`);
        void playNext(guildId);
    });

    return player;
}

// ── 播放核心 ─────────────────────────────────────────────────

function cleanup(guildId) {
    const st = getGuildState(guildId);
    st.current = null;
    st.paused = false;
    st.queue = [];

    if (st.player) {
        st.player.stop();
        st.player = null;
    }
    if (st.connection) {
        st.connection.destroy();
        st.connection = null;
    }
    st.voiceChannelId = null;
}

async function playNext(guildId) {
    const st = getGuildState(guildId);
    const bypassLoop = st.skipLoopOnce;
    st.skipLoopOnce = false;

    let track = null;

    if (!bypassLoop && st.loop === 'track' && st.current) {
        track = st.current;
    } else {
        if (!bypassLoop && st.loop === 'queue' && st.current) {
            st.queue.push(st.current);
        }
        track = st.queue.shift() || null;
    }

    if (!track) {
        cleanup(guildId);
        return null;
    }

    st.current = track;
    st.paused = false;

    try {
        const resource = createAudioResource(createStream(track.url), {
            inputType: StreamType.Arbitrary,
        });
        ensurePlayer(guildId).play(resource);
        return track;
    } catch (error) {
        console.error(`[Music] 無法播放「${track.title}」：${error.message}`);
        return playNext(guildId);
    }
}

// ── 指令處理函式 ─────────────────────────────────────────────

async function handlePlay(interaction) {
    const query =
        interaction.options?.getString('query') ||
        interaction.options?.getString('song') ||
        interaction.options?.getString('url') ||
        interaction.options?.getString('name');

    if (!query) {
        return respond(interaction, { content: '❌ 請提供歌曲名稱或網址。', ephemeral: true });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return respond(interaction, { content: '❌ 請先加入語音頻道。', ephemeral: true });
    }

    await defer(interaction);

    const st = getGuildState(interaction.guildId);
    st.textChannelId = interaction.channelId;

    let tracks;
    try {
        tracks = await resolveTracks(query, interaction.user?.username);
    } catch (error) {
        return respond(interaction, { content: `❌ 解析歌曲失敗：${error.message}` });
    }

    if (!tracks.length) {
        return respond(interaction, { content: '❌ 找不到符合的歌曲。' });
    }

    if (st.queue.length >= MAX_QUEUE) {
        return respond(interaction, { content: `❌ 佇列已滿（上限 ${MAX_QUEUE} 首）。` });
    }

    await ensureConnection(interaction.guild, voiceChannel);

    const wasPlaying = Boolean(st.current);
    st.queue.push(...tracks);

    if (!wasPlaying) {
        const started = await playNext(interaction.guildId);
        if (!started) {
            return respond(interaction, { content: '❌ 播放失敗，請換一首試試。' });
        }
        const track = started;
        return respond(interaction, {
            content: `▶️ 正在播放 **${track.title}** \`${formatDuration(track.duration)}\``,
        });
    }

    const track = tracks[0];
    return respond(interaction, {
        content: `➕ 已加入佇列：**${track.title}** \`${formatDuration(track.duration)}\`（第 ${st.queue.length} 首）`,
    });
}

async function handleQueue(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current && !st.queue.length) {
        return respond(interaction, { content: '📭 佇列是空的，用 `/music play` 點一首吧。', ephemeral: true });
    }

    const loopLabel = { off: '關閉', track: '單曲循環', queue: '整張循環' }[st.loop] || '關閉';

    const lines = st.queue.slice(0, 10).map((t, i) => {
        return `${i + 1}. **${t.title}** \`${formatDuration(t.duration)}\``;
    });

    const more = st.queue.length > 10 ? `\n…還有 ${st.queue.length - 10} 首` : '';

    const embed = new EmbedBuilder()
        .setTitle('🎵 播放佇列')
        .setColor(0x5865f2)
        .setDescription(
            [
                st.current
                    ? `**目前播放**\n${st.paused ? '⏸' : '▶️'} **${st.current.title}** \`${formatDuration(st.current.duration)}\``
                    : '**目前播放**\n（無）',
                '',
                `**接下來**\n${lines.join('\n') || '（沒有下一首）'}${more}`,
            ].join('\n')
        )
        .setFooter({ text: `循環：${loopLabel}　|　共 ${st.queue.length} 首待播` });

    if (st.current?.thumbnail) {
        embed.setThumbnail(st.current.thumbnail);
    }

    return respond(interaction, { embeds: [embed] });
}

async function handleSkip(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current) {
        return respond(interaction, { content: '❌ 目前沒有正在播放的歌曲。', ephemeral: true });
    }

    const skipped = st.current.title;
    st.skipLoopOnce = true;

    if (st.player) {
        st.player.stop();
    } else {
        await playNext(interaction.guildId);
    }

    return respond(interaction, { content: `⏭ 已跳過 **${skipped}**` });
}

async function handlePause(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current) {
        return respond(interaction, { content: '❌ 目前沒有正在播放的歌曲。', ephemeral: true });
    }
    if (st.paused) {
        return respond(interaction, { content: '⏸ 已經在暫停狀態了。', ephemeral: true });
    }

    st.player?.pause();
    st.paused = true;

    return respond(interaction, { content: `⏸ 已暫停 **${st.current.title}**` });
}

async function handleResume(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current) {
        return respond(interaction, { content: '❌ 目前沒有正在播放的歌曲。', ephemeral: true });
    }
    if (!st.paused) {
        return respond(interaction, { content: '▶️ 目前本來就在播放。', ephemeral: true });
    }

    st.player?.unpause();
    st.paused = false;

    return respond(interaction, { content: `▶️ 已繼續播放 **${st.current.title}**` });
}

async function handleLoop(interaction) {
    const st = getGuildState(interaction.guildId);

    const requested = String(interaction.options?.getString('mode') || '').toLowerCase();
    const cycle = { off: 'track', track: 'queue', queue: 'off' };

    let next;
    if (['off', 'track', 'queue'].includes(requested)) {
        next = requested;
    } else if (requested === 'on') {
        next = 'track';
    } else if (requested === 'all') {
        next = 'queue';
    } else {
        next = cycle[st.loop] || 'off';
    }

    st.loop = next;

    const label = { off: '關閉', track: '單曲循環', queue: '整張循環' }[next];
    return respond(interaction, { content: `🔁 循環模式：**${label}**` });
}

async function handleStop(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current && !st.queue.length && !st.connection) {
        return respond(interaction, { content: '❌ 目前沒有在播放。', ephemeral: true });
    }

    st.loop = 'off';
    st.skipLoopOnce = false;
    cleanup(interaction.guildId);

    return respond(interaction, { content: '⏹ 已停止播放並清空佇列。' });
}

async function handleNowPlaying(interaction) {
    const st = getGuildState(interaction.guildId);

    if (!st.current) {
        return respond(interaction, { content: '📭 目前沒有在播放。', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`${st.paused ? '⏸' : '▶️'} 正在播放`)
        .setDescription(`**${st.current.title}**`)
        .setColor(0x5865f2)
        .addFields(
            { name: '長度', value: formatDuration(st.current.duration), inline: true },
            { name: '點播', value: st.current.requestedBy || '未知', inline: true },
            { name: '循環', value: { off: '關閉', track: '單曲', queue: '整張' }[st.loop], inline: true },
        );

    if (st.current.thumbnail) {
        embed.setThumbnail(st.current.thumbnail);
    }

    return respond(interaction, { embeds: [embed] });
}

// ── 分派：名稱對不上時直接告訴你可用哪些 ────────────────────

const handlers = {
    play: handlePlay,
    queue: handleQueue,
    skip: handleSkip,
    pause: handlePause,
    resume: handleResume,
    loop: handleLoop,
    stop: handleStop,
    nowplaying: handleNowPlaying,
};

const ALIASES = {
    p: 'play', add: 'play', song: 'play',
    q: 'queue', list: 'queue',
    s: 'skip', next: 'skip',
    hold: 'pause',
    unpause: 'resume', continue: 'resume',
    repeat: 'loop',
    leave: 'stop', disconnect: 'stop', quit: 'stop',
    np: 'nowplaying', current: 'nowplaying',
};

function normalizeSubcommand(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^handle/, '')
        .replace(/[\s_-]+/g, '');
}

function dispatch(subcommand, interaction) {
    const key = normalizeSubcommand(subcommand);
    const name = ALIASES[key] || key;
    const handler = handlers[name];

    if (typeof handler !== 'function') {
        throw new Error(
            `MusicSystem 沒有對應「${subcommand}」的處理函式。可用：${Object.keys(handlers).join(', ')}`
        );
    }

    return handler(interaction);
}

module.exports = {
    // 標準名稱
    play: handlePlay,
    queue: handleQueue,
    skip: handleSkip,
    pause: handlePause,
    resume: handleResume,
    loop: handleLoop,
    stop: handleStop,
    nowplaying: handleNowPlaying,

    // 舊呼叫端相容（這就是原本 is not a function 的來源）
    handlePlay,
    handleQueue,
    handleSkip,
    handlePause,
    handleResume,
    handleLoop,
    handleStop,
    handleNowPlaying,

    handlers,
    dispatch,
    getState: getGuildState,
    destroy: cleanup,
};
