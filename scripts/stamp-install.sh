#!/usr/bin/env bash
# 只在发布工作流里运行。把版本和镜像盖进 install.sh 后写到标准输出。
# 不读取 Docker Hub 令牌，也不把用户名写回仓库。

set -eu
set -o pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tag="${MERCLINK_RELEASE_TAG:-${GITHUB_REF_NAME:-}}"
username="${DOCKERHUB_USERNAME:-}"

if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  printf '拒绝非版本 tag: %s\n' "$tag" >&2
  exit 1
fi
if ! [[ "$username" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  printf 'DOCKERHUB_USERNAME 必须是单个命名空间\n' >&2
  exit 1
fi

version="${tag#v}"
# 正式版一键安装直接用 latest，操作员不用填版本号。预发布不移动 Docker 的 latest，仍钉版本号。
if [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  image="docker.io/${username}/merclink:latest"
else
  image="docker.io/${username}/merclink:${version}"
fi

awk -v tag="$tag" -v image="$image" '
  /^STAMPED_TAG=/ { print "STAMPED_TAG=\"" tag "\""; next }
  /^STAMPED_IMAGE=/ { print "STAMPED_IMAGE=\"" image "\""; next }
  { print }
' "${root}/scripts/install.sh"
