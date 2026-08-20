#!/bin/sh
set -eu

PI_CONFIG_REPO="${PI_CONFIG_REPO:-lychen2/pi_config}"
# PI_CONFIG_ARCHIVE_URL 可直接指定归档地址（覆盖提交解析）；默认解析并固定最新提交。
REPO_ARCHIVE_URL="${PI_CONFIG_ARCHIVE_URL:-}"
# 官方 Pi 引导脚本固定下载地址 + sha256 完整性校验（上游脚本内容变更时更新常量）。
PI_INSTALL_URL="${PI_INSTALL_URL:-https://pi.dev/install.sh}"
PI_INSTALL_SHA256="${PI_INSTALL_SHA256:-d3ad02c775a6b2a78974b242dd7742a3612cd8be6b58a977516053d9f9897a41}"
PI_CONFIG_HOME="${PI_CONFIG_HOME:-$HOME/.pi_config}"
DRY_RUN=0
for argument in "$@"; do
  [ "$argument" = "--dry-run" ] && DRY_RUN=1
done

say() {
  printf '\n==> %s\n' "$1"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    return 1
  fi
}

have_supported_node() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&(b>19||(b===19&&c>=0)))?0:1)' >/dev/null 2>&1
}

refresh_path() {
  for directory in \
    "$HOME/.local/bin" \
    "$HOME/.local/share/pi-node/current/bin" \
    "${XDG_DATA_HOME:-$HOME/.local/share}/pi-node/current/bin"; do
    if [ -d "$directory" ]; then
      PATH="$directory:$PATH"
    fi
  done
  export PATH
}

install_pi() {
  if have_supported_node && command -v npm >/dev/null 2>&1 && command -v pi >/dev/null 2>&1; then
    return
  fi

  command -v curl >/dev/null 2>&1 || {
    printf 'curl is required. Install curl, then run this script again.\n' >&2
    exit 1
  }

  say "Installing Node.js and Pi with the official Pi installer"
  installer_script=$(mktemp "${TMPDIR:-/tmp}/pi-install.XXXXXX")
  trap 'rm -f "$installer_script"' EXIT HUP INT TERM
  if ! curl -fsSL --max-time 300 "$PI_INSTALL_URL" -o "$installer_script"; then
    printf 'Failed to download the Pi installer from %s.\n' "$PI_INSTALL_URL" >&2
    exit 1
  fi
  actual_hash=$(sha256_of "$installer_script") || {
    printf 'sha256sum or shasum is required to verify the Pi installer.\n' >&2
    exit 1
  }
  if [ "$actual_hash" != "$PI_INSTALL_SHA256" ]; then
    printf 'Pi installer integrity check failed: expected %s, got %s.\n' "$PI_INSTALL_SHA256" "$actual_hash" >&2
    printf 'Refusing to run the unverified script. Update PI_INSTALL_SHA256 only after reviewing upstream changes.\n' >&2
    exit 1
  fi
  sh "$installer_script"
  rm -f "$installer_script"
  trap - EXIT HUP INT TERM
  refresh_path

  have_supported_node || {
    printf 'Node.js 22.19.0 or newer was not found after installation.\n' >&2
    exit 1
  }
  command -v pi >/dev/null 2>&1 || {
    printf 'Pi was installed but is not on PATH. Add ~/.local/bin to PATH and rerun.\n' >&2
    exit 1
  }
}

run_admin() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

install_git() {
  if command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then
    return
  fi

  say "Installing Git"
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install git
      else
        printf 'macOS will open the Command Line Tools installer. Complete it to enable Git-based Pi packages.\n'
        xcode-select --install 2>/dev/null || true
      fi
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        run_admin apt-get update && run_admin apt-get install -y git
      elif command -v dnf >/dev/null 2>&1; then
        run_admin dnf install -y git
      elif command -v yum >/dev/null 2>&1; then
        run_admin yum install -y git
      elif command -v apk >/dev/null 2>&1; then
        run_admin apk add --update-cache git
      elif command -v pacman >/dev/null 2>&1; then
        run_admin pacman -Sy --needed --noconfirm git
      elif command -v zypper >/dev/null 2>&1; then
        run_admin zypper --non-interactive install git
      else
        printf 'No supported package manager was found; Git-based Pi packages will be skipped.\n' >&2
      fi
      ;;
  esac

  if ! command -v git >/dev/null 2>&1 || ! git --version >/dev/null 2>&1; then
    printf 'Git is still unavailable; npm and local packages can still be installed.\n' >&2
  fi
}

resolve_archive_url() {
  if [ -n "${REPO_ARCHIVE_URL:-}" ]; then
    printf '%s\n' "$REPO_ARCHIVE_URL"
    return
  fi

  commit_response=$(curl -fsSL --max-time 30 \
    -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$PI_CONFIG_REPO/commits/main") || {
    printf 'Failed to resolve the latest pi_config commit.\n' >&2
    exit 1
  }
  latest_commit=$(printf '%s\n' "$commit_response" |
    tr ',' '\n' |
    sed -n 's/.*"sha": *"\([0-9a-f]\{40\}\)".*/\1/p' |
    head -n 1)
  if [ -z "$latest_commit" ]; then
    printf 'The pi_config commit response had no sha.\n' >&2
    exit 1
  fi
  printf 'https://github.com/%s/archive/%s.tar.gz\n' "$PI_CONFIG_REPO" "$latest_commit"
}

find_repository() {
  script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || pwd)
  if [ -f "$script_dir/install.mjs" ] && [ -d "$script_dir/config" ]; then
    REPO_DIR=$script_dir
    return
  fi

  if [ -f "$PI_CONFIG_HOME/install.mjs" ] && [ -d "$PI_CONFIG_HOME/config" ]; then
    REPO_DIR=$PI_CONFIG_HOME
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'Dry-run requires an existing local pi_config checkout and Node.js 22.19.0 or newer.\n' >&2
    exit 1
  fi

  if [ -e "$PI_CONFIG_HOME" ]; then
    printf '%s exists but is not a complete pi_config checkout. Move it, then rerun.\n' "$PI_CONFIG_HOME" >&2
    exit 1
  fi

  command -v curl >/dev/null 2>&1 || {
    printf 'curl is required to download pi_config.\n' >&2
    exit 1
  }
  command -v tar >/dev/null 2>&1 || {
    printf 'tar is required to extract pi_config.\n' >&2
    exit 1
  }

  say "Downloading pi_config to $PI_CONFIG_HOME"
  archive_url=$(resolve_archive_url)
  mkdir -p "$PI_CONFIG_HOME"
  if ! curl -fsSL --max-time 600 "$archive_url" | tar -xz -C "$PI_CONFIG_HOME" --strip-components=1; then
    rm -rf "$PI_CONFIG_HOME"
    printf 'Failed to download or extract pi_config from %s.\n' "$archive_url" >&2
    exit 1
  fi
  REPO_DIR=$PI_CONFIG_HOME
}

refresh_path
if [ "$DRY_RUN" -eq 1 ]; then
  have_supported_node || {
    printf 'Dry-run requires Node.js 22.19.0 or newer.\n' >&2
    exit 1
  }
else
  install_pi
  install_git
fi
find_repository

say "Running the pi_config installer"
if [ -t 0 ]; then
  exec node "$REPO_DIR/install.mjs" "$@"
fi
if ( : </dev/tty ) 2>/dev/null; then
  exec node "$REPO_DIR/install.mjs" "$@" </dev/tty
fi
exec node "$REPO_DIR/install.mjs" --yes "$@"
