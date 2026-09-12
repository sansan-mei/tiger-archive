# 多人接入边界（协议 v25）

## 已实现

- FFA 2–8 人；PvE 1–8 人及最多 16 个内部僵尸槽位。稳定字符串 ID，controller 为 human 或 bot。
- 车体与武器来自统一目录；FFA 开局确定配置，PvE 只允许权威奖励流程换装，不接受原始输入修改配置。
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

1. new Authority({ participants, matchId, epoch, mode }) 创建对局。mode 默认 pvp，participants 为 2–8 人；pve 允许 1–8 人并固定人类＋小手枪。
2. attach(peerId, entityId) 将经过外部房间验证的连接绑定到 human 实体，返回 welcome。
3. receive(peerId, packet) 校验输入并保留最新有效命令。
4. authority.battle.start() 开始模拟。
5. step() 推进一个固定 tick。外部驱动负责按真实累计时间保持 60 Hz；不要按收到网络包的次数推进。
6. statePacket({ network: true }) 返回用于 FFA 20 Hz / PvE 10 Hz 广播及客户端重连的状态包。默认 statePacket() 保留完整快照供本地会话使用；服务端恢复使用 Battle.snapshot() 完整检查点。
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

    { version: 25, type: "welcome", pluginManifest, matchId, epoch, entityId, connection, tickRate: 60 }

input：

    {
      version: 25, type: "input", matchId, epoch, connection,
      seq, clientTick,
      input: {
        forward, reverse, left, right, brake, fire, interact,
        aimLeft, aimRight, cancelFire, ability,
        aimYaw, aimPitch, moveYaw
      }
    }

ability 表示技能按键状态，由服务器检测按下边沿并执行冷却。interact 为兼容保留字段，不再负责上下楼；页面使用鼠标瞄准，不绑定 aimLeft / aimRight 按键。布尔字段可省略，默认 false；角度为弧度。clientTick 只作容差验证，不允许客户端要求过去重演或未来加速。断线/失焦使用 cancelFire，普通松开 fire 不取消或提前完成激光预热。

state：

    {
      version: 25, type: "state", matchId, epoch, snapshotSeq,
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

## 计分赛与补给（v14）

权威核心负责八分钟/15 次击毁结束、四秒复活、两秒保护（开炮解除）、40 装甲维修和六秒加速；玩家不能通过输入直接指定生命、分数、补给或复活时间。snapshot 新增 pickups，实体新增 deaths、respawnAt、protectedUntil、boostUntil、forfeited；damage 事件附带实际伤害 amount，新增 respawn/pickup 事件。离场与重连超时会设置 forfeited，避免退出者反复复活。联机大厅的准备、返回大厅和新 epoch 再开局流程保持适用。

协议 v14 引入 ability 布尔输入与 ability 事件，该能力在当前 v25 继续保留。护盾、临时屏障、最近交火 tick、技能有效期、冷却和按键边沿状态全部由权威核心维护并进入快照，检查点恢复时保留。车体 light/medium/heavy 2.2.0、human 1.0.1；武器 standard 2.2.1、rapid 2.1.4、laser 2.5.0、rocket 1.0.3，握手拒绝旧清单。维修包随装甲数值调整为 40。

## 联机输入与同步超时修复

- 服务端输入队列保留 ability 的按下/松开变化，与 fire 一样按顺序消费。同状态的瞄准更新仍可合并；cancelFire 清空待执行操作，队列上限仍为 8。
- 前台游戏更新时检查权威 tick 是否推进。1.5 秒没有推进则暂停本机输入、尝试发送一次取消操作并显示提示；随后不再用旧 tick 持续发送输入。相同 tick 的快照不能重置超时。
- 5 秒未推进则关闭旧连接，通过现有重连凭证流程重新连接。短暂卡顿后收到更新快照会提示“已恢复”，保留操作暂停直到点击继续；重连首帧走原有 onMatch 流程并清空本机按键。
- 手动暂停不会被普通快照自动解除；大厅与已结算对局不触发战斗同步超时。输入修复的行为在 v14 中保留；本次广播结构调整需要 v14 握手。

## 当前反作弊与实测边界

已实现单连接限流、序号/连接/对局校验、服务器权威结算、Origin 检查和静态文件允许列表。Origin 检查与插件清单核对不等于用户身份认证或反作弊证明。当前广播状态仍下发所有敌人位置，缺少可见性过滤、按 IP 的连接/建房限制和自动瞄准异常检测。没有账号或持久化战绩系统。

先做两台设备的真实 WebSocket 联调，再验证 8 人、弱网、代理、Redis 和重启恢复。141 项自动化测试是模拟验证，不能证明这些部署场景已通过。

## 人类移动与爆炸判定

moveYaw 是人类相对镜头移动的参考方向，使用与 aimYaw 相同的有限弧度校验；不允许客户端直接上传位移。服务器归一化移动方向、限制速度、执行闪避及坡面碰撞。新增 explosion 事件只驱动画面，直击和范围伤害、距离衰减、遮挡、自伤及击毁归属由核心计算。完整快照仍包含权威实体及火箭弹状态。

## 公开房间列表

`GET /api/rooms` 返回 `{ version: 25, rooms: [{ code, hostName, players, capacity, phase, joinable }] }`，响应禁止缓存。只列出当前权威服务进程管理的房间，不扫描其他实例；人数包含断线保留的席位。phase 为 lobby / playing / finished，只有 lobby 且人数小于 8 时可加入。列表不返回 token、连接 ID、玩家明细或检查点。

浏览器在菜单可见且尚未加入房间时每 5 秒查询，支持手动刷新、空列表、错误提示与超时恢复。点击加入仍通过原 WebSocket join，服务器重新校验版本、容量和阶段，避免列表刷新后房间已开局或满员的竞态。创建房间继续使用原 create 流程。此功能新增 HTTP 接口，协议与 Redis 前缀保持 v14；需要重启 Node 服务加载接口。

## 坡道下穿（v14）

移动层与 AI 导航共用坡底净空检查。下穿单位保留原 floor、平地 y、rampId: null、rampDir: 0；坡上单位仍保留连续高度与 rampId。无需增加客户端位置字段或新的输入。快照校验拒绝位于低净空坡底的非法平地实体，网络副本与服务端检查点均适用。行为变化提升协议到 v14，防止旧移动规则客户端或检查点混用。

## 平台边缘下落（v14）

四周外缘均可驶出，服务器按车体中心越过平台边界触发下落，不读取客户端指定落点。rules.edgeFall 纳入插件清单，旧规则客户端及检查点通过已有不兼容流程处理；Redis 前缀不变。

新增由服务器生成的 falling、fallVelocity、fallVX、fallVZ，完整检查点和网络状态均包含这些字段。falling 时 floor 保留离开层，y 连续减少，落地后更新 floor/y 并清空速度；rampId 始终为 null。按 60 Hz 计算重力 20 m/s²、终端下落速度 30 m/s，水平惯性取驶出瞬间速度，边界处停止对应水平分量。输入仍只有操作，不能上传空中位置或速度。

新增 fallStart / land 事件只驱动提示及特效，移动和射击结算始终由服务器计算。校验拒绝向上速度、超速、坡道与下落混用及错误高度。Replica 对三维位置插值，恢复检查点保留空中惯性；断开操作不会暂停下落。AI 不主动规划下落口。

## 瞄准反馈与宽光束（v14）

红色瞄准标记由客户端可见场景射线产生，不作为命中请求发送。真实命中仍由服务器根据瞄准输入、炮口和 ray 武器 beamRadius 计算，伤害/射程不变。beam 事件新增 radius（0–1 米，未声明宽度的旧式 ray 为 0），由副本校验并用于显示。激光插件 2.4.0；协议和 Redis 前缀升级 v14。

## 固定延时激光

协议 v14，trigger=delayed。fire 按下边沿启动 charge 计时，普通松开后仍由权威核心继续推进至 90 tick，固定 power=1 发射。预热状态沿用快照 charge 字段，恢复后接着计时；不接受客户端指定伤害或发射时刻。长按只打一发，冷却期间按下不排队；cancelFire、超时、断线与死亡清空预热。激光插件 2.4.0，Redis 前缀 tiger:rooms:production。

## 强化弹状态（v14）

快照/广播实体新增 criticalProgress，范围 0 到对应武器 criticalHits；非强化武器和死亡单位必须为 0。弹丸新增 critical 布尔值及 ownerLife（发射时射手死亡次数）。副本检查弹丸伤害与强化标记匹配、生命编号不超过当前死亡次数；标准炮普通弹只能为 35，强化弹只能为 70。

shot/damage 事件携带 critical 布尔标记用于表现。服务器在有效普通弹直接命中时积攒，发射强化弹时消耗；进度与在途强化弹都保存在检查点，恢复不重复计算。客户端输入不接受 critical 或 criticalProgress。协议 v14 与 standard 2.2.0 清单拒绝旧客户端/检查点，Redis 前缀 tiger:rooms:production。

部署恢复策略更新：Redis 默认使用固定前缀 `tiger:rooms:production`，以后无需随协议更新改前缀。已有自定义前缀可保持原值。不兼容检查点备份到 `:checkpoint:previous`（24 小时、最近一份）后启动空大厅；损坏数据、Redis 故障与锁冲突仍报错。单文件构建命令为 `docker-compose build tank`，详见 [DEPLOY.md](DEPLOY.md)。

## 联机平滑播放与诊断

NetworkSession 维护最多 32 个已验证快照，以服务器 tick 建立连续播放时间线，预留约 100 ms（两个广播间隔）吸收收包抖动，按缓冲余量以 0.9–1.1 倍速轻微纠偏。新包不重置播放位置；网络渲染不做越过最新快照的外推，短时断流最多追到最新状态后停住。长时间挂起导致缓冲溢出时允许向前恢复；welcome 清空旧时间线。current() 仍提供最新权威数据，死亡/复活不在两种生命状态间插值。本地训练保持原有插值方式。

界面显示 FPS、WebSocket 往返延迟及距上次收包时间。活动期间每 2 秒发送一个 ping，服务器已有 pong 接口复用，不改快照结构或 Redis 前缀。当前没有本机预测，公网 RTT 与播放缓冲仍会增加操作反馈等待；激光固定预热仍是武器机制。不能把本次平滑修复视为消除了公网延迟。

## 取消常驻护盾与激光装填调整

轻/中/重甲插件 2.2.0 的 shield 均为 0，人类保持 0；不再自动恢复护盾。保留 shield 字段以兼容现有数据结构，但当前单位的快照校验不允许正值。只有中甲应急屏障提供 60 点 barrier（4 秒、冷却 12 秒），重甲部署仍是正面装甲减伤，不再显示能量盾。激光插件 2.4.0：100 伤害、90 tick 预热、102 tick 装填。协议结构仍 v14，插件清单变化会拒绝旧客户端；Redis 前缀不变，不兼容的旧房间检查点按现有策略备份后重置。

## v15：僵尸合作生存

create 新增可选 `mode: "pvp" | "pve"`，缺省 pvp；房间目录、room 消息、Redis 房间记录携带 mode。PvE 加入后强制 human / pistol，不允许大厅 loadout 修改；单人准备即可开始。PvP 的 2 人起步与 8 人上限保持。

升级命令：`{ type: "upgrade", epoch, wave, choice }`。choice 只能来自当前玩家该波的 choices；拒绝旧 epoch、重复领取、其他席位与未提供的奖励。客户端只提交选择，服务器计算装填、回复及脉冲伤害。PvE 状态校验限制玩家数 8、僵尸槽位 16、待生成数 64、被动等级 0–3，以及角色类型和敌人控制器；客户端不能添加僵尸或改血。

现有 Redis 前缀继续使用，无需手动轮换。v14 检查点因协议与内容清单不兼容，按已有逻辑归档到 previous（24 小时）后清空旧对局；v15 检查点可恢复波次/奖励/敌人位置，恢复后仍按现有 30 秒重连窗口处理。

## v16：类型与动态血量

PvE 状态新增 teamSize（1–8），僵尸实体新增 zombieType（walker/cone/runner/bucket/brute）；两者都由服务器计算，不能从输入命令修改。副本校验类型解锁波次，并按类型和 teamSize 推导 maxHp 与移动上限，拒绝伪造类型、人数和生命。正式离场在下一模拟 tick 按剩余血量比例缩放，阵亡/断线宽限期不减少人数。

完整检查点保存类型、人数和已缩放生命，恢复不再次缩放；新版握手为 v16、zombie 插件 1.1.0。不兼容的 v15 检查点沿用归档后重置策略，Redis 前缀继续保持 tiger:rooms:production。

## v17：经验、流派与 Boss

升级命令变为 `{ type: "upgrade", epoch, wave, choice, offerId }`。offerId 每次发放选项时递增，拒绝双击/重发领到下一次升级；没有 offerId 的旧消息拒绝。pending 为每位玩家未使用的升级次数，choiceIds 绑定当前选项，choices 不再依赖波间截止时间。

新增共享 level/xp、持久化 rng、个人 hits、hazards/bursts 与 Boss spawned/defeated/nextAttackAt/telegraph；slowUntil 随实体广播。校验限制等级 20、每人待选次数 19、燃烧区 12、次爆队列 16、预警圈 8，校验所有者与数值边界。Boss 类型仅用于最终阶段，打败 Boss 才能获胜，8 分钟超时失败。

完整检查点恢复所有计时和随机状态；协议 v17、zombie 1.2.0，Redis 前缀保持 tiger:rooms:production。不兼容 v16 检查点按已有策略归档并重置。模拟仍为 60 Hz，PvE 广播 10 Hz。

## 穿透激光炮（laser 2.5.0）

激光仍由服务器按 140 米射程、0.45 米光束半径和固定 100 基础伤害判定。射线命中单位后不会终止，而是继续命中同一直线上的后续单位；每个单位每发最多命中一次。墙体、楼板、坡面与坡道结构仍是实体掩体，射线在最近的地形碰撞点停止，掩体后的单位不受伤。

一次发射可产生多个按射线距离排序的 impact/damage 事件，但只广播一条 beam 事件，其终点为最近地形或最大射程。客户端仍不能提交命中目标或伤害。激光改动时协议常量为 v20；激光插件升级到 2.5.0，插件清单用于拒绝旧规则客户端与检查点。

## v21：PvE 追击与 Boss 压制

感染者权威 AI 为同一目标复用六方向近战攻击位，Boss 独立直接追击；移动时忽略其他感染者的硬碰撞，但玩家与地形继续阻挡。连续受阻 12 tick 会立即废弃旧路径，并按感染者编号在随后最多 16 tick 内分帧重算，每个 tick 最多执行一次全图 A*；PvE 路径缓存从 240 tick 缩短为 90 tick，持续受阻时按编号选择不同倒车转向。该行为不增加网络输入字段，位置仍由服务端 60 Hz 模拟并通过既有快照广播。

Boss 红圈的 zone 新增服务端 radius，普通阶段为 6 米、半血狂暴为 7 米；预警统一为 60 tick，并按权威移动与地形规则逐 tick 预测玩家落点，包括坡面高度、墙体截停和下落惯性。范围伤害分别为 45/50，下一次预警等待分别为 180/120 tick。Boss 战每 180 tick 尝试补充一只普通或疾跑感染者，援军上限 `min(6, teamSize+2)`，沿用 16 个敌人槽位。Boss 移速、近战距离和伤害同步增强。协议升级 v21，zombie 插件 1.3.0，旧客户端及检查点按不兼容流程拒绝或归档。

## v22：武器专属成长路线

PvE 权威升级表为五种武器增加专属依赖链：手枪的贯穿/弹射/雷电、标准炮的震荡重弹/处决弹、快速炮的压制弹链/交叉火力、激光炮的广角透镜/等离子爆发、火箭筒的扩爆/燃烧/连锁殉爆。通用脉冲路线保留。

升级选项仍由服务端生成并用 offerId 防重放；完整检查点严格校验节点上限及前置依赖，不能伪造跳级。专属效果只在当前装备对应武器时触发，切换后保留已选节点但暂停生效。激光广角透镜会把权威 beam radius 从 0.45 增至 0.75；等离子爆发每次发射最多触发一次，避免穿透多目标时产生平方级事件。协议升级 v22，旧客户端及 v21 检查点按既有不兼容流程处理。

## v23：16 波与双 Boss

PvE 战役固定为 16 波。第 8 波生成 `boss`（零号感染体），击败后 `boss.stage` 保持 1、`spawned` 回落为 false，休整后继续第 9 波；第 16 波生成 `titan`（泰坦感染体），只有击败泰坦才设置 `defeated` 并结算胜利。第 9～15 波及第 16 波援军禁止生成 walker，重锤巨人从第 9 波解锁。普通波预分配 16 个普通敌人槽位并保留 1 个专用 Boss 槽位。

泰坦使用独立生命、速度、近战与红圈配置：基础生命 2200，普通/狂暴红圈为 9/11 米、60/70 伤害，75 tick 预警，等待 150/90 tick；零号感染体继续使用 6/7 米、45/50 伤害和 60 tick 预警。检查点新增 `boss.stage` 并校验波次、活跃 Boss 类型、胜利状态和允许的红圈半径；PvE 时限从 8 分钟扩为 16 分钟，FFA 仍保持 8 分钟，客户端根据模式显示对应倒计时。协议升级 v23，zombie 插件升级 1.4.0。

## v24：双 Boss 检查点加固

检查点不再只校验 `finished/result` 是否同时出现：`victory` 必须绑定 `boss.stage===2 && spawned && defeated`，并且必须存在已死亡泰坦。第 8 波 Boss 击败后，专用 Boss 槽位保留已死亡 `boss` 作为阶段历史；第 9～15 波拒绝仍处于活跃状态的中期 Boss。普通怪继续使用独立的 16 个槽位，因此后半程并发上限不降级。实体池结构变化使协议升级为 v24，v23 检查点按不兼容流程处理。

## v25：PvE 地面专用地图

共享核心新增 `PVE_MAP / mapForMode()`。正式 PvE 仅保留第 1 层地面、地面掩体、地面补给和 8 个投影到地面的合法出生点，`levels` 仅一项，`ramps/dropExits` 为空；FFA 和本地训练继续使用完整三层 `MAP`。快照按模式校验 mapId、补给列表、楼层、高度和坡道状态，PvE 拒绝伪造上层实体或坡道状态。客户端场景隐藏二三楼、全部坡道几何与坡道植被，摄像机、瞄准碰撞和小地图使用同一模式地图。地图 ID 与规则变化使协议升级为 v25，v24 检查点按不兼容流程处理。
