// Functions/GameSystem/WatchdogSystem.js
// 心跳看門狗：event loop 凍結 >90s 時用 client.destroy() + 30s backoff 自動重生
'use strict';

const FREEZE_THRESHOLD_MS = 90_000;
const BACKOFF_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

let lastBeat = Date.now();
let respawning = false;
let timer = null;

function beat() {
    lastBeat = Date.now();
}

function getFreezeDuration() {
    return Date.now() - lastBeat;
}

async function respawnClient(client, loginFn) {
    if (respawning) return;
    respawning = true;
    console.error(`[Watchdog] Event loop 凍結 ${Math.floor(getFreezeDuration() / 1000)}s，啟動重生程序…`);

    try {
        if (client && typeof client.destroy === 'function') {
            client.destroy();
            console.log('[Watchdog] client.destroy() 完成');
        }
    } catch (err) {
        console.error('[Watchdog] destroy 失敗:', err.message);
    }

    console.log(`[Watchdog] 等待 ${BACKOFF_MS / 1000}s backoff…`);
    await new Promise(resolve => setTimeout(resolve, BACKOFF_MS));

    try {
        if (typeof loginFn === 'function') {
            await loginFn();
            console.log('[Watchdog] 重生成功，client 已重新登入');
        }
    } catch (err) {
        console.error('[Watchdog] 重生失敗:', err.message);
    } finally {
        respawning = false;
        beat();
    }
}

function start(client, loginFn) {
    beat();

    timer = setInterval(() => {
        const frozen = getFreezeDuration();
        if (frozen > FREEZE_THRESHOLD_MS && !respawning) {
            respawnClient(client, loginFn).catch(err => {
                console.error('[Watchdog] 重生例外:', err.message);
                respawning = false;
                beat();
            });
        }
    }, HEARTBEAT_INTERVAL_MS);

    console.log(`[Watchdog] 心跳看門狗已啟動（凍結門檻 ${FREEZE_THRESHOLD_MS / 1000}s、backoff ${BACKOFF_MS / 1000}s）`);
    return timer;
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, beat, getFreezeDuration, FREEZE_THRESHOLD_MS };
