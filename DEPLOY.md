# Docker 发布：已有 Redis + WebSocket

一个 Node.js 容器提供网页、模型、`/ws` 和 `/healthz`，容器内端口 8080。参考现有 file-server 的方式，使用镜像启动、`restart: always`，每 60 秒健康检查一次。无需 static 卷，网页和模型随镜像发布；房间检查点存入已有 Redis。

## 配置文件

| 文件 | 用途 |
|---|---|
| compose.yaml | 发布服务器拉取镜像启动；不包含 build，也不创建 Redis |
| compose.build.yaml | 可选：叠加到主配置，为镜像制作者提供本地构建配置 |
| compose.redis-network.yaml | 可选：游戏与 Redis 分属不同 Compose 项目时，加入已有 Redis 网络 |
| .env.example | 镜像名、宿主端口、游戏域名与 Redis 参数 |

默认镜像名 `1596944197/tiger-archive:latest` 是本次拟定的发布目标，尚未构建、推送或验证仓库存在。可以在 `.env` 的 TANK_IMAGE 中改成实际发布名；建议正式发布用固定版本标签，方便回滚。

## 服务器配置

```sh
cp .env.example .env
```

编辑 `.env`：

```dotenv
TANK_IMAGE=1596944197/tiger-archive:latest
HTTP_PORT=8080
BIND_ADDRESS=0.0.0.0
MAX_ROOMS=16
PUBLIC_ORIGIN=https://你的游戏域名
REDIS_URL=redis://redis:6379/0
REDIS_PREFIX=tiger:rooms:v14
```

- 当前应用参数为 **PUBLIC_ORIGIN 和 REDIS_URL**，不是 file-server 的 ALLOW_ORIGIN 和 REDIS_HOST。PUBLIC_ORIGIN 填游戏实际网址的协议、域名和可选端口，不带路径；不要直接照抄另一个服务的域名。
- 直接通过 IP:8080 访问时，PUBLIC_ORIGIN 可留空，WebSocket Origin 必须与 Host 一致。域名反代时建议明确填写实际源地址；代理要转发 WebSocket Upgrade，示例见下文。游戏部署在域名根路径，不支持 /tank/ 子路径。
- Redis 有认证时可用 `redis://default:URL_ENCODED_PASSWORD@redis:6379/0`；密码中的特殊字符需 URL 编码。不要将 .env 提交到 Git 或加入镜像。
- 默认使用已有的 `redis:6379`。显式写 `REDIS_URL=` 可切换纯内存模式；重启将丢失房间。
- 宿主端口 HTTP_PORT 可改，容器端口和健康检查仍为 8080。container_name 为 tiger-archive，不占用 file-server 的容器名和 3003 端口。

### 直接加入已有 Compose 文件

将 compose.yaml 中的 `tank` 服务块放到已有文件的 `services:` 下，与 redis 使用同一网络。若 redis 显式加入某个自定义网络，也给 tank 配上同一个 networks。将以上变量补充到该 Compose 项目的 .env。

镜像已发布后，只拉取和启动新增的 tank 服务：

```sh
docker compose pull tank
docker compose up -d --no-build --no-deps tank
```

### 单独部署，与 Redis 分属不同 Compose 项目

在 `.env` 中另填 `REDIS_NETWORK=已有Redis的Docker网络名`。不知道网络名时，可在服务器查看现有 Redis 容器的网络（替换实际容器名）：

```sh
docker inspect redis --format '{{json .NetworkSettings.Networks}}'
```

然后使用网络叠加配置：

```sh
docker compose -f compose.yaml -f compose.redis-network.yaml pull tank
docker compose -f compose.yaml -f compose.redis-network.yaml up -d --no-build --no-deps tank
```

该网络必须已存在，Redis 在其中有 `redis` 别名，或将 REDIS_URL 的主机名改成实际网络别名。external 网络不会由游戏创建或删除。

### Redis 在宿主机上

使用主 compose.yaml，REDIS_URL 主机填 host.docker.internal；已配置 host-gateway。Redis 必须监听容器可达的接口，并允许 Docker 网段访问。容器里的 127.0.0.1 指向容器自身。无需向公网开放 Redis。

## 镜像制作与发布

以下命令供部署者手动执行，本次没有运行构建、推送或服务启动。先在制作镜像的机器配置 TANK_IMAGE，再执行：

```sh
docker compose --env-file .env -f compose.yaml -f compose.build.yaml build tank
docker compose --env-file .env -f compose.yaml -f compose.build.yaml push tank
```

Dockerfile 的多阶段构建保留，默认 OBFUSCATE_CLIENT=true，生成混淆的发布页面资产；服务端逻辑和依赖留在运行镜像中。Blender 原件和预览图不加入构建上下文。镜像采用非 root 用户，Compose 保留只读文件系统、日志轮转和资源清理设置。

构建平台必须匹配服务器架构。如果在 Apple Silicon Mac 上构建而服务器是 amd64 Linux，需要明确选择目标平台，不能直接把仅 arm64 的镜像发布给它。此次未判断服务器架构，也未自动选择或构建多平台镜像。

## 检查与运维

仅解析配置，不启动服务：

```sh
docker compose --env-file .env config --quiet
```

使用外部 Redis 网络时，给检查和运维命令加上同样的两个 `-f` 参数。

```sh
docker compose ps tank
docker compose logs --tail=100 tank
```

默认访问 http://服务器IP:8080。日志应显示 Redis 模式，若显示 memory mode 则检查 REDIS_URL。`/healthz` 检查应用就绪状态；Redis 连接/租约故障会停止进程，由 restart 策略重启。健康检查使用镜像已有 Node，不依赖 wget。

## Redis 保存什么

- 房间码、玩家配置、准备大厅信息、重连凭证。
- 每秒保存一次完整战斗检查点（装甲、护盾、技能状态、复活时间、补给、位置、弹丸、斜坡位置等）。
- 重启时读取检查点，清空残留操作，提高对局 epoch，给玩家 30 秒重新连接。
- 浏览器会自动重连；刷新后可点“恢复上次连接”。凭证保存在当前标签页的 sessionStorage，换设备或关闭标签页后不保证恢复。

只操作 REDIS_PREFIX 下的 :checkpoint 和 :lease 两个键。检查点 TTL 为 24 小时；重启恢复不会补算停机期间的战斗。异常退出可能回退到最近一次成功快照，通常约 1 秒，实际取决于 Redis 写入延迟。Redis 本身是否能在重启后保留数据取决于你现有的 RDB/AOF 设置。

同一 REDIS_PREFIX 只允许一个游戏服务：使用 15 秒租约锁，每秒保存时续约。配置了 Redis 时，无法连接、无法写入或丢失租约会停止游戏服务，避免多个实例产生冲突。异常退出后，替代实例可能需要等待旧租约到期；Compose 会自动重试启动。部署多实例需要另做房间路由，不要直接增加 replicas。

插件或协议版本变更后，不兼容的旧检查点会阻止启动。开始一批新房间时改用新的 REDIS_PREFIX，避免误恢复旧规则数据。

当前使用普通单节点 Redis 客户端，不支持 Redis Cluster/Sentinel 自动发现；需要 GET、SET、EVAL，以及脚本中的 PEXPIRE/DEL 权限。相关 API 参考 [node-redis 连接说明](https://redis.io/docs/latest/develop/clients/nodejs/connect/)。

## HTTPS 反向代理

若已有 Nginx，沿用现有 TLS 配置，增加以下 location，并将 PUBLIC_ORIGIN 设置为该站点源地址：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    proxy_buffering off;
}
```

上面的 127.0.0.1 适用于 Nginx 在宿主机运行；Nginx 也在容器里时，加入同一 Docker 网络，并将上游改为 tank:8080。浏览器从 HTTPS 页面自动使用 WSS。

## 当前边界与验收

- 没有账号、跨对局排行榜和永久解锁；已有本局实时计分板与结算排名。随机重连凭证只用于恢复本次席位。
- 服务器负责伤害、坡面碰撞和胜负；客户端暂停只释放自己的操作，战斗继续。
- 普通断线保留 30 秒，期间车辆仍可被攻击；超时或主动离开会被淘汰。房主离线会移交大厅管理权。
- 正常比赛为 5 分钟模拟时间或先到 15 次击毁结束；同分时比较死亡数，两项相同为平局。另有 15 分钟墙钟时间的异常兜底，触发时判平局，不能当作正常赛制。大厅 30 分钟过期，结算后 5 分钟清理；房主可在结算后返回大厅再次准备。
- 使用 60 Hz 模拟、20 Hz 状态广播与约 30 Hz 稳定输入发送。按键边沿及时发送；有限输入队列保留短按开火和技能。
- 当前客户端有快照插值，没有本机预测与延迟补偿。高延迟网络下操控仍可能有滞后，需实测后继续优化。

已完成自动化模拟及适配层测试，没有启动真实 TCP 监听、连接你的 Redis、运行 Docker 镜像或执行浏览器 WebGL 验收。部署后需用两台设备测试加入、移动/射击、驾驶上下坡、离开重连，以及容器重启恢复。非运行状态的 Docker 配置检查也不能替代这些测试。

## 更新到当前 v14 版本

本版协议 v14、地图 summer-crossfire-v3 与旧对局不兼容。更新代码后重启 Node 服务，并刷新所有客户端；Docker 部署需重新构建更新镜像（此轮未执行）。如已设置 .env 的 REDIS_PREFIX，请改为 tiger:rooms:v14，使用新的房间数据命名空间，不要恢复旧激光蓄力规则的对局。

## 联机验收顺序

1. 两个独立客户端连接同一服务，检查准备权限、开局、移动、射击、技能快速点按和上下坡。
2. 验证满血满盾、不使用技能与补给时，连续延时激光击毁轻/中/重型分别需要 2/3/4 次命中。
3. 模拟状态停更，检查 1.5 秒暂停提示、5 秒重连尝试，以及短暂恢复后的继续按钮；前台更新时执行超时检查。
4. 检查 30 秒内断线恢复、超时离场、房主迁移、结算后返回大厅再开局。
5. 启用实际 Redis，验证容器重启、检查点恢复和独占租约失败时的停止行为。
6. 最后扩到 8 人与不同网络，观察操控延迟、消息流量和服务负载。

以上为待执行验收步骤。当前自动化测试共 136 项通过；尚未进行真实弱网和异机联机验收。配置解析和模拟测试不替代上述步骤。

房间列表新增同源 `GET /api/rooms` 接口，反向代理需与页面和 `/ws` 一起转发到游戏服务。更新后重启 Node；Docker 部署更新镜像后重建容器。旧进程没有该接口时会显示列表加载失败，手动刷新无法代替服务端更新。

镜像现在采用多阶段构建，默认混淆自有前端 JavaScript，并使用 `ASSET_MODE=release`。构建参数 `OBFUSCATE_CLIENT=false` 可临时生成可读前端排查问题，需重新构建才生效。不能通过只重启容器来切换。详见 [OBFUSCATION.md](OBFUSCATION.md)。完整混淆构建及实机性能仍待部署验收。

强化弹验收：标准炮连续两次普通命中后出现强化就绪，下一发造成 70 基础伤害；强化弹打空后回到 0/2；死亡清零；房间重连恢复合法进度。当前新增网络字段需要 v14 客户端与服务端配套部署。
