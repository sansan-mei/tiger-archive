# 车体与武器插件 v1

当前实现为随游戏发布的可信 JavaScript 模块，不提供第三方代码上传或运行时热加载。保留 3 种车体 × 3 种武器的原有数值与玩法。

## 结构

- plugins/registry.js：注册、参数校验、冻结目录、生成稳定配置清单。
- plugins/tanks/light.js、medium.js、heavy.js：各自的车体参数、炮塔安装位置及外观钩子。
- plugins/tanks/common.js：三种履带车体共用的几何零件。
- plugins/weapons/standard.js、rapid.js、laser.js：各自的参数、触发方式、攻击类型及外观钩子。
- plugins/catalog.js：Node 端可信插件加载清单；浏览器使用 index.html 中同一组脚本。
- tank-model.js：组装车体、公共炮塔与武器，统一管理轮子、后坐力、保护轮廓与资源释放。

车库从注册目录生成选项，武器音效也读取插件属性。战斗核心不按某个武器 ID 分支。

## 插件契约

每个插件声明 kind（tank / weapon）、唯一 id、version（三段数字）、apiVersion: 1、spec 和 buildVisual(ctx)。加载顺序必须是注册器 → 共用零件 → 各插件 → battle-core.js → 会话与画面。核心加载时 seal() 锁定目录，开局之后无法注册。

车体 spec 包含 name、hp、speed、reverse、accel、turn、radius、scale、mount。mount 是模型坐标中的炮塔安装位置；碰撞仍采用核心的简化车体包围盒，不直接使用网格几何。当前地图对车体半径限制为 1–3.1 米，新增超大车体需同时修改地图、碰撞和验证边界。

武器 spec 包含 name、damage、cooldown、speed、life、charge、minCharge、muzzle、range、minPower、trigger、delivery、sound。

- trigger: automatic 表示按住持续发射，charge 表示按住蓄力、松开部分发射或满蓄力自动发射一次。
- delivery: projectile 表示飞行弹丸，ray 表示瞬时射线。这两个维度可独立组合。
- cooldown / life / charge / minCharge 的单位为 60 Hz tick；速度为米/秒。
- range 只用于射线；弹丸射程由 speed、life、地图范围共同决定。
- minPower 为最低有效蓄力时伤害公式的基底：minPower + (1 - minPower) × charge / 最大 charge。
- sound: cannon / energy，选择渲染端音效。

插件声明攻击行为，由核心统一处理冷却、蓄力、射线/弹丸、伤害、死亡归属和坡面碰撞。外观钩子只接收几何构造工具和场景对象，不接收权威 Battle。新的自动炮、蓄力弹丸炮、即时射线炮都可用已有行为组合；追踪导弹、范围爆炸等新机制需要先为核心增加受控行为及测试。

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

该示例复用快速炮外观，也可以覆盖 buildVisual(ctx) 自建模型。然后在 plugins/catalog.js 的 seal() 之前添加 require，并在 index.html 的 battle-core.js 之前添加对应 script。车库会自动出现新选项。现有默认玩家与 AI 预设仍使用六个内置插件；删除或重命名它们时需同步调整默认配置。

## 联机一致性

协议已升级为 v4。welcome 和完整 snapshot 携带 pluginManifest，内容为按稳定顺序序列化的插件 ID、版本、API 版本及配置。Replica 握手、快照接收以及核心恢复均拒绝不一致清单。

这是配置一致性检查，不是代码签名或反作弊证明。修改行为或外观代码必须提升插件版本；权威服务器始终只运行自身部署的可信插件。房间服务已在 create / join / resume 请求中核对清单后绑定席位。新增插件时还要更新 server.js 的静态资源允许列表（以及浏览器和 Node 加载列表），以便 Docker 服务能够提供该脚本。
