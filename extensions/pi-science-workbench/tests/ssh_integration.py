"""Explicit opt-in real SSH smoke test. Never changes SSH configuration."""
import os
import subprocess
import sys

alias=os.environ.get('SCIENCE_TEST_SSH_ALIAS')
python=os.environ.get('SCIENCE_TEST_REMOTE_PYTHON')
root=os.environ.get('SCIENCE_TEST_REMOTE_ROOT')
if not all((alias,python,root)):
    print('SKIPPED: set SCIENCE_TEST_SSH_ALIAS, SCIENCE_TEST_REMOTE_PYTHON and SCIENCE_TEST_REMOTE_ROOT to an authorized disposable endpoint.')
    sys.exit(0)
subprocess.run(['node','--experimental-strip-types','tests/ssh-smoke.mjs'],check=True)
