// Functions/GameSystem/MusicSystem.js
'use strict';

const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SoundCloudPlugin } = require('@distube/soundcloud');

let distube = null;

// 初始化單例 DisTube 引擎
function getDisTube(client) {
    if (!distube) {
        distube = new DisTube(client, {
            emitNewSongOnly: true,
            emitAddSongWhenCreatingQueue: false,
            nsfw: true,
            plugins: [
                new YouTubePlugin(),
                new SoundCloudPlugin()
            ]
        });

        // 播放新歌曲提示
        distube.on('playSong', (queue, song) => {
            if (queue.textChannel) {
                queue.textChannel.send('▶️ 正在播放：**' + song.name + '**（`' + song.formattedDuration + '`）').catch(() => {});
            }
        });

        // 加入單曲提示
        distube.on('addSong', (queue, song) => {
            if (queue.textChannel) {
                queue.textChannel.send('✅ 已加入佇列：**' + song.name + '**').catch(() => {});
            }
        });

        // 加入播放清單提示
        distube.on('addList', (queue, playlist) => {
            if (queue.textChannel) {
                queue.textChannel.send('✅ 已加入播放清單：**' + playlist.name + '**（共 ' + playlist.songs.length + ' 首歌曲）').catch(() => {});
            }
        });

        // 佇列播放完畢提示
        distube.on('finish', (queue) => {
            if (queue.textChannel) {
                queue.textChannel.send('⏹️ 播放清單已結束。').catch(() => {});
            }
        });

        // 錯誤處理
        distube.on('error', (channel, error) => {
            console.error('[DisTube Error]', error);
            if (channel && typeof channel.send === 'function') {
                channel.send('⚠️ 播放發生錯誤：' + (error.message ? error.message.slice(0, 200) : '未知錯誤')).catch(() => {});
            }
        });
    }
    return distube;
}

async function handlePlay(client, interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '❌ 你必須先加入一個語音頻道。', ephemeral: true });
    }

    const query = interaction.options.getString('musiclink', true).trim();
    await interaction.deferReply();

    const dt = getDisTube(client);

    try {
        await dt.play(voiceChannel, query, {
            textChannel: interaction.channel,
            member: interaction.member
        });

        return interaction.editReply('🔍 已成功處理播放請求！');
    } catch (err) {
        return interaction.editReply('❌ 無法播放該歌曲：' + err.message.slice(0, 500));
    }
}

function stop(guildId) {
    if (!distube) return;
    const queue = distube.getQueue(guildId);
    if (queue) {
        queue.stop();
    }
}

module.exports = { handlePlay, stop };
