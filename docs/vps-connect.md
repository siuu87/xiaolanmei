# 连接 VPS 的办法（小蓝莓部署向）

> 适用场景：你有一台云服务器（阿里云 / 腾讯云 / 其它），想把「小蓝莓」跑上去并从外网访问。
> 本文只讲**你怎么连上 VPS 并把项目跑起来**，不含厂商开户流程。

---

## 一、先备齐三样信息

| 项目 | 在哪看 | 说明 |
|------|--------|------|
| 公网 IP / 域名 | 云控制台「实例详情」 | 下面 `<IP>` 都填它 |
| 登录用户名 | 镜像决定 | 一般是 `root`，Ubuntu 常是 `ubuntu`，腾讯云可能是 `ubuntu`/`lighthouse` |
| 认证方式 | 创建实例时选的 | 密码 或 SSH 密钥（二选一，密钥更稳） |
| 开放端口 | 控制台「安全组 / 防火墙」 | **必须先放通 22**，否则 `ssh` 永远连不上 |

> 连不上的头号原因：安全组没开 22 端口。先去控制台确认。

---

## 二、方式 1：SSH 密码登录（最快）

Windows 10/11 自带 OpenSSH，直接打开 **PowerShell / 终端 / Cmd** 即可，不用装软件：

```bash
ssh root@<IP>
# 首次会问 yes/no，输 yes；然后输入实例密码
```

能进就说明 SSH 通了。密码登录简单，但**安全性低、容易被扫**，仅建议临时用。

---

## 三、方式 2：SSH 密钥登录（推荐，免密 + 安全）

### 1. 本地生成密钥（Windows PowerShell）

```powershell
# 一路回车即可；若提示已存在就跳过
ssh-keygen -t ed25519 -C "xiaolanmei@vps"
# 默认生成在 C:\Users\<你>\.ssh\id_ed25519（私钥）和 id_ed25519.pub（公钥）
```

### 2. 把公钥放到 VPS

**自动方式**（能密码登录时最省事）：

```powershell
ssh-copy-id root@<IP>
```

**手动方式**（没有 `ssh-copy-id` 时）：

```powershell
# 本地打印公钥内容
cat $env:USERPROFILE\.ssh\id_ed25519.pub
```

复制输出的那一行，到 VPS 上执行：

```bash
mkdir -p ~/.ssh
echo "<粘贴刚才复制的公钥那一行>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

### 3. 之后免密登录

```bash
ssh root@<IP>      # 不再要密码
```

> 想用域名登录可加 `-p 端口`，或在 `~/.ssh/config` 写别名：
> ```
> Host xiaolan
>   HostName <IP>
>   User root
>   IdentityFile ~/.ssh/id_ed25519
> ```
> 之后 `ssh xiaolan` 即可。

---

## 四、方式 3：云厂商网页终端（应急）

控制台里的「远程连接 / VNC / 救援模式」——密钥丢了、SSH 卡死时用，能直接在浏览器里进系统，
用来**救场排错**，不是日常连接方式。

---

## 五、把小蓝莓跑上去

```bash
# 1) 装 Node 24（better-sqlite3 按 NODE_MODULE_VERSION 137 编译，必须用 Node 24，否则 ERR_DLOPEN_FAILED）
#    Ubuntu/Debian 用 NodeSource 官方二进制（最稳）：
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v        # 期望 v24.x
#    或开发机常用 nvm：`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash` 后 `nvm install 24`

# 2) 拉代码（已含 Ombre Brain 记忆中枢等全部改动）
git clone https://github.com/siuu87/xiaolanmei.git
cd xiaolanmei

# 3) 装依赖
cd 后端 && npm i
cd ../前端 && npm i

# 4) 配环境变量（关键）
cp 后端/.env.example 后端/.env
#   用 vim/nano 编辑 .env：
#     - 填你的 API Key（Base URL + Key + 模型列表）
#     - 把 XINCHAO_URL / OMBRE_DASHBOARD_URL 等从 127.0.0.1 改成
#       VPS 上对应服务的地址（同一台机器就还是 127.0.0.1）
#     - OMBRE_DASHBOARD_PASSWORD 填 Ombre-Brain Dashboard 的真实密码
#   注意：.env 已被 gitignore，不会进仓库，但 VPS 上自己要保护好（别 777）

# 5) 启动（生产用 pm2 守护，掉线/重启自动拉起）
sudo npm i -g pm2
cd 后端 && pm2 start "node --import tsx src/server.ts" --name xiaolan-backend
cd 前端 && npm run build
pm2 serve dist 5173 --name xiaolan-frontend --spa   # 前端生产用静态服务（SPA 回退）
pm2 save && pm2 startup                            # 开机自启（按提示把生成的 sudo 命令跑一遍）
```

**可选侧车**（README 各有启动命令，VPS 上同样用 Node24 / Python 起）：
- 心潮·念 `xinchao/` → :18110
- 小食谱 `recipe-nook/` → :8790
- 记忆相册 `remember-me/` → :8787
- PaiVoice `pai-voice/` → :8780
- 小食谱 / 相册需要 Python3：`sudo apt install -y python3 python3-venv python3-pip`

---

## 六、从外网访问（nginx 反代 + HTTPS）

**原则：防火墙只开 22 / 80 / 443，应用端口（5173 / 3001 / 各侧车）不要直接暴露公网。**

nginx 反代示例（HTTPS 443 → 前端，/api → 后端）：

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;

    ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
    }
    # 后端 API（含 /api/ombre-dashboard 等代理）
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

证书（免费，自动续期）：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

配置好后，浏览器开 `https://your.domain.com` 即可在外网用。

---

## 七、安全注意（强烈建议）

- **密钥只在后端 `.env`，已确认被 gitignore，不会进仓库**；但 VPS 上的 `.env` 要自己保护好（权限 600、别开目录列表）。
- 暴露后端即暴露所有 Key —— 公网访问前先确认（项目约定：未经确认不要发公网链接）。
- SSH 加固：改默认端口、禁用 root 密码登录（只留密钥）、日常用非 root 用户、`apt install fail2ban`。
- 防火墙：`ufw allow 22,80,443`，其余默认 deny。
- 系统更新：`apt update && apt upgrade -y`（周期性做）。

---

## 八、最小可抄清单（假设已能密码登录）

1. 本地 `ssh-keygen -t ed25519`
2. `ssh-copy-id root@<IP>`（或手动贴公钥到 `~/.ssh/authorized_keys`）
3. VPS 上 `git clone` + 前后端 `npm i`
4. 填 `后端/.env`（API Key + 侧车地址 + OMBRE 密码）
5. 起 后端(3001) / 前端(5173) / 需要的侧车
6. nginx 反代 + `certbot` 证书
7. 浏览器开 `https://域名` 访问

> 卡在哪一步，把报错贴给我，我帮你定位。
