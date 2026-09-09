# 首版联机方案建议

建议采用 WebSocket + 独立权威服务器，先完成 8 人自由混战。当前已实现 WebSocket 房间服务和客户端，并提供 Docker / Redis 配置；开发过程中没有启动真实网络服务。部署步骤见 [DEPLOY.md](DEPLOY.md)。

| 项目 | WebSocket + 权威服务器 | WebRTC DataChannel |
| --- | --- | --- |
| 拓扑 | 每人连接服务器，服务器结算并广播 | 可用房主星形、全互联或独立权威端；传输协议本身不决定谁结算 |
| 开发与运维 | 便于集中实现房间、认证、日志、重连和胜负 | 还需信令、ICE 与 STUN/TURN；若采用玩家房主还需处理房主退出 |
| 弱网特点 | 基于 TCP，有序可靠；丢包重传可能拖延后续状态 | 可选择无序、限制重传或消息寿命，适合可被新状态替代的更新 |
| 成本 | 服务器承担模拟与广播带宽 | 直连可能减少中继带宽，TURN 转发仍会产生服务器成本 |
| 公平性 | 服务器不信任客户端上报的位置和伤害 | 同样能用权威服务器；玩家房主方案需接受房主作弊与延迟优势 |

WebSocket 使用 TCP：[MDN 服务端说明](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)。WebRTC 提供 ordered、maxRetransmits、maxPacketLifeTime 配置：[MDN createDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel)。信令不由 WebRTC 规范实现，跨网络连接需要规划 STUN/TURN：[WebRTC 官方说明](https://webrtc.org/getting-started/peer-connections)。表中的实现难度与适用性是针对本项目的工程判断，不代表 WebSocket 在所有网络环境都更快。

## 原始实施路线（房间、传输与重连已实现，预测/带宽优化待实测）

1. 房间服务：创建/加入、最多 8 人、准备状态、插件清单核对、车体武器选择、服务器确认开局。
2. 每个房间一个 Authority，服务器保持 60 Hz 模拟。先尝试输入 30 Hz、状态广播 20 Hz，并为按下/松开开火及时发送，避免短点击被合并丢失。实际频率根据延迟与负载测试调整。
3. 接入 WSS、身份绑定、心跳、断线重连、输入速率限制；客户端失焦只释放输入，不暂停房间。
4. 为实际网络补充时间戳、快照缓冲、本机预测及服务器校正。现有相邻快照插值不能直接等同于网络延迟处理。
5. 收敛网络快照：AI 寻路状态留在服务器，完整检查点与广播状态分离；插件完整清单握手核对后用摘要标识。限制发送队列，过时且未发送的状态可合并，战斗事件走可靠确认。当前 64 KiB 完整快照只是原型边界，需要测试峰值弹丸/事件负载。
6. 两台不同网络设备联调，再做 8 人延迟、丢包、带宽与服务器负载测试。

传统浏览器 WebSocket API 没有自动背压，应监控 bufferedAmount 并限制队列：[MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)。慢客户端不能拖垮整个房间。

后续若要加语音，可单独用 WebRTC 音频；若实测 TCP 排队已影响战斗，再评估 WebRTC 的无序状态通道。届时保留权威结算与插件接口，主要调整传输及消息可靠性。8 人全互联需要 28 对连接，不建议作为本项目首版拓扑。
