#!/usr/bin/env bash
# 正式部署入口。永久地址是 GitHub Release 的 latest/download/install.sh。
# 仓库里的这份保留占位符。发布工作流只在上传的资源里盖上版本和镜像。
# 不安装系统包，不关闭 TLS 校验，不在部署机编译应用。

set -eu
set -o pipefail

# stamp-install.sh 只改这两行赋值。比较用的占位符必须留在下面的判断里。
STAMPED_TAG="__MERCLINK_RELEASE_TAG__"
STAMPED_IMAGE="__MERCLINK_IMAGE__"

INSTALL_DIR="${MERCLINK_INSTALL_DIR:-/opt/merclink}"
REPO_RAW="https://raw.githubusercontent.com/ptonlix/MercLink"
ACTION="install"

usage() {
  cat <<'EOF'
用法：
  install.sh              第一次安装
  install.sh upgrade      升级到这个脚本对应的版本，不改已有密码

第一次安装：
  curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh

升级：
  curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh upgrade
EOF
}

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "没有找到 $1。请先安装它，这个脚本不会自动安装软件。"
}

resolve_release() {
  if [ "$STAMPED_TAG" = "__MERCLINK_RELEASE_TAG__" ] || [ "$STAMPED_IMAGE" = "__MERCLINK_IMAGE__" ]; then
    TAG="${MERCLINK_RELEASE_TAG:-}"
    IMAGE="${MERCLINK_IMAGE:-}"
    if [ -z "$TAG" ] || [ -z "$IMAGE" ]; then
      die "请使用发布页上的 install.sh。如果是在仓库里直接运行，请同时设置 MERCLINK_RELEASE_TAG 和 MERCLINK_IMAGE。"
    fi
  else
    TAG="$STAMPED_TAG"
    IMAGE="$STAMPED_IMAGE"
  fi
  if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    die "版本号格式不对：${TAG}。应为 v1.2.3 这种形式。"
  fi
  VERSION="${TAG#v}"
  stable=0
  if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    stable=1
  fi
  case "$IMAGE" in
    docker.io/*/merclink:latest)
      if [ "$stable" -ne 1 ]; then
        die "预发布不能使用 latest 镜像。请使用 docker.io/<用户名>/merclink:${VERSION}。"
      fi
      ;;
    docker.io/*/merclink:"${VERSION}")
      ;;
    *)
      if [ "$stable" -eq 1 ]; then
        die "镜像地址必须是 docker.io/<用户名>/merclink:latest。"
      fi
      die "镜像地址必须是 docker.io/<用户名>/merclink:${VERSION}。"
      ;;
  esac
  namespace="${IMAGE#docker.io/}"
  namespace="${namespace%%/merclink:*}"
  case "$namespace" in
    ""|*[!A-Za-z0-9._-]*)
      die "镜像用户名只能包含字母、数字、点、下划线和短横线。"
      ;;
  esac
  COMPOSE_URL="${REPO_RAW}/${TAG}/compose.yaml"
}

valid_hostname() {
  case "$1" in
    ""|*[!A-Za-z0-9.-]*|.*|*.|-*|*-|*..*|*.-*)
      return 1
      ;;
    *.*)
      ;;
    *)
      return 1
      ;;
  esac
  case "$1" in
    localhost|localhost.*)
      return 1
      ;;
  esac
  case "$1" in
    *[!0-9.]*)
      return 0
      ;;
  esac
  return 1
}

valid_email() {
  case "$1" in
    ""|*[!A-Za-z0-9._%+@-]*|@*|.*@|*@|*@.*|*@*.|*"@"*"@"*)
      return 1
      ;;
    *@*.*)
      return 0
      ;;
  esac
  return 1
}

valid_phone() {
  case "$1" in
    1[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9])
      return 0
      ;;
  esac
  return 1
}

prompt_var() {
  name="$1"
  label="$2"
  eval "current=\${${name}:-}"
  if [ -n "$current" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    die "还没有 ${name}。自动安装时，请在命令前先设置这个变量。"
  fi
  printf '%s: ' "$label" >&2
  IFS= read -r current || die "没有读到 ${name}，安装已停止。"
  if [ -z "$current" ]; then
    die "${name} 不能留空。"
  fi
  eval "${name}=\${current}"
}

url_secret() {
  length="$1"
  raw=""
  while [ "${#raw}" -lt "$length" ]; do
    chunk="$(openssl rand -base64 48)" || return 1
    chunk="$(printf '%s' "$chunk" | tr -dc 'A-Za-z0-9')"
    if [ -z "$chunk" ]; then
      return 1
    fi
    raw="${raw}${chunk}"
  done
  printf '%s' "${raw:0:${length}}"
}

port_busy() {
  port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -E "[:.]${port}([^0-9]|\$)" >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi
  die "无法确认 ${port} 端口是否空闲。请先安装 iproute2（里面有 ss 命令）再运行。脚本不会自动安装软件。"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    die "没有找到 Docker。请先安装 Docker，脚本不会自动安装。"
  fi
  docker compose version >/dev/null 2>&1 || die "没有找到 Docker Compose 插件。请先安装，脚本不会自动安装。"
  docker info >/dev/null 2>&1 || die "连不上 Docker。请确认当前用户可以运行 docker。"
}

ensure_dir() {
  if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
    die "无法创建 ${INSTALL_DIR}。请用有写入权限的用户运行，通常需要 root。脚本不会自动安装软件。"
  fi
  if [ ! -w "$INSTALL_DIR" ]; then
    die "没有权限写入 ${INSTALL_DIR}。"
  fi
  chmod 700 "$INSTALL_DIR"
}

download_compose() {
  dest="$1"
  tmp="$(mktemp "${dest}.XXXXXX")"
  if [ -n "${MERCLINK_COMPOSE_FILE:-}" ]; then
    cp "$MERCLINK_COMPOSE_FILE" "$tmp"
  else
    need_cmd curl
    curl -fsSL -o "$tmp" "$COMPOSE_URL"
  fi
  if ! grep -q '^name: merclink$' "$tmp"; then
    rm -f "$tmp"
    die "下载到的 compose.yaml 不是 MercLink 的正式部署文件，已停止。"
  fi
  mv "$tmp" "$dest"
}

write_env() {
  admin_password="$1"
  oauth_secret="$2"
  postgres_password="$3"
  redis_password="$4"
  rustfs_access="$5"
  rustfs_secret="$6"
  tmp="$(mktemp "${INSTALL_DIR}/.env.XXXXXX")"
  {
    printf '%s\n' "# Generated on the deploy host. Do not commit."
    printf 'MERCLINK_IMAGE=%s\n' "$IMAGE"
    printf 'MERCLINK_RELEASE_TAG=%s\n' "$TAG"
    printf 'COMPOSE_PROFILES=%s\n' "caddy"
    printf 'APP_DOMAIN=%s\n' "$APP_DOMAIN"
    printf 'ACME_EMAIL=%s\n' "$ACME_EMAIL"
    if [ -n "${APEX_DOMAIN:-}" ]; then
      printf 'APEX_DOMAIN=%s\n' "$APEX_DOMAIN"
    fi
    printf 'APP_BIND=%s\n' "127.0.0.1"
    printf 'APP_BASE_URL=%s\n' "https://${APP_DOMAIN}"
    printf 'ADMIN_PHONE=%s\n' "$ADMIN_PHONE"
    printf 'ADMIN_PASSWORD=%s\n' "$admin_password"
    printf 'OAUTH_SIGNING_SECRET=%s\n' "$oauth_secret"
    printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
    printf 'REDIS_PASSWORD=%s\n' "$redis_password"
    printf 'RUSTFS_ACCESS_KEY=%s\n' "$rustfs_access"
    printf 'RUSTFS_SECRET_KEY=%s\n' "$rustfs_secret"
  } >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "${INSTALL_DIR}/.env"
}

update_env_key() {
  key="$1"
  value="$2"
  file="${INSTALL_DIR}/.env"
  tmp="$(mktemp "${file}.XXXXXX")"
  awk -v k="$key" -v v="$value" '
    BEGIN { found = 0 }
    index($0, k "=") == 1 {
      print k "=" v
      found = 1
      next
    }
    { print }
    END {
      if (!found) print k "=" v
    }
  ' "$file" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

collect_identity() {
  prompt_var APP_DOMAIN "公网域名，例如 shop.example，不要写 https://"
  prompt_var ACME_EMAIL "证书通知邮箱，用于接收证书到期提醒"
  prompt_var ADMIN_PHONE "管理员手机号，11 位大陆手机号"
  valid_hostname "$APP_DOMAIN" || die "公网域名格式不对。请只写域名，例如 shop.example，不要写 https://。"
  valid_email "$ACME_EMAIL" || die "邮箱格式不对。请填写普通邮箱，例如 ops@example.com。"
  valid_phone "$ADMIN_PHONE" || die "管理员手机号必须是 11 位大陆手机号，例如 13800138000。"
  if [ -n "${APEX_DOMAIN:-}" ]; then
    valid_hostname "$APEX_DOMAIN" || die "裸域名格式不对。请只写域名，不要写 https://。"
    if [ "$APEX_DOMAIN" = "$APP_DOMAIN" ]; then
      die "裸域名不能和公网域名相同。"
    fi
  fi
}

confirm_install() {
  printf '准备安装到：%s\n应用镜像：%s\n站点地址：https://%s\n' "$INSTALL_DIR" "$IMAGE" "$APP_DOMAIN" >&2
  if [ "${MERCLINK_ASSUME_YES:-}" = "1" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    die "当前无法提问。若要自动继续，请在命令前加上 MERCLINK_ASSUME_YES=1。"
  fi
  printf '确认开始安装？输入 y 继续，直接回车取消：' >&2
  IFS= read -r reply || die "没有收到确认，安装已停止。"
  case "$reply" in
    y|Y) ;;
    *) die "已取消，没有写入配置。" ;;
  esac
}

compose() {
  # 外壳里的同名变量会盖过 .env。启动时以刚写入的文件为准。
  env -u MERCLINK_IMAGE -u MERCLINK_RELEASE_TAG \
    docker compose --project-directory "$INSTALL_DIR" -f "${INSTALL_DIR}/compose.yaml" "$@"
}

start_stack() {
  if ! compose pull; then
    die "镜像没有拉取成功。
配置和密码已经写在 ${INSTALL_DIR}/.env，不要删除，否则已有数据会对不上。
修好后进入该目录执行：
  docker compose pull && docker compose up -d
也可以重新运行本脚本的 upgrade。"
  fi
  if ! compose up -d; then
    die "服务没有启动成功。
配置和密码已经写在 ${INSTALL_DIR}/.env，不要删除。
可以查看日志：docker compose --project-directory ${INSTALL_DIR} logs
修好后在该目录执行 docker compose pull && docker compose up -d，或重新运行 upgrade。"
  fi
}

cmd_install() {
  if [ -f "${INSTALL_DIR}/.env" ]; then
    die "${INSTALL_DIR} 里已经有配置，不能再次安装，以免覆盖密码。
要升级版本，请运行 install.sh upgrade。"
  fi
  require_docker
  if port_busy 80 || port_busy 443; then
    die "80 或 443 端口已被其他程序占用，安装已停止。
请先空出这两个端口。脚本不会关闭现有网站或代理。"
  fi
  collect_identity
  confirm_install
  ensure_dir
  need_cmd openssl
  admin_password="$(url_secret 24)" || exit 1
  oauth_secret="$(url_secret 32)" || exit 1
  postgres_password="$(url_secret 32)" || exit 1
  redis_password="$(url_secret 32)" || exit 1
  rustfs_access="$(url_secret 20)" || exit 1
  rustfs_secret="$(url_secret 32)" || exit 1
  download_compose "${INSTALL_DIR}/compose.yaml"
  write_env \
    "$admin_password" \
    "$oauth_secret" \
    "$postgres_password" \
    "$redis_password" \
    "$rustfs_access" \
    "$rustfs_secret"
  start_stack
  printf '安装完成。\n站点地址：https://%s\n管理员手机号：%s\n管理员初始密码：%s\n请登录后马上修改密码。这个密码不会再显示。\n买家下单默认关闭。需要收款时，再编辑 %s/.env，设置 MERCLINK_PURCHASE=1 并填写支付密钥。\n应用镜像：%s\n' \
    "$APP_DOMAIN" "$ADMIN_PHONE" "$admin_password" "$INSTALL_DIR" "$IMAGE"
}

cmd_upgrade() {
  if [ ! -f "${INSTALL_DIR}/.env" ]; then
    die "还没有安装过，找不到 ${INSTALL_DIR}/.env。请先安装，不要直接升级。"
  fi
  require_docker
  ensure_dir
  download_compose "${INSTALL_DIR}/compose.yaml.next"
  mv "${INSTALL_DIR}/compose.yaml.next" "${INSTALL_DIR}/compose.yaml"
  update_env_key MERCLINK_IMAGE "$IMAGE"
  update_env_key MERCLINK_RELEASE_TAG "$TAG"
  start_stack
  printf '已升级。应用镜像：%s。\n密码和已有配置没有改动。\n' "$IMAGE"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi
if [ "${1:-}" = "upgrade" ]; then
  ACTION="upgrade"
elif [ -n "${1:-}" ] && [ "${1:-}" != "install" ]; then
  usage >&2
  die "不认识的命令：$1。可以用 install 或 upgrade。"
fi

resolve_release
case "$ACTION" in
  install) cmd_install ;;
  upgrade) cmd_upgrade ;;
esac
