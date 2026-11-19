#!/usr/bin/env python3
"""Host-specific application launch and ownership checks for niri agent seat."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

HOME = Path.home()

def run(args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=40)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout

def windows():
    return json.loads(run(['niri', 'msg', '-j', 'windows']))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('list')
    launch = sub.add_parser('launch')
    launch.add_argument('app', choices=['zen', 'zed'])
    launch.add_argument('target', nargs='?')
    close = sub.add_parser('close')
    close.add_argument('id', type=int)
    args = parser.parse_args()
    if args.action == 'list':
        print(json.dumps(windows(), ensure_ascii=False))
        return
    if args.action == 'close':
        window = next((w for w in windows() if w['id'] == args.id), None)
        if not window or not window.get('is_agent'):
            raise RuntimeError('Refusing to close a missing or user-owned window.')
        print(run(['niri', 'msg', 'action', 'close-window', '--id', str(args.id)]))
        return
    if args.app == 'zen':
        profile = HOME / '.config/zen-mcp'
        profile.mkdir(parents=True, exist_ok=True)
        command = ['env', 'MOZ_ENABLE_WAYLAND=1', 'zen-browser', '--new-instance',
                   '--profile', str(profile), args.target or 'about:blank']
    else:
        data = HOME / '.local/share/niri-agent/zed'
        data.mkdir(parents=True, exist_ok=True)
        config = data / 'config'
        config.mkdir(exist_ok=True)
        for name in ('settings.json', 'keymap.json', 'themes'):
            source = HOME / '.config/zed' / name
            target = config / name
            if source.exists() and not target.exists() and not target.is_symlink():
                target.symlink_to(source, target_is_directory=source.is_dir())
        command = ['zeditor', '--new', '--user-data-dir', str(data)]
        if args.target:
            command.append(str(Path(args.target).expanduser().absolute()))
    print(run(['niri', 'msg', 'agent', 'launch', '--', *command]))

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
