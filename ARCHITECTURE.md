# 项目架构

当前采用分模块的 JavaScript 单体：浏览器负责操作和表现，Node 负责联机权威模拟。保留 CommonJS / 浏览器双入口，不引入打包器、ECS 框架或额外服务。协议 v9；开发规则以共享核心为准。

## 数据流

```text
键盘 / 鼠标 → client/input → LocalSession 或 NetworkSession
                              ↓                 ↓ WebSocket
                          Authority ← RoomServer
                              ↓ 60 Hz
                            Battle
                              ↓ 状态 + 事件
                            Replica
                              ↓ 插值
                 场景 / 单位 / 镜头 / HUD / 特效
```

本地训练也经过 Authority / Replica。渲染只读取副本，不能直接修改权威血量、位置、命中或分数。联机服务器只接收操作输入，按连接绑定玩家并校验。

## 模块职责

| 入口 | 修改范围 |
|---|---|
| battle-core.js | Battle 生命周期、实体初始化、快照与恢复、固定 tick 调度；保留原有公共方法 |
| core/content.js | 规则、规范化配置、输入定义与配置清单 |
| core/abilities.js | 技能持续时间、冷却、速度、屏障及减伤参数；共用描述生成 |
| core/map.js / math.js | 地图数据与通用数学、相交计算 |
| core/world.js | 地面高度、坡道、移动碰撞、射线遮挡 |
| core/movement.js | 单位每 tick 操作、技能、移动及开火状态推进 |
| core/combat.js | 发射、直接伤害、爆炸与击毁归属 |
| core/ai.js | AI 目标、导航与操作生成 |
| core/match.js | 弹丸推进、复活、补给、赛制结束 |
| core/network-state.js | 显式广播实体字段清单及状态投影 |
| battle-session.js | Authority / Replica / LocalSession、输入和快照校验、消息顺序 |
| room-server.js | 房间席位、准备与开局、重连及检查点 |
| server.js / redis-store.js | HTTP / WebSocket 生命周期；可选 Redis 存储与租约 |
| battle.js | 页面初始化、会话切换、大厅、事件协调及帧循环 |
| client/scene.js / units.js | 静态世界和动态单位表现 |
| client/camera.js / input.js | 追尾镜头、鼠标俯仰和操作采集 |
| client/rooms.js | 公开房间列表、可见时刷新及加入入口，不建立对局连接 |
| client/hud.js / effects.js | HUD / 小地图；音效及特效构造 |
| plugins/ / tank-model.js | 单位和武器配置、可信外观钩子及模型组装 |

核心系统接受 Battle 状态并由 Battle 调用，不能依赖 DOM、Three.js、WebSocket 或 Redis。客户端模块由工厂创建，使用显式参数和会话 getter，切换本地/联机后仍读取当前会话。Battle 中的薄委托方法用于保留调用边界，不是另一套规则实现。

每个 tick 的顺序保持：单位输入与动作 → 复活/补给 → 弹丸 → 比赛结束。调整顺序会改变玩法，必须同步回归测试。

## 单一配置来源

- 单位及武器参数放在各自插件；技能参数放在 core/abilities.js，注册器派生插件的技能时间字段。
- UI 技能说明、模拟参数和状态校验使用同一份技能定义。
- app-manifest.js 维护插件列表与浏览器脚本依赖顺序；Node catalog、顺序加载器和 HTTP 静态白名单共同读取。服务私有文件不会因为增加目录而自动公开。
- client/bootstrap.js 按依赖顺序加载，失败时停止并显示具体资源错误。新增普通插件只需加入 manifest.plugins；新增其他浏览器模块需放在 manifest.scripts 的正确位置。
- README 数值表从配置生成：`node scripts/balance-docs.cjs --write`。此命令只写文档，测试会检查内容是否过期。

## 广播与恢复分离

`Battle.snapshot()` 是完整权威检查点，包含 AI brain、配置清单和模拟状态；用于本地会话及服务端恢复。`Battle.networkSnapshot()` 投影为 `kind: "network"` 状态，不携带 AI brain 和重复配置清单。RoomServer 使用 `Authority.statePacket({ network: true })` 广播和同步重连客户端。

Replica 在 welcome 时核对配置清单，随后校验网络字段、版本、对局、序号和 tick。Battle.restore 明确拒绝网络状态；Redis 恢复仍验证完整检查点。配置清单覆盖插件、技能和赛制规则，但不是源代码签名。

当前投影仍先创建完整快照，因此本次主要减少广播内容，没有宣称降低服务端模拟或序列化成本。广播依然包含全部敌人位置，不提供可见性反作弊。没有新增预测、延迟补偿、多实例调度或账户系统。

## 常见扩展

新增单位/已有机制武器：创建插件 → 加入 app-manifest.js → 添加组合及行为测试 → 生成数值表 → 更新 PLUGINS.md。已有弹丸、射线、蓄力与爆炸可组合复用；新机制需修改对应核心系统，不能把权威逻辑放进外观钩子。

新增技能：在 abilities.js 定义参数 → 在 movement/combat 中实现行为（如现有机制不能表达）→ 检查状态字段和校验 → 接入表现与测试。不要在 HUD 中复制冷却、持续时间或伤害常量。

新增状态字段：同时评估初始化、完整快照恢复、validateSnapshot、网络字段清单、Replica 渲染及旧协议兼容性。AI 私有字段留在检查点，不要自动展开到广播对象。

改地图：从 core/map.js 开始，再检查 world 碰撞、ai 导航与 scene 表现是否支持该几何。当前是简化坡道与多层碰撞，不是任意物理引擎。

## 验证与升级

轻量回归：`node --test tests/*.test.cjs`。架构测试保留拆分前 900 tick 的完整模拟结果，排除版本和清单格式后逐字段比对；其余用例覆盖规则、传输、插件和页面替身。更新基准必须确认玩法变化，不能只为让测试通过而重录。

本次协议升级为 v9，Redis 默认前缀 tiger:rooms:v9。更新后需要重启服务并刷新客户端，旧检查点不能直接迁入。Dockerfile 已复制 core/ 和 client/ 等运行文件，但本次没有构建或启动服务。真实 WebGL、异机联机及 Redis / Docker 验收范围见 VERIFICATION.md。
