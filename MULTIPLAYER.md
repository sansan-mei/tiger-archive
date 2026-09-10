# 多人接入边界（协议 v7）

## 已实现

- 2–8 个独立实体，按稳定字符串 ID 管理，controller 为 human 或 bot。
- 车体与武器来自统一目录，开局时确定，不接受对局输入修改配置。
- 自由混战、统一胜负判定、独立弹丸所有者和击毁归属。
- 固定 60 Hz 模拟，不以浏览器实际帧率计算速度或伤害。
- Authority 接收绑定玩家的输入并运行规则；Replica 接收快照并供渲染插值。
- 浏览器演示也使用 LocalSession → Authority → Replica 流程，没有在渲染层直接改血量、位置或伤害。
- matchId、epoch、连接代号、输入 seq、snapshotSeq、tick 和 eventId。
- 拒绝陌生对端、身份冒充字段、非法输入、旧序号、错误对局、旧连接及乱序快照。
- 输入 18 tick（0.3 秒）未更新则释放操作并取消蓄力。显式断开立即释放控制，避免失联后继续攻击。
- 快照独立拷贝，事件去重；重连握手发放新连接代号，旧连接的数据不再有效。
- 完整权威快照可恢复确定性模拟，包括武器蓄力、斜坡位置和 AI 路径状态。

已实现 server.js / room-server.js / network-session.js 的 WebSocket 房间流程，并提供 Docker 与可选 Redis 恢复。当前测试使用进程内连接替身，未启动真实监听或做公网验收。没有接入 WebRTC 或账号。

## 三个接口

### Authority（服务器或明确选定的权威房主）

通过 require('./battle-session.js') 可在 Node.js 中加载。

1. new Authority({ participants, matchId, epoch }) 创建对局。participants 是已确定的 2–8 名玩家及配置。
2. attach(peerId, entityId) 将经过外部房间验证的连接绑定到 human 实体，返回 welcome。
3. receive(peerId, packet) 校验输入并保留最新有效命令。
4. authority.battle.start() 开始模拟。
5. step() 推进一个固定 tick。外部驱动负责按真实累计时间保持 60 Hz；不要按收到网络包的次数推进。
6. statePacket() 返回新的快照包。可先采用 20 Hz 广播；需要可靠重连恢复时直接发送完整快照。
7. detach(peerId) 释放该连接的输入。当前实体留在场中，后续房间规则可决定重连期限和托管。

peerId 必须来自传输连接与认证映射，不能相信客户端自行声明的身份。attach 是权威方接口，不是开放给任意客户端执行的 RPC。

### Replica（客户端）

1. welcome(packet) 接受权威握手并建立 matchId、epoch、entityId 和连接代号。
2. receive(packet) 校验状态，拒绝旧包，并返回本次新增事件。
3. renderState(alpha) 返回插值副本；渲染修改副本不会改变权威状态。
4. 输入包只包含操作与瞄准，不包含实体位置、HP、伤害或武器升级。

实际传输适配器只需承接收发：
- WebSocket：发送 JSON 字符串，接收时调用对应 receive。
- Socket.IO：可以直接使用消息对象，但仍保留应用层版本、顺序和绑定校验。
- WebRTC DataChannel：采用相同协议；单独实现信令、ICE、STUN/TURN 与权威端选举/固定。
- 不能把客户端传来的 state 包当作 Authority 的恢复指令。

### LocalSession（当前页面使用）

- start / pause / restart 管理本地演示。
- advance(seconds, input) 用累加器推进固定 tick，通过 Authority 校验，再交付 Replica。
- state() 返回插值状态，current() 返回最近一次经过验证的状态。
- 单帧补算最多接收 0.25 秒，避免后台恢复后的巨大追帧。
- pause 是本地便利功能。真实多人客户端失焦时只应发出释放输入或由超时释放，不能暂停整个房间。

## 消息结构

welcome：

    { version: 4, type: "welcome", pluginManifest, matchId, epoch, entityId, connection, tickRate: 60 }

input：

    {
      version: 4, type: "input", matchId, epoch, connection,
      seq, clientTick,
      input: {
        forward, reverse, left, right, brake, fire, interact,
        aimLeft, aimRight, cancelFire,
        aimYaw, aimPitch
      }
    }

布尔字段可省略，默认 false；角度为弧度。clientTick 只作容差验证，不允许客户端要求过去重演或未来加速。断线/失焦使用 cancelFire，普通松开 fire 仍表示主动释放激光蓄力。

state：

    {
      version: 4, type: "state", matchId, epoch, snapshotSeq,
      snapshot: { version, pluginManifest, mapId, matchId, epoch, tick, status, winnerId,
                  nextBullet, nextEvent, entities, bullets },
      events: [ { eventId, tick, epoch, type, ... } ],
      ack: [ { entityId, seq } ]
    }

完整状态、路径与弹丸均为可 JSON 序列化数据。单包上限 64 KiB，事件历史保留最近 256 条，重复事件不会重复播放；长期离线客户端只能依靠完整快照恢复当前状态，不保证补播所有历史特效。

## 已接入的房间层

create / join 请求携带 version、pluginManifest、name、loadout；join 另带 code。服务器返回 joined（自己的 entityId 和重连 token）及 room（不包含 token 的公开名单）。ready、loadout、start、leave、rematch 均由绑定连接校验权限。

resume 携带 code、token、version、pluginManifest。重新绑定后发放新 welcome 和快照。普通断线 30 秒后淘汰；同一席位只能绑定一个连接。恢复 Redis 检查点会提高 epoch，清空操作并重新握手。

客户端只用鼠标瞄准；驾驶上下坡。WebSocket 收包限制为 16 KiB，状态包仍为 64 KiB。普通状态每 3 个 tick 广播一次，每包附带最近 64 个特效事件；它们会去重，长期断线不保证补播。游戏结算、血量和楼层以快照为准。

输入限流约 80 包/秒、瞬时容量 120；稳定输入约 30 Hz，按下/松开及时发送。单连接发送积压超过 256 KiB 会断开，防止队列无限增长。服务器具有 ping/pong 心跳检测。

## 后续验证与扩展

- 真实浏览器与不同机器 8 人联调，延迟、丢包、带宽及服务器负载测试。
- 根据实测添加本机预测、权威校正和延迟补偿。
- 账号、战绩与多实例房间路由。

具体 Docker、Redis 和反向代理步骤见 [DEPLOY.md](DEPLOY.md)。配置检查不能代替部署实测。

## 计分赛与补给（v7）

权威核心负责五分钟/15 次击毁结束、四秒复活、两秒保护（开炮解除）、40 装甲维修和六秒加速；玩家不能通过输入直接指定生命、分数、补给或复活时间。snapshot 新增 pickups，实体新增 deaths、respawnAt、protectedUntil、boostUntil、forfeited；damage 事件附带实际伤害 amount，新增 respawn/pickup 事件。离场与重连超时会设置 forfeited，避免退出者反复复活。联机大厅的准备、返回大厅和新 epoch 再开局流程保持适用。

协议 v7 新增 ability 布尔输入与 ability 事件。护盾、临时屏障、最近交火 tick、技能有效期、冷却和按键边沿状态全部由权威核心维护并进入快照，检查点恢复时保留。六个内置插件升级至 2.1.0，握手拒绝旧清单。维修包随装甲数值调整为 40。
