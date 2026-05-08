---
layout: post
title: "Overpass API 本地部署文档 — 美国南部"
date: 2026-04-28 12:22:48 +0800
tags: [OSM, Geofabrik, Overpass API, Docker]
category: 技术分享
---


# Overpass API 本地部署文档 — 美国南部

> **目标**：使用 Docker 在本地搭建 Overpass API 服务，覆盖范围为美国南部（us-south）。
> **数据来源**：Geofabrik OSM 地图数据
> **Docker 镜像**：wiktorn/Overpass-API

---

## 目录

1. [前置条件](#1-前置条件)
2. [资源规划](#2-资源规划)
3. [目录结构](#3-目录结构)
4. [配置文件](#4-配置文件)
5. [部署步骤](#5-部署步骤)
6. [验证与服务使用](#6-验证与服务使用)
7. [运维常用命令](#7-运维常用命令)
8. [踩坑记录](#8-踩坑记录)
9. [环境变量速查表](#9-环境变量速查表)

---

## 1. 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装并正常运行
- 网络可以访问 Geofabrik 下载站点（用于下载初始数据和差分更新）
- 宿主机建议 **8GB+ 内存**，否则索引阶段可能 OOM

---

## 2. 资源规划

美国南部（us-south）数据规模及磁盘占用预估：

| 阶段               | 文件              | 大小            |
| ------------------ | ----------------- | --------------- |
| 初始数据           | `.osm.pbf`        | ~3.8 GB         |
| 格式转换后（临时） | `.osm.bz2`        | ~15 GB          |
| 建索引完成后       | 数据库文件        | ~25~40 GB       |
| 增量差分缓存       | replication cache | ~5~10 GB        |
| **总计峰值占用**   |                   | **约 35~55 GB** |

> ⚠️ **务必确保 `D:\osm\overpass_db` 所在分区有 60GB+ 可用空间。**

---

## 3. 目录结构

```
D:\osm\
├── pbf\                          # PBF 源数据（只读）
│   └── us-south-latest.osm.pbf   # 提前下载好的地图数据
└── overpass_db\                  # 数据库持久化目录
    └── (由容器自动创建和写入)
```

**如果还没有准备好 PBF 文件**，可以从 Geofabrik 下载：

```
# 最新数据（每日更新）
https://download.geofabrik.de/north-america/us-south-latest.osm.pbf

# 按月归档数据（数据日期固定，不会再变）
https://download.geofabrik.de/north-america/us-south-260401.osm.pbf   # 2026年4月1日

# 其他常用区域参考
https://download.geofabrik.de/north-america/us-latest.osm.pbf        # 全美
https://download.geofabrik.de/north-america/us-east-latest.osm.pbf   # 美国东部
https://download.geofabrik.de/north-america/us-west-latest.osm.pbf  # 美国西部
```

---

## 4. 配置文件

将以下内容保存为 **`D:\osm\docker-compose.yml`**（或项目根目录下的 `docker-compose.overpass.yml`）：

```yaml
version: "3.8"

services:
  overpass:
    image: wiktorn/overpass-api        # Docker Hub 上维护的 Overpass API 官方镜像
    container_name: overpass_us_south   # 容器名称，方便 docker ps / docker logs 等命令引用
    restart: unless-stopped             # 容器退出时自动重启（除非手动 docker stop）

    environment:

      # ---------- 运行模式 ----------
      # 值: init | clone
      # init:   从 PBF 文件初始化本地数据库（适合区域数据，如 us-south）
      # clone:  从远程 Overpass 实例克隆已索引数据（适合全球数据，速度快但数据量大）
      # 默认: clone
      OVERPASS_MODE: "init"

      # ---------- 元数据选项 ----------
      # 值: no | yes | attic
      # no:    仅存储最新数据，查询不返回元素的创建/修改时间等元信息
      # yes:   存储完整元数据，查询可获取元素的编辑历史信息
      # attic: 存储带时间戳的历史快照（数据量比 yes 更大）
      # 建议: 日常使用 "yes" 足够，耗时会增加约 20%
      # 默认: no
      OVERPASS_META: "yes"

      # ---------- 初始数据文件 URL ----------
      # 支持两种格式：
      #   https://...   — 远程 HTTP/HTTPS 地址，容器会自动下载
      #   file:///...  — 本地文件路径（需同时通过 volumes 挂载对应目录）
      # OVERPASS_MODE=clone 时此变量被忽略
      #
      # 常用区域数据下载地址（Geofabrik）：
      #   北美-美国南部: https://download.geofabrik.de/north-america/us-south-latest.osm.pbf
      #   北美-美国东部: https://download.geofabrik.de/north-america/us-east-latest.osm.pbf
      #   北美-美国西部: https://download.geofabrik.de/north-america/us-west-latest.osm.pbf
      #   北美-全美:     https://download.geofabrik.de/north-america/us-latest.osm.pbf
      #   欧洲-德国:    https://download.geofabrik.de/europe/germany-latest.osm.pbf
      OVERPASS_PLANET_URL: "file:///pbf/us-south-latest.osm.pbf"

      # ---------- 增量更新 URL ----------
      # 数据初始化完成后，容器会定期从该 URL 拉取差分文件（OSM 变更）进行增量更新
      # 值: 空        — 不进行增量更新，数据在初始化后静止不动
      #       URL     — Geofabrik 提供的区域差分目录（推荐）
      #       其他URL — 可指向 planet.openstreetmap.org 的全球分钟级差分
      #
      # 对应区域的差分目录（Geofabrik）：
      #   us-south: https://download.geofabrik.de/north-america/us-south-updates/
      #   us-east:  https://download.geofabrik.de/north-america/us-east-updates/
      #   us-west:  https://download.geofabrik.de/north-america/us-west-updates/
      # 官方全球分钟差分: https://planet.openstreetmap.org/replication/minute/
      # 官方全球小时差分: https://planet.openstreetmap.org/replication/hour/
      OVERPASS_DIFF_URL: "https://download.geofabrik.de/north-america/us-south-updates/"

      # ---------- 预处理命令 ----------
      # 容器在下载数据文件后、开始建索引前，会执行此 Shell 命令
      # 可用于格式转换、文件解压、区域裁剪等预处理操作
      #
      # 当前用法说明（Geofabrik 提供 .pbf，但容器只认 .osm.bz2）：
      #   mv         — 还原真实扩展名（容器下载后固定命名为 planet.osm.bz2）
      #   osmium     — 将 .pbf 转换为真正的 .osm.bz2（容器内置了 osmium 工具）
      #   rm         — 删除中间 .pbf 文件，节省空间
      #
      # 可选替代方案：
      #   直接用 osmium 转换（如果你的 PBF 需要裁剪边界可用 poly）：
      #     'osmium tags-filter /db/planet.osm.pbf w/r/way -o /db/planet.osm.filtered.pbf && mv /db/planet.osm.pbf /db/planet.osm.bak.pbf && mv /db/planet.osm.filtered.pbf /db/planet.osm.pbf && rm /db/planet.osm.bak.pbf'
      #
      #   如果下载的已经是 .osm.bz2 格式（如 planet 历史归档）：
      #     'bunzip2 -c /db/planet.osm.bz2 | bzip2 > /db/planet.osm.new.bz2 && mv /db/planet.osm.new.bz2 /db/planet.osm.bz2'
      OVERPASS_PLANET_PREPROCESS: "mv /db/planet.osm.bz2 /db/planet.osm.pbf && osmium cat -o /db/planet.osm.bz2 /db/planet.osm.pbf && rm /db/planet.osm.pbf"

      # ---------- 数据库压缩方式 ----------
      # 值: gz | lz4 | no
      # gz:   gzip 压缩（默认，兼容性好，压缩率适中）
      # lz4:  lz4 压缩（速度更快，压缩率低，磁盘占用更大）
      # no:   不压缩（仅 init 模式可用，建索引更快但占用磁盘最多）
      # 默认: gz
      OVERPASS_COMPRESSION: "gz"

      # ---------- 建索引负载控制 ----------
      # 值: 整数 1 ~ 100
      # 控制 Overpass 在初始化建索引时的 CPU/IO 消耗强度
      #   1:  极低负载，建索引极慢（约 3 倍正常时间），几乎不影响同主机其他服务
      #  50:  中等负载，建索引和休眠时间各占一半
      # 100:  最大负载，建索引最快（约 1 倍时间），但会占满 CPU
      # 建议: 生产环境首次初始化用 "1"，快速测试用 "50" 或更高
      # 默认: 1
      OVERPASS_RULES_LOAD: "10"

      # ---------- 增量更新间隔 ----------
      # 值: 秒数（整数）
      # 两次增量更新之间容器休眠的秒数
      #  3600:  每小时检查一次（推荐，适合大多数场景）
      #   600:  每 10 分钟检查一次（适合需要实时数据的场景）
      #  86400: 每天检查一次
      # 空值:   不限制，连续不断检查（不推荐，会持续占用网络）
      # 默认: 空
      OVERPASS_UPDATE_SLEEP: "3600"

      # ---------- 初始化完成后是否停止容器 ----------
      # 值: true | false
      # true:  初始化完成后容器自动停止，后续用 docker start 启动服务（适合需要手动控制）
      # false: 初始化完成后立即进入服务状态（推荐，无需额外操作）
      # 默认: true
      OVERPASS_STOP_AFTER_INIT: "false"

      # ---------- 查询最大超时时间 ----------
      # 值: 秒数（整数）
      # 单个查询允许执行的最长时间，超时返回错误
      #  1000:  默认值，较复杂的区域查询足够
      #   300:  适合公网暴露、限制滥用
      #  3600:  大范围数据查询需要更长时间
      # 默认: 1000
      OVERPASS_MAX_TIMEOUT: "1800"

      # ---------- FastCGI 进程数 ----------
      # 值: 整数
      # Overpass API 使用 FastCGI 处理并发请求，此参数控制工作进程数量
      #   1:  串行处理，同一时间只能响应一个查询
      #   4:  默认值，适合 4 核以下机器
      #   8+: 适合高并发场景，但会占用更多内存
      # 内存参考: 每个进程约占用 200~500MB RAM
      # 默认: 4
      OVERPASS_FASTCGI_PROCESSES: "4"

      # ---------- 是否启用区域（Area）生成 ----------
      # 值: true | false
      # true:  容器内会额外运行 area 生成和更新进程（推荐，开启后支持 [out:json][timeout:5];is_in(40.7,-74);area; 查询）
      # false: 不生成区域数据，查询中不能使用 area 相关语法
      # 默认: true
      # OVERPASS_USE_AREAS: "true"

      # ---------- 是否允许重复查询 ----------
      # 值: yes | no
      # 同一个 IP 在已有相同查询正在进行时，是否允许再次发起
      # yes: 允许重复查询（高并发友好，但可能放大数据库压力）
      # no:  拒绝重复查询，相同查询排队等待结果（默认，更安全）
      # 默认: no
      # OVERPASS_ALLOW_DUPLICATE_QUERIES: "no"

      # ---------- 单 IP 最大并发数 ----------
      # 值: 整数
      # 限制同一 IP 同时发起的最大查询数，防止个别用户过度占用资源
      # 空值: 不限制
      #  2:    允许每 IP 最多 2 个并发查询（适合共享服务）
      # 默认: 空
      # OVERPASS_RATE_LIMIT: "2"

      # ---------- 单次查询最大可用时间 ----------
      # 值: 整数（秒）
      # 控制查询消耗的"虚拟时间单位"上限（与 OVERPASS_MAX_TIMEOUT 不同，这是逻辑时间配额）
      # 空值: 不限制
      # 默认: 空
      # OVERPASS_TIME: "300"

      # ---------- 单次查询最大可用内存 ----------
      # 值: 整数（字节），支持 K/M/G 后缀
      # 控制查询最大允许占用的 RAM
      #  2G:  默认保守值
      #  8G:  大范围查询需要更多内存
      # 默认: 空
      # OVERPASS_SPACE: "2147483648"

      # ---------- 自定义健康检查命令 ----------
      # 值: Shell 命令字符串
      # Docker 健康检查会执行此命令，返回 0 表示健康，非 0 表示不健康
      # 以下示例：检查数据时间戳是否在两天内
      # OVERPASS_HEALTHCHECK: |
      #   OVERPASS_RESPONSE=$(curl --noproxy "*" -s "http://localhost/api/interpreter?data=[out:json];node(1);out;" | jq -r .osm3s.timestamp_osm_base)
      #   OVERPASS_DATE=$(date -d "$OVERPASS_RESPONSE" +%s)
      #   TWO_DAYS_AGO=$(($(date +%s) - 2*86400));
      #   if [ ${OVERPASS_DATE} -lt ${TWO_DAYS_AGO} ] ; then echo "Overpass out of date."; exit 1; fi
      #   echo "Overpass date: ${OVERPASS_RESPONSE}"
      # 默认: curl 基础连通性检查
      # OVERPASS_HEALTHCHECK: ""

    volumes:

      # PBF 源文件目录（只读挂载 :ro）
      # 作用: OVERPASS_PLANET_URL 指向容器内的 /pbf/，通过此挂载读取宿主机文件
      # 建议: 如果 PBF 文件很大，可以提前下载到此目录，跳过容器下载步骤
      - D:\osm\pbf:/pbf:ro

      # 数据库目录（读写挂载，可省略 :ro）
      # 作用: 容器内 /db 目录存放所有数据库文件（原始数据 + 索引 + 差分缓存）
      # 重要: 这是数据持久化的关键，删除此目录 = 数据全部丢失
      # 磁盘占用预估（us-south）：
      #   .osm.pbf 原始:      ~3.8 GB
      #   .osm.bz2 转换后:   ~15 GB（仅转换期间存在）
      #   数据库索引:          ~25~40 GB
      #   差分缓存:            ~5~10 GB
      #   总计:                ~35~55 GB
      - D:\osm\overpass_db:/db

    ports:
      # 宿主机端口:容器端口
      # 格式: "主机端口:容器端口"
      # 容器内 Overpass API 监听 80 端口
      # 建议用非 80 的高位端口（如 12345）避免权限问题
      - "12345:80"
```

---

## 5. 部署步骤

### 5.1 准备宿主机目录

```powershell
# 创建数据库目录
mkdir D:\osm\overpass_db

# 确认 PBF 文件存在
dir D:\osm\pbf\us-south-latest.osm.pbf
```

### 5.2 启动容器

```powershell
# 进入 docker-compose.yml 所在目录
cd D:\osm

# 启动（-d 后台运行）
docker-compose up -d

# 实时查看初始化日志（数据量大，预计 1~3 小时）
docker-compose logs -f
```

> 💡 **如果网络不稳定**，建议先把 PBF 文件放到 `D:\osm\pbf\us-south-latest.osm.pbf`，这样容器从本地复制而非从网络下载，不容易中断。

### 5.3 初始化完成标志

日志中出现以下内容表示初始化成功，服务已就绪：

```
Starting to listen on 0.0.0.0:80
```

---

## 6. 验证与服务使用

### 6.1 API 验证

```powershell
# 查看服务状态
curl "http://localhost:12345/api/status"

# 测试查询（查询一个节点）
curl "http://localhost:12345/api/interpreter?data=[out:json];node(1);out;"

# 测试 Overpass QL 查询（查询纽约附近的医院）
curl "http://localhost:12345/api/interpreter" ^
  -d "data=[out:json][timeout:25];node(40.7,-74.0,40.8,-73.9)[amenity=hospital];out;"
```

### 6.2 配合 Overpass Turbo 使用

1. 打开 [https://overpass-turbo.eu](https://overpass-turbo.eu)
2. 点击右上角 **Settings（齿轮图标）**
3. 在 **Custom server** 填入：
   ```
   http://localhost:12345/api/
   ```
4. 保存后即可在图形界面中查询本地数据

### 6.3 其他客户端使用

Overpass API 支持标准的 Overpass QL 和 Overpass XML 查询语法，可直接对接：
- 各类 GIS 软件（QGIS、ArcGIS）
- OSM 生态工具（osmium、osmconvert）
- 自定义应用

---

## 7. 运维常用命令

```powershell
# 查看容器状态
docker ps -a | findstr overpass

# 查看实时日志
docker-compose logs -f

# 停止服务
docker-compose stop

# 重启服务
docker-compose restart

# 删除容器（不会删除数据目录 D:\osm\overpass_db）
docker-compose down

# 完全重建（清除数据库重新初始化）
docker-compose down
# 删除 D:\osm\overpass_db 目录下的所有文件
docker-compose up -d

# 进入容器内部（调试用）
docker exec -it overpass_us_south bash
```

---

## 8. 踩坑记录

### Q1: `OVERPASS_PLANET_PREPROCESS` 为什么要把 `.bz2` 改成 `.pbf` 再转回去？

**问题**：Geofabrik 提供的下载文件是 `.osm.pbf` 格式，但容器下载后固定保存为 `/db/planet.osm.bz2`（不管原始格式是什么），导致文件名和实际内容不匹配。

**原因**：容器的设计假设是下载 `.osm.bz2` 文件，所以内部逻辑固定按 `.bz2` 处理。

**解决方案**：通过预处理命令还原真实扩展名，再用 `osmium` 工具从 PBF 转换到真正的 bz2：

```
mv /db/planet.osm.bz2 /db/planet.osm.pbf   # 还原扩展名
osmium cat -o /db/planet.osm.bz2 /db/planet.osm.pbf   # PBF → OSM XML → bz2
rm /db/planet.osm.pbf   # 删除中间文件
```

---

### Q2: 使用本地 PBF 文件（`file://` 协议）时，预处理命令需要修改吗？

**结论**：不需要修改。

**原因**：容器处理"本地文件"和"远程文件"的逻辑完全相同——都是先复制到 `/db/planet.osm.bz2`，再执行预处理。所以无论数据从哪来，`OVERPASS_PLANET_PREPROCESS` 的内容不变。

只需改两处：
1. `OVERPASS_PLANET_URL` 改为 `file:///pbf/us-south-latest.osm.pbf`
2. 新增 volume 挂载：`D:\osm\pbf:/pbf:ro`

---

### Q3: 数据转换后磁盘占用翻倍？

**问题**：PBF 转 BZ2 过程中发现磁盘占用暴涨。

**原因**：PBF 是高度压缩的二进制格式，转为 OSM XML 后再用 bzip2 压缩，体积会膨胀约 4 倍。

**应对**：
- 确保 `D:\osm\overpass_db` 有 60GB+ 可用空间
- 转换完成后（`rm .pbf` 执行后）峰值占用会降下来
- 建索引完成后，最终数据库文件比 BZ2 更紧凑（Overpass 自有的数据库格式）

---

## 9. 环境变量速查表

| 变量名                       | 可选值                 | 默认值   | 推荐值       | 说明                 |
| ---------------------------- | ---------------------- | -------- | ------------ | -------------------- |
| `OVERPASS_MODE`              | `init` / `clone`       | `clone`  | `init`       | 区域数据用 init      |
| `OVERPASS_META`              | `no` / `yes` / `attic` | `no`     | `yes`        | 需要历史信息时选 yes |
| `OVERPASS_PLANET_URL`        | URL / `file://`        | —        | 实际路径     | 初始数据地址         |
| `OVERPASS_DIFF_URL`          | URL / 空               | 空       | 区域差分目录 | 增量更新             |
| `OVERPASS_PLANET_PREPROCESS` | Shell 命令             | 空       | 见文档       | PBF→BZ2 转换         |
| `OVERPASS_COMPRESSION`       | `gz` / `lz4` / `no`    | `gz`     | `gz`         | 磁盘 vs 速度权衡     |
| `OVERPASS_RULES_LOAD`        | 1~100                  | `1`      | `10`         | 建索引负载           |
| `OVERPASS_UPDATE_SLEEP`      | 秒数                   | 空       | `3600`       | 更新间隔             |
| `OVERPASS_STOP_AFTER_INIT`   | `true` / `false`       | `true`   | `false`      | 自动进入服务         |
| `OVERPASS_MAX_TIMEOUT`       | 秒数                   | `1000`   | `1800`       | 查询超时             |
| `OVERPASS_FASTCGI_PROCESSES` | 整数                   | `4`      | `4`          | 并发进程数           |
| `OVERPASS_USE_AREAS`         | `true` / `false`       | `true`   | `true`       | 区域功能开关         |
| `OVERPASS_RATE_LIMIT`        | 整数 / 空              | 空       | —            | 单 IP 并发限制       |
| `OVERPASS_TIME`              | 秒数 / 空              | 空       | —            | 查询逻辑时间配额     |
| `OVERPASS_SPACE`             | 字节数 / 空            | 空       | —            | 查询内存限制         |
| `OVERPASS_HEALTHCHECK`       | Shell 命令             | 基础检查 | 见文档       | 健康检查             |

---

## 参考链接

- **Docker 镜像源码**：[https://github.com/wiktorn/Overpass-API](https://github.com/wiktorn/Overpass-API)
- **Geofabrik OSM 数据下载**：[https://download.geofabrik.de/](https://download.geofabrik.de/)
- **Overpass API 文档**：[https://dev.overpass-api.de/overpass-doc/](https://dev.overpass-api.de/overpass-doc/)
- **Overpass QL 查询语言**：[https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- **Overpass Turbo 在线工具**：[https://overpass-turbo.eu](https://overpass-turbo.eu)
