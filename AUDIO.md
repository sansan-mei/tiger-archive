# 坦克行驶录音

当前行驶声使用真实录音素材，已移除原锯齿波和中途尝试的科幻合成动力声。射击、爆炸和其他既有音效暂未更换。

## 来源

- 作者：qubodup。
- 素材：[Driving Tank Engine.flac](https://freesound.org/people/qubodup/sounds/187676/)。作者描述为坦克在沙地行驶，来自美国政府机构视频；不声称是虎式坦克的专门录音，也不是单独分离的履带声轨。
- 页面标注 [CC0](https://creativecommons.org/publicdomain/zero/1.0/)，允许商用与修改。许可说明另存 `client/audio/LICENSE.txt`。
- 使用公开 HQ MP3 预览：<https://cdn.freesound.org/previews/187/187676_71257-hq.mp3>，没有使用需登录下载的原始 FLAC。
- 下载文件 SHA-256：`0c5f0ca99703fa78ff6e56fe3f180b9caab932ec9c22d9247789e0c90df39e00`。

## 处理与文件体积

转为单声道 24 kHz，45 Hz 高通 / 4500 Hz 低通，首尾 100 ms 交叉渐变，去直流偏移并将峰值归一化为 0.7。以 80 kbps MP3 编码。

最终文件：`client/audio/tank-drive.mp3`，56,925 字节（55.6 KiB），有效录音约 5.59 秒。最终 SHA-256：`237f976e040b180a754932539a56baebcdef760cdb8413fb028a69c1f7ef34e3`。

素材本地部署，无运行时外站访问；每个页面只下载、解码一次，切换车型复用同一个循环声源。音频不进入 WebSocket 快照。浮点解码缓冲区约 0.51 MiB（24 kHz）；浏览器按 AudioContext 采样率重采样时内存会相应增加。

## 播放行为

随玩家开始或继续操作初始化 AudioContext。轻、中、重型用不同的播放速率基线；按实际速度平滑变调与变音量，倒车正常播放，技能超速不无限提高音高或音量。当前只播放自己车辆的行驶声。

停车淡出；人类、暂停、死亡、下落、AudioContext 挂起时静音。只改变声音，不改变战斗规则。加载失败不阻止游戏；暂停后继续可重试。服务器已有声音文件但浏览器取不到时，先检查是否更新了服务端资源白名单。

`app-manifest.js.assets` 管理 MP3 文件；服务器提供 audio/mpeg，发布脚本按二进制复制。已有 Docker COPY client 包含音频。更新后重启服务器并刷新；release/Docker 由部署者重新构建，本轮没有执行构建。

当前自动测试验证音频图、状态与资源传输，不验证实际听感。不同耳机/扬声器上的音量、循环接缝、开炮时的混音仍需实际游玩试听。
