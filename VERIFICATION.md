# 本轮验证记录

直坡驾驶改造后：62 项自动测试通过，0 项失败。

执行过的轻量检查：

- node --test --test-reporter=spec tests/*.test.cjs
- 全部 23 个项目 JS/CJS 文件的 node --check
- HTML 本地资源、重复 ID、画面代码引用的元素检查
- package.json 与 package-lock.json 依赖一致性、Docker COPY 来源文件检查
- docker compose --env-file .env.example config --quiet（通过，只解析配置）

覆盖范围：

- 原有 9 种车体/武器组合、驾驶瞄准、弹丸/激光、跨层碰撞、四条可驾驶直坡、坡上停车/倒车/交战、楼板开口与坡面挡弹、AI、确定性快照。
- 8 人房间、准备/房主权限、容量、插件核对、重连凭证、输入短按边沿、离开淘汰、房间隔离、重开 epoch。
- 浏览器 NetworkSession 与 RoomServer 通过内存传输替身连接，验证驾驶和仅暂停自身操作。
- 使用真实 Three.js 场景对象、DOM 与渲染器替身执行页面逻辑，验证创建房间、开局、快照渲染调用、直接驾驶上下坡、键盘不转炮塔、离开回本地。
- HTTP 请求处理器通过流替身验证静态资源与健康检查；WebSocket 事件适配层通过事件替身验证收发和断开。
- Redis 客户端替身验证独占租约、保存、失去租约拒写、释放和超时；真实战斗检查点的恢复与清空操作。

没有执行：真实端口监听、Redis 网络连接、Docker build / compose up、实际浏览器 WebGL 视觉验收、两台机器或 8 人公网测试。浏览器此前的本地文件策略限制未被绕过。替身测试不证明真实网络握手、Redis Lua 执行或 Docker 运行已通过。

部署后待验收：通过服务器网址两人加入，移动/开火/连续斜坡驾驶，暂停仍可受击，断线 30 秒内恢复、超时淘汰，Redis 启用后的容器重启恢复，以及弱网操控延迟。步骤见 DEPLOY.md。

直坡专项覆盖：所有车体通过全部四条坡道并倒回；禁止侧面驶入/驶出；坡上坦克仍可被命中；坡中快照恢复保持确定性；伪造坡上高度被拒绝；AI 实际爬坡到达上一层。旧自动楼梯测试已由这些用例替换，因此测试数与上一版不同。协议升级至 v4，Redis 默认前缀为 tiger:rooms:v4。

鼠标镜头修复：UI 替身测试验证固定 clientX/clientY 下使用 movementX 连续旋转超过 360°、俯仰保持固定枢轴和半径、释放指针锁定后暂停操作。真实浏览器 Pointer Lock 授权与手感仍需用户刷新后验收。

## 2026-09-09：计分混战、补给与反馈

- `node --test tests/*.test.cjs`：68/68 通过，约 10 秒。随后增加 AudioContext mock 检查并再次通过 UI 专项；`node --check battle.js`、`node --check battle-core.js` 和 `git diff --check` 通过。
- 新增用例覆盖四秒复活、空闲出生点等待、两秒保护与开炮解除、离场不复活、15 次击毁结束、时间到平局与死亡数破同分、跨楼层补给判定、加速实际速度、20 秒补给刷新、补给/复活快照恢复与非法数据拒绝。
- 原完整比赛测试已按五分钟计分制更新；保留坡道驾驶、AI 跨楼层寻路、相机 360 度和固定支点俯仰的回归测试。
- UI 测试使用真实 Three.js 数学和几何、模拟 DOM/WebGLRenderer/WebSocket/AudioContext，检查死亡不弹出阻塞菜单、自动复活、计分板、结算与音频参数。它不替代真实浏览器渲染或试听。
- 本轮实际浏览器检查被环境阻挡：Mac 锁屏，浏览器连接报告 unsupported Codex auth method: apikey。没有启动服务、构建镜像或进行真实 Redis/异机八人测试。
- 协议 v5，地图 summer-crossfire-v3；Redis 默认前缀 tiger:rooms:v5。重启 Node 并刷新全部客户端后生效，旧协议对局不能恢复为本版。
