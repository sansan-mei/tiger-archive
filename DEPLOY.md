# Docker 发布：单个 Compose 文件

项目只使用 `docker-compose.yaml`。服务名、容器名均为 `tank`，支持本地构建，也支持直接拉取已发布镜像。容器提供网页、模型、`/ws` 和 `/healthz`，内部端口 8080，无需 static 卷。

## 配置

```sh
cp .env.example .env
```

编辑 `.env`：

```dotenv
TANK_IMAGE=1596944197/tank:latest
HTTP_PORT=8080
PUBLIC_ORIGIN=https://你的游戏域名
REDIS_URL=redis://redis:6379/0
REDIS_PREFIX=tiger:rooms:production
```

镜像名是拟定的发布目标，尚未由本次操作构建或推送；可改为实际仓库与固定版本标签。游戏使用 PUBLIC_ORIGIN、REDIS_URL，不是其他服务的 ALLOW_ORIGIN、REDIS_HOST。域名不带路径；直接通过 IP:8080 访问可留空 PUBLIC_ORIGIN，WebSocket 会校验 Origin 与 Host 一致。

Redis 有密码时用 `redis://default:URL_ENCODED_PASSWORD@redis:6379/0`。明确填写 `REDIS_URL=` 可启用纯内存模式。不要把 .env 提交到 Git 或放进镜像。

### Redis 所在网络

如果把 `tank` 服务块加入包含 Redis 的现有 Compose 文件，让两个服务使用相同网络即可，无需附加文件。

若游戏单独部署、Redis 在另一个 Compose 项目，仍然只用这一个文件，在 `.env` 设置：

```dotenv
REDIS_NETWORK=已有Redis的Docker网络名
REDIS_NETWORK_EXTERNAL=true
```

可在服务器查看实际 Redis 容器的网络名：

```sh
docker inspect redis --format '{{json .NetworkSettings.Networks}}'
```

该网络需已存在，且 Redis 在其中有 `redis` 别名；否则修改 REDIS_URL 的主机名。默认 REDIS_NETWORK 留空、REDIS_NETWORK_EXTERNAL=false，只创建游戏自己的网络，不会自动连接其他 Compose 项目的 Redis，也不会创建 Redis 容器。

宿主机 Redis 可使用 host.docker.internal，配置已含 host-gateway；其监听地址和访问权限需允许容器连接。

## 构建、发布和启动

以下命令供你执行；本次没有构建、推送或启动服务。

本机制作镜像：

```sh
docker-compose build tank
docker-compose push tank
```

`docker-compose.yaml` 已将 `tank` 的目标平台固定为 `linux/amd64`。即使在 Apple Silicon Mac 上执行上述构建命令，生成并推送的镜像也会使用常见 Linux x86_64 服务器架构，避免服务器启动时报镜像架构不兼容。

## PWA 部署

项目已支持 PWA（渐进式 Web 应用），用户可将游戏安装到桌面或手机主屏幕，离线时仍能打开游戏界面（多人联机功能需联网）。

### 新增文件

- `manifest.webmanifest` — PWA 应用清单（名称、主题色、图标、横屏）
- `service-worker.js` — 缓存策略 + 版本管理
- `client/icons/` — PWA 图标（192×192、512×512、maskable 512×512）

### 缓存策略

| 资源类型 | 策略 | 说明 |
|----------|------|------|
| HTML/JS/CSS | HTTP 缓存，每次校验 | ETag / Last-Modified 未变化时返回 304 |
| 模型、音频、Three.js | HTTP 缓存，每次校验 | 复用未变化的文件；不提供离线游戏缓存 |
| `/api/*`、`/ws` | 不缓存 | 多人联机数据，必须实时 |

静态资源使用 `Cache-Control: no-cache`，允许存储但使用前必须向服务器校验。源码和 release 模式均支持 gzip：对至少 1 KiB 的 JS、JSON、CSS、HTML 等文本文件按客户端协商异步压缩；PNG、MP3 不重复压缩。无需生成预压缩文件，服务器代码更新并重启后生效。

### 版本更新流程

Service Worker 会在后台检查新版本，检测到更新时弹出提示：

> "新版本已就绪，是否立即刷新？"

- **战斗中**：建议推迟到战斗结束后再刷新
- **大厅中**：可直接刷新

强制刷新（清除旧缓存）：

```sh
# 服务器重启 tank 容器（可选，强制客户端获取新 SW）
docker-compose restart tank
```

### 统一 Compose 部署

PWA 文件已加入 `app-manifest.js` 资源清单，构建时自动进入 `public-dist`。部署命令不变：

```sh
docker-compose -f my-docker-compose.yml pull tank
docker-compose -f my-docker-compose.yml up -d
```

### 验收

1. Chrome/Edge 地址栏出现"安装"按钮
2. 安装后独立窗口运行（无浏览器地址栏）
3. 断网后仍能打开游戏首页
4. 新版本发布后弹出更新提示

详细测试清单见 `VERIFICATION.md`。



服务器拉取并启动已发布镜像：

```sh
docker-compose pull tank
docker-compose up -d --no-build --no-deps tank
```

如果直接在服务器构建，执行 build 后直接 up 即可，无需 push/pull。新版命令 `docker compose` 与上述 `docker-compose` 子命令等价。Apple Silicon 本机与 amd64 服务器架构不同时，制作镜像时需选择服务器对应平台；本次未选择或构建目标架构。

构建默认生成混淆的客户端资产，OBFUSCATE_CLIENT=false 可用于调试。容器使用非 root、只读文件系统、restart always、日志轮转；健康检查每 60 秒使用 Node 请求 /healthz，超时 10 秒。Blender 原件与预览不进入镜像上下文。

检查配置和运行状态：

```sh
docker-compose config --quiet
docker-compose ps tank
docker-compose logs --tail=100 tank
```

## 固定前缀与恢复策略

新部署默认 REDIS_PREFIX=tiger:rooms:production，发布更新不再要求换前缀。已有 `.env` 如果仍使用 tiger:rooms:v14，可以继续保留这个值；新恢复逻辑对自定义前缀同样生效，保留原值才能找到原房间。

- 没有检查点：正常启动空大厅。
- 协议及插件配置兼容：恢复房间、席位和重连凭证，清空残留操作。
- 协议或插件配置不兼容：在持有租约且当前检查点仍与读取值相同时，将原始数据备份到 `:checkpoint:previous`，再写入当前版本的空大厅。记录重置日志，旧房间无法继续，玩家需要重新创建。
- 格式损坏、当前版本数据校验失败、当前版本检查点超过房间配置上限、Redis 连接/写入失败、锁冲突或租约丢失：停止启动，不自动清空检查点。

备份保留 24 小时，只保留最近一份不兼容检查点；下一次不兼容重置会覆盖这一个备份键。备份包含房间重连凭证，与主检查点同等保密，不是永久存档，也不会自动重新恢复。

历史前缀不会被扫描、导入或删除。若从 v14 前缀改为 production，会启动新命名空间；旧服务停掉后旧检查点通常在最后一次保存的 24 小时后过期，旧租约约 15 秒后过期。不要删除仍在运行服务的租约。不同独立部署需使用不同前缀。

## Redis 保存什么

- 房间码、玩家配置、准备大厅信息、重连凭证。
- 每秒保存一次完整战斗检查点（装甲、护盾、技能状态、复活时间、补给、位置、弹丸、斜坡位置等）。
- 重启时读取检查点，清空残留操作，提高对局 epoch，给玩家 30 秒重新连接。
- 浏览器会自动重连；刷新后可点“恢复上次连接”。凭证保存在当前标签页的 sessionStorage，换设备或关闭标签页后不保证恢复。

使用 REDIS_PREFIX 下的 :checkpoint、:lease 与可选的 :checkpoint:previous 三个键。检查点 TTL 为 24 小时；重启恢复不会补算停机期间的战斗。异常退出可能回退到最近一次成功快照，通常约 1 秒，实际取决于 Redis 写入延迟。Redis 本身是否能在重启后保留数据取决于你现有的 RDB/AOF 设置。

同一 REDIS_PREFIX 只允许一个游戏服务：使用 15 秒租约锁，每秒保存时续约。配置了 Redis 时，无法连接、无法写入或丢失租约会停止游戏服务，避免多个实例产生冲突。异常退出后，替代实例可能需要等待旧租约到期；Compose 会自动重试启动。部署多实例需要另做房间路由，不要直接增加 replicas。

协议或插件不兼容时按上述备份重置策略启动空大厅；其他恢复错误仍阻止启动。

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
- 自由混战正常比赛为 8 分钟模拟时间，或先到 15 次击毁结束；同分时比较死亡数，两项相同为平局。自由混战房间另有 15 分钟墙钟时间的异常兜底，不能当作正常赛制。僵尸合作生存不设时限，只在全队阵亡或击败最终 Boss 时结算；不使用 PvE 房间墙钟判负。大厅 30 分钟过期，结算后 5 分钟清理；房主可在结算后返回大厅再次准备。
- 使用 60 Hz 模拟、20 Hz 状态广播与约 30 Hz 稳定输入发送。按键边沿及时发送；有限输入队列保留短按开火和技能。
- 当前客户端有快照插值，没有本机预测与延迟补偿。高延迟网络下操控仍可能有滞后，需实测后继续优化。

已完成自动化模拟及适配层测试，没有启动真实 TCP 监听、连接你的 Redis、运行 Docker 镜像或执行浏览器 WebGL 验收。部署后需用两台设备测试加入、移动/射击、驾驶上下坡、离开重连，以及容器重启恢复。非运行状态的 Docker 配置检查也不能替代这些测试。

## 更新到当前 v14 版本

本版协议 v14、地图 summer-crossfire-v3 与旧对局不兼容。更新代码后重启 Node 服务，并刷新所有客户端；Docker 部署需重新构建更新镜像（此轮未执行）。已有 REDIS_PREFIX 保持原值即可；不兼容的房间会备份后重置。

## 联机验收顺序

1. 两个独立客户端连接同一服务，检查准备权限、开局、移动、射击、技能快速点按和上下坡。
2. 验证满血满盾、不使用技能与补给时，连续延时激光击毁轻/中/重型分别需要 2/3/4 次命中。
3. 模拟状态停更，检查 1.5 秒暂停提示、5 秒重连尝试，以及短暂恢复后的继续按钮；前台更新时执行超时检查。
4. 检查 30 秒内断线恢复、超时离场、房主迁移、结算后返回大厅再开局。
5. 启用实际 Redis，验证容器重启、检查点恢复和独占租约失败时的停止行为。
6. 最后扩到 8 人与不同网络，观察操控延迟、消息流量和服务负载。

以上为待执行验收步骤。当前自动化测试共 141 项通过；尚未进行真实弱网和异机联机验收。配置解析和模拟测试不替代上述步骤。

房间列表新增同源 `GET /api/rooms` 接口，反向代理需与页面和 `/ws` 一起转发到游戏服务。更新后重启 Node；Docker 部署更新镜像后重建容器。旧进程没有该接口时会显示列表加载失败，手动刷新无法代替服务端更新。

镜像现在采用多阶段构建，默认混淆自有前端 JavaScript，并使用 `ASSET_MODE=release`。构建参数 `OBFUSCATE_CLIENT=false` 可临时生成可读前端排查问题，需重新构建才生效。不能通过只重启容器来切换。详见 [OBFUSCATION.md](OBFUSCATION.md)。完整混淆构建及实机性能仍待部署验收。

强化弹验收：标准炮连续两次普通命中后出现强化就绪，下一发造成 70 基础伤害；强化弹打空后回到 0/2；死亡清零；房间重连恢复合法进度。当前新增网络字段需要 v14 客户端与服务端配套部署。

## 统一服务 Compose

统一文件位于 `/Users/lan/Documents/my-chatgpt-site/docker-compose/my-docker-compose.yml`。tank 与已有 Redis 共用默认网络，镜像为 `1596944197/tank:latest`。

对外入口为 **https://mh33.top:3007**。统一配置由 Nginx 发布 HTTPS 3007，转发到内部 tank:8080；tank 不再直接映射宿主端口。PUBLIC_ORIGIN 已同步为 https://mh33.top:3007，复用 mh33.top 现有证书，不新增 DNS 或证书域名。需要放行 TCP 3007。

上传统一 Compose，并将本地 `nginx/t_nginx.conf` 新增的 tank server 块及 http 级 map 合并到服务器 `/mnginx.conf`，保留服务器其他配置。volumes 沿用服务器 `/mnginx.conf`、`/ssl_common.conf` 和证书目录 `/certbot-etc`。游戏 HTTPS 入口启用 HTTP/2；Nginx 到 tank 使用 HTTP/1.1，以支持 WebSocket Upgrade。镜像发布后，在统一文件所在目录执行：

```sh
docker-compose -f my-docker-compose.yml pull tank
docker-compose -f my-docker-compose.yml run --rm --no-deps nginx nginx -t
docker-compose -f my-docker-compose.yml up -d
```

up 会应用新增的 Nginx 端口和 tank 环境变量。只更新游戏和网关时可用 `up -d --no-deps nginx tank`。不要仅 reload 旧 Nginx 容器，因为其端口映射也需要更新；volumes 保持原样。

Nginx 代理保留带端口的 Host，处理 WebSocket Upgrade，使用 Docker DNS 跟随 tank 容器地址变化。独立游戏项目的 docker-compose.yaml 仍可直接提供 HTTP；本节描述的是统一配置的 HTTPS 部署。

本轮未运行构建、推送、拉取或启动容器；仅通过 Compose 解析和静态代理配置检查，服务器 nginx -t、证书加载及真实 WSS 仍待部署验收。

PWA 使用独立的 /service-worker.js 注册，遵循现有 CSP，不需要放开 inline script。offline.html、client/pwa.js 与安装图标已纳入资源清单和 Docker 复制步骤。更新后关闭所有游戏窗口再重新打开；当前仅支持在线游玩及离线提示页。

联机平滑修复需要更新前端发布产物并重新打开游戏（旧标签仍运行旧脚本）。这次不改协议/Redis 前缀；未自动打包或启动容器。部署后两人测试直线移动、转弯、突然停车、首次开火及上下坡，并观察顶部 FPS、延迟、距收包时间。

本次常驻护盾移除及激光 1.7 秒装填需要同时更新服务端和前端镜像，所有客户端重新打开页面。车体/武器清单已更新；旧房间检查点按现有不兼容恢复策略备份后清空，Redis 前缀保持不变。
