# Docker 部署：WebSocket + 可选 Redis

一个 Node.js 容器提供网页、Three.js 静态资源、/ws WebSocket 和 /healthz 健康检查。客户端使用当前网页域名建立 ws/wss 连接，无需单独开放 WebSocket 端口。无需数据库；可以连接你已有的 Redis 保存房间检查点。

## 部署

将整个项目目录上传到服务器，在该目录执行以下命令。下面是供你部署时执行的命令，本次开发没有执行镜像构建或启动服务。

```sh
cp .env.example .env
```

编辑 .env，至少核对端口与 Redis 地址。例如：

```dotenv
HTTP_PORT=8080
BIND_ADDRESS=0.0.0.0
MAX_ROOMS=16
PUBLIC_ORIGIN=https://tank.example.com
REDIS_URL='redis://default:URL_ENCODED_PASSWORD@host.docker.internal:6379/0'
REDIS_PREFIX=tiger:rooms:v7
```

- 直接通过 IP:8080 访问时，PUBLIC_ORIGIN 可留空；服务会要求 WebSocket Origin 与请求 Host 相同。
- 用域名反代时，PUBLIC_ORIGIN 填实际完整源地址（协议 + 域名 + 可选端口，不带路径）。部署于网站根路径；当前不支持 /tank/ 之类子路径。
- Redis 无密码时使用 redis://地址:6379/0；ACL 用户可填对应用户名。密码中的 @、:、/、#、% 等字符必须做 URL 编码。单引号用于防止 Compose 将密码里的美元符号当变量。
- REDIS_URL 留空则启用纯内存模式。不要将 .env 放进 Git 或镜像。

完成配置后：

```sh
docker compose up -d --build
```

默认访问 http://服务器IP:8080。两人分别打开同一网址：选择车体和武器 → 创建/加入房间 → 所有人准备 → 房主开局。支持 2–8 人；本地训练仍为玩家 + 7 AI。

常用运维命令：

```sh
docker compose ps
docker compose logs --tail=100 tank
docker compose down
```

应用日志不输出 Redis URL、密码或玩家重连凭证。WebSocket 与 HTTP 同走 8080。镜像使用非 root 用户、只读文件系统及健康检查。

## 连接已有 Redis

### Redis 在宿主机上

compose.yaml 已配置 host.docker.internal:host-gateway，REDIS_URL 的主机填 host.docker.internal。容器内的 127.0.0.1 指向容器自身。

宿主机 Redis 必须监听容器可访问的接口，并允许 Docker 网段访问；如果只监听宿主机 127.0.0.1，host-gateway 不能直接连接。将访问限制在内部网络并使用现有认证配置即可，不需要向公网开放 Redis。

### Redis 是另一个 Docker 容器

让游戏容器加入 Redis 已使用的网络，然后使用 Redis 的服务名或网络别名。例如另建 compose.redis-network.yaml：

```yaml
services:
  tank:
    networks:
      - default
      - existing-redis
networks:
  existing-redis:
    external: true
    name: YOUR_EXISTING_REDIS_NETWORK
```

REDIS_URL 可填 redis://default:密码@redis服务名:6379/0。用两个 Compose 文件部署：

```sh
docker compose -f compose.yaml -f compose.redis-network.yaml up -d --build
```

网络名和 Redis 服务名需替换为你已有的配置。若 Redis 使用 TLS，连接字符串改为 rediss://；私有 CA 需额外配置 Node 信任证书。

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

## 更新到当前 v7 版本

本版协议 v7、地图 summer-crossfire-v3 与旧对局不兼容。更新代码后重启 Node 服务，并刷新所有客户端；Docker 部署需重新构建更新镜像（此轮未执行）。如已设置 .env 的 REDIS_PREFIX，请改为 tiger:rooms:v7，使用新的房间数据命名空间，不要恢复旧楼梯对局。

## 联机验收顺序

1. 两个独立客户端连接同一服务，检查准备权限、开局、移动、射击、技能快速点按和上下坡。
2. 验证满血满盾、不使用技能与补给时，连续满蓄力激光击毁轻/中/重型分别需要 2/3/4 次命中。
3. 模拟状态停更，检查 1.5 秒暂停提示、5 秒重连尝试，以及短暂恢复后的继续按钮；前台更新时执行超时检查。
4. 检查 30 秒内断线恢复、超时离场、房主迁移、结算后返回大厅再开局。
5. 启用实际 Redis，验证容器重启、检查点恢复和独占租约失败时的停止行为。
6. 最后扩到 8 人与不同网络，观察操控延迟、消息流量和服务负载。

以上为待执行验收步骤。当前自动化测试共 78 项通过；尚未进行真实弱网和异机联机验收。配置解析和模拟测试不替代上述步骤。
