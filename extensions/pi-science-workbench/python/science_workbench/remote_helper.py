"""One-request SSH helper; all user parameters arrive as JSON on stdin."""
import base64
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def main(request):
    root = Path(request['root'])
    if not root.is_absolute() or root == Path('/'):
        raise ValueError('invalid_remote_root')
    for component in [root, *root.parents]:
        if component.is_symlink():
            raise ValueError('symlink_rejected')
    run_id = request['run_id']
    if len(run_id) > 128 or not all(c.isalnum() or c in '-_' for c in run_id):
        raise ValueError('invalid_run_id')
    run = root / run_id
    action = request['action']
    if action == 'stage':
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if root.stat().st_uid != os.getuid():
            raise ValueError('remote_root_not_owned')
        staging = root / (run_id + '.staging')
        staging.mkdir(exist_ok=True, mode=0o700)
        if staging.is_symlink():
            raise ValueError('symlink_rejected')
        name = request['path']
        parts = Path(name).parts
        if not name.startswith('inputs/') or Path(name).is_absolute() or any(p in ('.','..') for p in parts) or '\\' in name:
            raise ValueError('unsafe_stage_path')
        target = staging
        for i, part in enumerate(parts):
            target = target / part
            if target.is_symlink():
                raise ValueError('symlink_rejected')
            if i < len(parts)-1:
                target.mkdir(exist_ok=True, mode=0o700)
        data = base64.b64decode(request['data'], validate=True)
        offset = request['offset']
        if len(data)>256*1024 or not isinstance(offset,int) or offset<0 or offset+len(data)>request['size'] or request['size']>request['max_transfer_bytes']:
            raise ValueError('invalid_stage_chunk')
        if target.exists():
            with open(target,'r+b') as stream:
                size=target.stat().st_size
                if offset<size:
                    stream.seek(offset)
                    if stream.read(len(data))!=data:
                        raise ValueError('stage_conflict')
                elif offset==size:
                    stream.seek(offset)
                    stream.write(data)
                else:
                    raise ValueError('stage_gap')
        else:
            if offset!=0:
                raise ValueError('stage_gap')
            with open(target,'xb') as stream:
                stream.write(data)
        return {'next_offset':offset+len(data)}
    if action == 'submit':
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if root.stat().st_uid != os.getuid():
            raise ValueError('remote_root_not_owned')
        try:
            run.mkdir(mode=0o700)
        except FileExistsError:
            return {'status': 'existing', 'run_id': run_id}
        worker = base64.b64decode(request['worker'], validate=True)
        if hashlib.sha256(worker).hexdigest() != request['worker_digest']:
            raise ValueError('worker_digest_mismatch')
        (run / 'worker.py').write_bytes(worker)
        sys.path.insert(0, str(run))
        import worker as w
        for name in ('logs','inputs','artifacts','validations'):
            (run / name).mkdir(mode=0o700)
        total = 0
        for item in request['inputs']:
            target = w.safe_path(run, item['path'], create=True)
            if 'data' in item:
                data = base64.b64decode(item['data'], validate=True)
                total += len(data)
                if total > request['max_transfer_bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
                    raise ValueError('input_integrity_failed')
                with open(target, 'xb') as stream:
                    stream.write(data)
            else:
                staged=w.safe_path(root/(run_id+'.staging'),item['path'])
                total+=staged.stat().st_size
                if total>request['max_transfer_bytes'] or staged.stat().st_size!=item['size_bytes'] or w.digest(staged)!=item['sha256']:
                    raise ValueError('input_integrity_failed')
                os.replace(staged,target)
        spec = request['spec']
        spec['cwd'] = str(run)
        w.atomic(run / 'request.json', {**spec, 'environment': {'names': list(spec.get('environment', {}))}})
        pid = os.fork()
        if pid:
            os.waitpid(pid, 0)
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if (run / 'supervisor.json').exists():
                    return {'status':'submitted','run_id':run_id}
                time.sleep(.05)
            raise ValueError('submission_unknown')
        os.setsid()
        if os.fork():
            os._exit(0)
        null = os.open('/dev/null', os.O_RDWR)
        for fd in (0,1,2):
            os.dup2(null,fd)
        if null > 2:
            os.close(null)
        proc = subprocess.Popen([sys.executable,'-I','-B',str(run/'worker.py'),'job-supervisor'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(run/'supervisor-error.log','wb'),close_fds=True)
        w.atomic(run/'supervisor.json',{'pid':os.getpid(),'process_start':w.identity(os.getpid())})
        signal.signal(signal.SIGTERM, lambda *_: w.send(proc.stdin, {'action':'cancel','protocol_version':1}))
        w.send(proc.stdin,spec)
        try:
            while True:
                result=w.receive(proc.stdout)
                if result.get('type')=='finished':
                    break
        except EOFError:
            pass
        finally:
            proc.stdin.close()
            proc.wait()
        os._exit(0)
    if not run.is_dir() or run.is_symlink():
        raise ValueError('remote_run_missing')
    sys.path.insert(0,str(run))
    import worker as w
    if action == 'poll':
        state_file=run/'worker-state.json'
        if not state_file.exists():
            return {'execution_status':'unknown'}
        state=json.loads(state_file.read_text())
        if state['execution_status']=='running':
            identity=json.loads((run/'supervisor.json').read_text())
            if w.identity(identity['pid'])!=identity['process_start']:
                state['execution_status']='unknown'
        return state
    if action == 'cancel':
        ident=json.loads((run/'supervisor.json').read_text())
        if w.identity(ident['pid'])!=ident['process_start']:
            return {'execution_status':'unknown','cancellation_confirmed':False}
        os.kill(ident['pid'],signal.SIGTERM)
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            state=main({**request,'action':'poll'})
            if state['execution_status'] not in ('running','unknown'):
                return state
            time.sleep(.1)
        return {'execution_status':'unknown','cancellation_confirmed':False}
    if action == 'read':
        name=request['path']
        if not (name.startswith('artifacts/') or name in ('logs/stdout.log','logs/stderr.log')):
            raise ValueError('path_not_harvestable')
        file=w.safe_path(run,name)
        if not file.is_file():
            return {'missing':True}
        size=file.stat().st_size
        offset=request.get('offset',0)
        if not isinstance(offset,int) or offset<0:
            raise ValueError('invalid_offset')
        with open(file,'rb') as stream:
            stream.seek(offset)
            data=stream.read(256*1024)
        return {'data':base64.b64encode(data).decode(),'size':size,'sha256':w.digest(file),'next_offset':offset+len(data)}
    raise ValueError('unknown_action')


if __name__=='__main__':
    os.umask(0o077)
    try:
        request=json.loads(sys.stdin.buffer.read(4*1024*1024+1))
        print(json.dumps(main(request)))
    except Exception as error:
        print(json.dumps({'error':str(error)}))
        sys.exit(1)
