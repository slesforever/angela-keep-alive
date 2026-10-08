# angela-keep-alive

## 頻道設定與持久化

Angela 的伺服器頻道設定會保存到 Discord，而不是只保存到部署主機的本機檔案。

1. 建立一個只有伺服器管理員與 Angela 可見的文字頻道，例如 `angela-config`。
2. 在伺服器中執行：
   ```
   /setstoragechannel target_channel:#angela-config
   ```
3. 再使用：
   ```
   /setchannel
   ```
   設定系統通知、Rate Up、新聞、升級公告、星星榜、紀錄與翻譯頻道。
4. 使用 `/serverconfig` 查看目前設定。

設定會以 Angela 的設定訊息寫在儲存頻道中。Bot 重啟後會自動找回該訊息並恢復設定；第一次設定儲存頻道時，也會嘗試將舊版本機設定一併搬移進 Discord。

### 權限

Angela 需要能查看儲存頻道、讀取歷史訊息、發送訊息、嵌入連結與管理訊息。`/setstoragechannel` 會嘗試自動限制 `@everyone` 的查看權限。