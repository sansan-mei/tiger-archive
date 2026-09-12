# 机甲与武器插件（API v1，协议 v25）

当前实现为随游戏发布的可信 JavaScript 模块，不提供第三方代码上传或运行时热加载。支持 4 种玩家单位 × 5 种武器自由组合；当前属性及击毁枪数以 [README.md](README.md) 为准。

## 结构

- plugins/registry.js：注册、参数校验、冻结目录、生成稳定配置清单。
- plugins/tanks/light.js、medium.js、heavy.js：各自的车体参数、炮塔安装位置及外观钩子。
- plugins/tanks/common.js：三种履带车体共用的几何零件。
- plugins/weapons/standard.js、rapid.js、laser.js：各自的参数、触发方式、攻击类型及外观钩子。
- app-manifest.js：唯一的可信插件和浏览器脚本清单；plugins/catalog.js、client/bootstrap.js 和 HTTP 静态白名单均读取它。
- tank-model.js：组装车体、公共炮塔与武器，统一管理轮子、后坐力、保护轮廓与资源释放。

车库从 PLAYER_TANKS 与武器目录生成选项，武器音效也读取插件属性。战斗核心不按某个武器 ID 分支。

## 插件契约

每个插件声明 kind（tank / weapon）、唯一 id、version（三段数字）、apiVersion: 1、spec 和 buildVisual(ctx)。加载顺序由 app-manifest.js 维护：技能定义 → 注册器 → 共用零件 → 各插件 → 核心 → 会话与画面。core/content.js 加载时 seal() 锁定目录，开局之后无法注册。

车体 spec 包含 name、hp、shield、ability、speed、reverse、accel、turn、radius、scale、mount。mount 是模型坐标中的炮塔安装位置；碰撞仍采用核心的简化车体包围盒，不直接使用网格几何。当前地图对车体半径限制为 0.6–3.1 米，新增超大车体需同时修改地图、碰撞和验证边界。

shield 为基础护盾上限；ability 对应 core/abilities.js 的 dash、barrier、deploy、dodge 定义。注册器从该表派生 abilityCooldown 和 abilityDuration（60 Hz tick），插件不再单独声明技能时间。冲刺速度、临时屏障、部署减伤、UI 文案及快照验证上限共用该表。新增技能机制需要扩展对应模拟系统、显示和测试，不能只加一个插件文件。

武器 spec 包含 name、damage、cooldown、speed、life、charge、minCharge、muzzle、range、minPower、trigger、delivery、sound。

- trigger: automatic 表示按住持续发射；charge 保留按住蓄力、松开部分发射的通用行为；delayed 表示点击后固定等待再发射，内置激光使用此模式。
- delayed 要求 charge > 0、minCharge = charge、minPower = 1；按下边沿开始，松开不提前发射，发射 power 恒为 1。
- delivery: projectile 表示飞行弹丸，ray 表示瞬时射线。这两个维度可独立组合。
- cooldown / life / charge / minCharge 的单位为 60 Hz tick；速度为米/秒。
- range 只用于射线；弹丸射程由 speed、life、地图范围共同决定。
- 对 charge 模式，minPower 为最低有效蓄力时伤害公式的基底：minPower + (1 - minPower) × charge / 最大 charge。
- sound: cannon / energy，选择渲染端音效。

插件声明攻击行为，由核心统一处理冷却、蓄力、射线/弹丸、伤害、死亡归属和坡面碰撞。外观钩子只接收几何构造工具和场景对象，不接收权威 Battle。新的自动炮、蓄力弹丸炮、即时射线炮都可用已有行为组合；追踪导弹等新机制需要先为核心增加受控行为及测试。

这些模块是可信项目代码，buildVisual 不是安全沙箱。

## 新增武器示例

创建 plugins/weapons/pulse.js，在 rapid.js 之后、核心之前加载：

```js
(function(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../registry.js') : root.TankPlugins;
  registry.register({
    ...registry.weapons.rapid,
    id: 'pulse',
    version: '1.0.0',
    spec: {
      ...registry.weapons.rapid.spec,
      name: '脉冲炮',
      damage: 24,
      cooldown: 30,
      delivery: 'ray',
      range: 90,
      sound: 'energy'
    }
  });
})(typeof window === 'undefined' ? globalThis : window);
```

该示例复用快速炮外观，也可以覆盖 buildVisual(ctx) 自建模型。然后在 app-manifest.js 的 plugins 数组添加路径；Node、浏览器和静态白名单自动同步。车库会自动出现新选项；enemyOnly 车体不会显示。现有默认玩家与 AI 预设仍使用八个内置插件；删除或重命名它们时需同步调整默认配置。

## 联机一致性

协议当前为 v25。握手及完整检查点携带 pluginManifest，包含稳定序列化的插件 ID、版本、API 版本、配置，以及共用技能和赛制规则。握手与恢复拒绝不一致清单。网络广播不重复清单和 AI brain；Replica 在已核对的握手后验证广播字段。

这是配置一致性检查，不是代码签名或反作弊证明。修改行为或外观代码必须提升相应插件版本；修改共享模拟行为需评估协议兼容性。权威服务器只运行自身部署的可信插件。create / join / resume 也核对清单。新增普通插件只需更新 app-manifest.js，不再分别修改浏览器、Node 和 server.js 三份列表。

## 新增模块

- plugins/tanks/human.js：人类，版本 1.0.1；movement: strafe、muzzleScale: 0.55、height: 2.8。移动参考由 moveYaw 输入提供，伤害碰撞体采用更小半径及指定高度。
- plugins/weapons/rocket.js：火箭筒，版本 1.0.2；damage: 20、splashDamage: 80、splashRadius: 6。爆炸参数需同时提供，且只能用于 projectile 类型；权威核心统一处理二次伤害和遮挡。
- 共用清单已包含两者。车体 light/medium/heavy 2.1.1、human 1.0.1；武器 standard 2.2.0、rapid 2.1.3、laser 2.3.1、rocket 1.0.2。插件几何上下文新增 limbs，可由渲染器驱动步行摆腿。

## 宽光束参数

ray 武器可声明 beamRadius，范围 0.05–1 米；省略则保持原细射线判定。只用于 ray，不适用于 projectile。激光插件当前为 2.5.0，设置 beamRadius: 0.45 和 penetratesBodies: true。核心对实体和遮挡物一起扩张判定，beam 事件携带 radius，显示层按同一半径绘制。当前协议 v25；车体 light/medium/heavy 2.2.0、human 1.0.1；武器 standard 2.2.1、rapid 2.1.4、laser 2.5.0、rocket 1.0.3。

## 卡通几何上下文

`buildVisual(ctx)` 只创建客户端外观，提供 `tankType`、`accent`、`ink`、`block/cylinder` 和 `weaponLength`。武器以局部 -X 为前向，从安装点延伸至 `-weaponLength`；工厂根据当前炮口距离和人类缩放计算长度。四把武器都用基础几何造型，不再提供外部模型加载接口。

静态几何按父节点与材质合并；轮子、腿、炮塔和武器保留动画枢轴。新增逐部件动画时应保留该部件为独立组，不把它当静态块合并。资源由每个 view 独立持有，切换配置时统一释放。

## 命中积攒强化弹

武器可声明 criticalHits（1–10 整数）和 criticalMultiplier（2–3 整数），仅支持无范围伤害的 automatic/projectile 武器。标准炮使用 2 和 2，普通/强化伤害为 35/70。省略这两个字段的武器不启用。从标准炮复制配置制作其他触发/投送类型时，应去掉这两个字段。

实体 criticalProgress 从零累加至 criticalHits；有效普通弹直接命中后累加，发射强化弹清零，强化命中不累加。弹丸持有 critical 和 ownerLife（发射时射手 deaths），防止前一条命的弹丸给新生命累积。表现层从快照读取进度，不能调用权威计数。

部署恢复策略更新：Redis 默认使用固定前缀 `tiger:rooms:production`，以后无需随协议更新改前缀。已有自定义前缀可保持原值。不兼容检查点备份到 `:checkpoint:previous`（24 小时、最近一份）后启动空大厅；损坏数据、Redis 故障与锁冲突仍报错。单文件构建命令为 `docker-compose build tank`，详见 [DEPLOY.md](DEPLOY.md)。

## PvE 感染者与小手枪

当前 zombie 1.4.0 / pistol 1.1.0，均为原创程序化外观。zombie 声明 enemyOnly: true，只能由 PvE 创建为 bot 实体；PLAYER_TANKS 排除它，TANKS 保留碰撞参数。感染者复用 standard 武器的冷却字段，但 AI 只做近战，不调用开火或 Shift 技能，模型不绘制枪械。

pistol 为 automatic/projectile，20 伤害、24 tick 冷却；玩家可在 FFA 自由组合，PvE 固定以 human/pistol 开局。PvE 被动和换装奖励由 core/pve.js 管理，不修改全局插件配置，因此不会影响同服务器的其他 PvP/PvE 房间。

僵尸通过 spec.variants 共享五种配置，外观钩子接收 zombieType；无需注册五个玩家车体。variants 参数进入插件清单，改动时应提升 zombie 插件版本。血量缩放系数来自 RULES.pveHealthPerPlayer，换装和人数不会修改冻结的插件基础数值。

## v17 Boss 与流派

僵尸 variants 新增 boss（1200 基础生命），仅由最终阶段生成，不加入普通波次权重。原创 Boss 外观使用红色重装、冠饰和重锤。经验及流派配置位于 core/roguelike，武器插件基础数值保持冻结；火箭范围加成按玩家局内被动生成临时参数，不修改全局插件。

## v23 双 Boss 与巨人阶段

zombie 1.4.0 将 boss 调整为第 8 波中期 Boss，并新增第 16 波 titan 最终 Boss。titan 使用紫色重甲、双肩尖刺和发光冠饰，与红色零号感染体保持独立轮廓；brute 改名重锤巨人并从第 9 波解锁。两个 Boss 仍由同一可信 zombie 插件注册，核心根据 variant 合并生命、速度、近战范围、伤害和冷却。

## v24 检查点一致性

PvE 预分配 16 个普通感染者槽位和 1 个专用 Boss 槽位。专用槽位会保留已死亡的第 8 波 Boss，供检查点校验中期阶段确实完成；第 16 波在同一槽位生成泰坦。胜利状态必须与已死亡泰坦一致，协议升级 v24。

## v25 PvE 地面地图

PvE 权威地图只保留地面层、地面掩体和补给，不注册坡道与高层；客户端地图、摄像机和小地图按 mode 使用同一份 `PVE_MAP`。插件目录和 zombie 1.4.0 不变，共享地图规则变化使协议升级为 v25。
