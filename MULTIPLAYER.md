# 多人接入边界（协议 v12）

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

### Authority（联机时运行在独立服务器）

通过 require('./battle-session.js') 可在 Node.js 中加载。

1. new Authority({ participants, matchId, epoch }) 创建对局。participants 是已确定的 2–8 名玩家及配置。
2. attach(peerId, entityId) 将经过外部房间验证的连接绑定到 human 实体，返回 welcome。
3. receive(peerId, packet) 校验输入并保留最新有效命令。
4. authority.battle.start() 开始模拟。
5. step() 推进一个固定 tick。外部驱动负责按真实累计时间保持 60 Hz；不要按收到网络包的次数推进。
6. statePacket({ network: true }) 返回用于 20 Hz 广播及客户端重连的状态包。默认 statePacket() 保留完整快照供本地会话使用；服务端恢复使用 Battle.snapshot() 完整检查点。
7. detach(peerId) 释放该连接的输入。当前实体留在场中，房间层保留 30 秒重连窗口，超时后离场且不再复活。

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

### LocalSession（本地训练使用）

- start / pause / restart 管理本地演示。
- advance(seconds, input) 用累加器推进固定 tick，通过 Authority 校验，再交付 Replica。
- state() 返回插值状态，current() 返回最近一次经过验证的状态。
- 单帧补算最多接收 0.25 秒，避免后台恢复后的巨大追帧。
- pause 是本地便利功能。真实多人客户端失焦时只应发出释放输入或由超时释放，不能暂停整个房间。

## 消息结构

welcome：

    { version: 12, type: "welcome", pluginManifest, matchId, epoch, entityId, connection, tickRate: 60 }

input：

    {
      version: 12, type: "input", matchId, epoch, connection,
      seq, clientTick,
      input: {
        forward, reverse, left, right, brake, fire, interact,
        aimLeft, aimRight, cancelFire, ability,
        aimYaw, aimPitch, moveYaw
      }
    }

ability 表示技能按键状态，由服务器检测按下边沿并执行冷却。interact 为兼容保留字段，不再负责上下楼；页面使用鼠标瞄准，不绑定 aimLeft / aimRight 按键。布尔字段可省略，默认 false；角度为弧度。clientTick 只作容差验证，不允许客户端要求过去重演或未来加速。断线/失焦使用 cancelFire，普通松开 fire 仍表示主动释放激光蓄力。

state：

    {
      version: 12, type: "state", matchId, epoch, snapshotSeq,
      snapshot: { kind: "network", version, mapId, matchId, epoch, tick, status, winnerId,
                  nextBullet, nextEvent, entities, bullets, pickups },
      events: [ { eventId, tick, epoch, type, ... } ],
      ack: [ { entityId, seq } ]
    }

广播状态不含 AI brain 或 pluginManifest，握手时已核对完整配置。完整检查点包含 AI 路径与配置清单；Battle.restore 拒绝 kind: "network" 的广播状态。两者均可 JSON 序列化。单包上限 64 KiB，事件历史保留最近 256 条，重复事件不会重复播放；长期离线客户端只能依靠完整快照恢复当前状态，不保证补播所有历史特效。

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

## 计分赛与补给（v12）

权威核心负责五分钟/15 次击毁结束、四秒复活、两秒保护（开炮解除）、40 装甲维修和六秒加速；玩家不能通过输入直接指定生命、分数、补给或复活时间。snapshot 新增 pickups，实体新增 deaths、respawnAt、protectedUntil、boostUntil、forfeited；damage 事件附带实际伤害 amount，新增 respawn/pickup 事件。离场与重连超时会设置 forfeited，避免退出者反复复活。联机大厅的准备、返回大厅和新 epoch 再开局流程保持适用。

当前协议 v12 包含 ability 布尔输入与 ability 事件。护盾、临时屏障、最近交火 tick、技能有效期、冷却和按键边沿状态全部由权威核心维护并进入快照，检查点恢复时保留。激光插件为 2.2.1，其余原五个插件为 2.1.1，人类和火箭筒插件为 1.0.1，握手拒绝旧清单。维修包随装甲数值调整为 40。

## 联机输入与同步超时修复

- 服务端输入队列保留 ability 的按下/松开变化，与 fire 一样按顺序消费。同状态的瞄准更新仍可合并；cancelFire 清空待执行操作，队列上限仍为 8。
- 前台游戏更新时检查权威 tick 是否推进。1.5 秒没有推进则暂停本机输入、尝试发送一次取消操作并显示提示；随后不再用旧 tick 持续发送输入。相同 tick 的快照不能重置超时。
- 5 秒未推进则关闭旧连接，通过现有重连凭证流程重新连接。短暂卡顿后收到更新快照会提示“已恢复”，保留操作暂停直到点击继续；重连首帧走原有 onMatch 流程并清空本机按键。
- 手动暂停不会被普通快照自动解除；大厅与已结算对局不触发战斗同步超时。输入修复的行为在 v12 中保留；本次广播结构调整需要 v12 握手。

## 当前反作弊与实测边界

已实现单连接限流、序号/连接/对局校验、服务器权威结算、Origin 检查和静态文件允许列表。Origin 检查与插件清单核对不等于用户身份认证或反作弊证明。当前广播状态仍下发所有敌人位置，缺少可见性过滤、按 IP 的连接/建房限制和自动瞄准异常检测。没有账号或持久化战绩系统。

先做两台设备的真实 WebSocket 联调，再验证 8 人、弱网、代理、Redis 和重启恢复。118 项自动化测试是模拟验证，不能证明这些部署场景已通过。

## 人类移动与爆炸判定

moveYaw 是人类相对镜头移动的参考方向，使用与 aimYaw 相同的有限弧度校验；不允许客户端直接上传位移。服务器归一化移动方向、限制速度、执行闪避及坡面碰撞。新增 explosion 事件只驱动画面，直击和范围伤害、距离衰减、遮挡、自伤及击毁归属由核心计算。完整快照仍包含权威实体及火箭弹状态。

## 公开房间列表

`GET /api/rooms` 返回 `{ version: 12, rooms: [{ code, hostName, players, capacity, phase, joinable }] }`，响应禁止缓存。只列出当前权威服务进程管理的房间，不扫描其他实例；人数包含断线保留的席位。phase 为 lobby / playing / finished，只有 lobby 且人数小于 8 时可加入。列表不返回 token、连接 ID、玩家明细或检查点。

浏览器在菜单可见且尚未加入房间时每 5 秒查询，支持手动刷新、空列表、错误提示与超时恢复。点击加入仍通过原 WebSocket join，服务器重新校验版本、容量和阶段，避免列表刷新后房间已开局或满员的竞态。创建房间继续使用原 create 流程。此功能新增 HTTP 接口，协议与 Redis 前缀保持 v12；需要重启 Node 服务加载接口。

## 坡道下穿（v12）

移动层与 AI 导航共用坡底净空检查。下穿单位保留原 floor、平地 y、rampId: null、rampDir: 0；坡上单位仍保留连续高度与 rampId。无需增加客户端位置字段或新的输入。快照校验拒绝位于低净空坡底的非法平地实体，网络副本与服务端检查点均适用。行为变化提升协议到 v12，防止旧移动规则客户端或检查点混用。

## 指定出口下落（v12）

新增由服务器生成的 falling、fallVelocity、fallVX、fallVZ，完整检查点和网络状态均包含这些字段。falling 时 floor 保留离开层，y 连续减少，落地后更新 floor/y 并清空速度；rampId 始终为 null。按 60 Hz 计算重力 20 m/s²、终端下落速度 30 m/s，水平惯性取驶出瞬间速度，边界处停止对应水平分量。输入仍只有操作，不能上传空中位置或速度。

新增 fallStart / land 事件只驱动提示及特效，移动和射击结算始终由服务器计算。校验拒绝向上速度、超速、坡道与下落混用及错误高度。Replica 对三维位置插值，恢复检查点保留空中惯性；断开操作不会暂停下落。AI 不主动规划下落口。

## 瞄准反馈与宽光束（v12）

红色瞄准标记由客户端可见场景射线产生，不作为命中请求发送。真实命中仍由服务器根据瞄准输入、炮口和 ray 武器 beamRadius 计算，伤害/射程不变。beam 事件新增 radius（0–1 米，未声明宽度的旧式 ray 为 0），由副本校验并用于显示。激光插件 2.2.1；协议和 Redis 前缀升级 v12。
