"""Trusted-host worker. Standard library only; control is separate from user output."""
import base64
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import selectors
import signal
import socket
import struct
import subprocess
import sys
import time
import traceback
import uuid

MAX_FRAME = 2 * 1024 * 1024
VERSION = 1


def send(stream, value):
    data = json.dumps(value, allow_nan=False).encode()
    if len(data) > MAX_FRAME:
        raise ValueError('protocol_frame_too_large')
    stream.write(struct.pack('!I', len(data)) + data)
    stream.flush()


def exact(stream, count):
    chunks = bytearray()
    while len(chunks) < count:
        data = stream.read(count - len(chunks))
        if not data:
            raise EOFError()
        chunks.extend(data)
    return bytes(chunks)


def receive(stream):
    size = struct.unpack('!I', exact(stream, 4))[0]
    if size > MAX_FRAME:
        raise ValueError('protocol_frame_too_large')
    return json.loads(exact(stream, size))


def atomic(file, value):
    file = Path(file)
    temporary = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    with open(temporary, 'x', encoding='utf8') as stream:
        os.chmod(temporary, 0o600)
        json.dump(value, stream, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, file)


def safe_path(root, relative, create=False):
    root = Path(root)
    parts = Path(relative).parts
    if not parts or Path(relative).is_absolute() or any(p in ('..', '.') for p in parts) or '\x00' in relative or '\\' in relative:
        raise ValueError('unsafe_path')
    current = root
    if root.is_symlink():
        raise ValueError('unsafe_path')
    for index, part in enumerate(parts):
        current = current / part
        if current.is_symlink():
            raise ValueError('symlink_rejected')
        if create and index < len(parts) - 1:
            current.mkdir(exist_ok=True, mode=0o700)
    return current


def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def identity(pid):
    try:
        # comm can contain spaces and parentheses.
        return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError):
        return None


def stop(proc):
    for sig, delay in ((signal.SIGINT, 2), (signal.SIGTERM, 3), (signal.SIGKILL, 0.2)):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            break
        deadline = time.monotonic() + delay
        while time.monotonic() < deadline:
            proc.poll()
            try:
                os.killpg(proc.pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.02)
    try:
        proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def kernel(fd):
    control = socket.socket(fileno=fd).makefile('rwb', buffering=0)
    namespace = {'__name__': '__main__'}
    while True:
        try:
            request = receive(control)
        except EOFError:
            return
        try:
            os.chdir(request['cwd'])
            exec(compile(request['code'], '<science-cell>', 'exec'), namespace)
            response = {'execution_status': 'succeeded'}
        except BaseException:
            traceback.print_exc()
            response = {'execution_status': 'failed', 'state_may_be_partial': True}
        sys.stdout.flush()
        sys.stderr.flush()
        send(control, response)


def supervisor(mode):
    proc = None
    kernel_control = None
    kernel_id = uuid.uuid4().hex
    control_in, control_out = sys.stdin.buffer, sys.stdout.buffer
    try:
        while True:
            try:
                request = receive(control_in)
            except EOFError:
                return
            if request.get('protocol_version') != VERSION:
                raise ValueError('protocol_version_mismatch')
            if request.get('action') == 'shutdown':
                return
            run = Path(request['cwd'])
            run.mkdir(exist_ok=True, mode=0o700)
            (run / 'logs').mkdir(exist_ok=True, mode=0o700)
            start = time.monotonic()
            state = {'execution_status': 'running', 'started_at': time.time(), 'kernel_instance_id': kernel_id}
            if mode == 'kernel' and proc is None:
                parent, child = socket.socketpair()
                proc = subprocess.Popen([sys.executable, '-I', '-B', __file__, 'kernel', str(child.fileno())],
                                        pass_fds=(child.fileno(),), stdin=subprocess.DEVNULL,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
                child.close()
                kernel_control = parent.makefile('rwb', buffering=0)
            elif mode == 'job':
                proc = subprocess.Popen([request['executable'], *request.get('argv', [])], cwd=run,
                                        env=request.get('environment', {}), stdin=subprocess.DEVNULL,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
            state.update(pid=proc.pid, process_start=identity(proc.pid))
            atomic(run / 'worker-state.json', state)
            send(control_out, {**state, 'type': 'started', 'protocol_version': VERSION,
                               'request_id': request['request_id'], 'generation': request['generation']})
            if mode == 'kernel':
                send(kernel_control, request)
            selector = selectors.DefaultSelector()
            selector.register(control_in, selectors.EVENT_READ, 'control')
            selector.register(proc.stdout, selectors.EVENT_READ, 'stdout')
            selector.register(proc.stderr, selectors.EVENT_READ, 'stderr')
            if kernel_control:
                selector.register(kernel_control, selectors.EVENT_READ, 'kernel')
            logs = {name: open(run / 'logs' / (name + '.log'), 'wb') for name in ('stdout', 'stderr')}
            count, reason, result = 0, None, None
            try:
                while result is None and reason is None:
                    if time.monotonic() - start > request['timeout_seconds']:
                        reason = 'timed_out'
                        break
                    for key, _ in selector.select(0.05):
                        if key.data == 'control':
                            try:
                                message = receive(control_in)
                                reason = 'cancelled' if message.get('action') in ('cancel', 'shutdown') else 'protocol_error'
                            except EOFError:
                                reason = 'cancelled'
                        elif key.data == 'kernel':
                            try:
                                result = receive(kernel_control)
                            except EOFError:
                                result = {'execution_status': 'failed', 'termination_reason': 'kernel_exited'}
                        else:
                            data = os.read(key.fileobj.fileno(), 65536)
                            if not data:
                                selector.unregister(key.fileobj)
                            else:
                                remaining = max(0, request['max_log_bytes'] - count)
                                logs[key.data].write(data[:remaining])
                                count += len(data)
                                if count > request['max_log_bytes']:
                                    reason = 'log_limit_exceeded'
                    if mode == 'job' and proc.poll() is not None:
                        # Wait for both pipes to drain; inherited open pipes remain bounded by timeout.
                        if not any(k.data in logs for k in selector.get_map().values()):
                            result = {'execution_status': 'succeeded' if proc.returncode == 0 else 'failed', 'exit_code': proc.returncode}
                    if mode == 'kernel' and proc.poll() is not None and result is None:
                        result = {'execution_status': 'failed', 'termination_reason': 'kernel_exited'}
                # Kernel completion and pipe data can arrive in the same scheduling interval.
                for key in list(selector.get_map().values()):
                    if key.data in logs:
                        os.set_blocking(key.fileobj.fileno(), False)
                        while True:
                            try:
                                data = os.read(key.fileobj.fileno(), 65536)
                            except BlockingIOError:
                                break
                            if not data:
                                break
                            remaining = max(0, request['max_log_bytes'] - count)
                            logs[key.data].write(data[:remaining])
                            count += len(data)
                            if count > request['max_log_bytes']:
                                reason = 'log_limit_exceeded'
                        os.set_blocking(key.fileobj.fileno(), True)
            finally:
                selector.close()
                for stream in logs.values():
                    stream.close()
            if reason:
                stop(proc)
                result = {'execution_status': reason if reason in ('cancelled', 'timed_out') else 'failed',
                          'termination_reason': reason, 'kernel_state_lost': mode == 'kernel'}
            state.update(result, ended_at=time.time(), duration_ms=round((time.monotonic()-start)*1000), log_bytes=min(count, request['max_log_bytes']))
            atomic(run / 'worker-state.json', state)
            send(control_out, {**state, 'type': 'finished', 'protocol_version': VERSION,
                               'request_id': request['request_id'], 'generation': request['generation']})
            if mode == 'job' or reason or proc.poll() is not None:
                return
    finally:
        if proc:
            stop(proc)
        if kernel_control:
            kernel_control.close()


def finite(value):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('non_finite_value')
    if isinstance(value, dict):
        for item in value.values():
            finite(item)
    if isinstance(value, list):
        for item in value:
            finite(item)


def validate(request):
    root = Path(request['cwd'])
    observations = []
    for item in request['checks']:
        check = item['id']
        params = item.get('parameters', {})
        try:
            file = safe_path(root, params['path']) if 'path' in params else None
            if file and file.stat().st_size > params.get('max_bytes', 64*1024*1024):
                raise ValueError('validation_input_too_large')
            metrics = {}
            if check == 'json':
                data = json.loads(file.read_text())
                finite(data)
                if not isinstance(data, dict) or not set(params.get('fields', [])).issubset(data):
                    raise ValueError('missing_fields')
                for field, expected in params.get('equals', {}).items():
                    if data.get(field) != expected:
                        raise ValueError('field_mismatch:' + field)
            elif check == 'csv':
                with open(file, newline='') as stream:
                    reader = csv.DictReader(stream)
                    if not set(params.get('columns', [])).issubset(reader.fieldnames or []):
                        raise ValueError('missing_columns')
                    rows = 0
                    for row in reader:
                        rows += 1
                        if rows > params.get('max_rows', 1000000):
                            raise ValueError('too_many_rows')
                        for field in params.get('numeric_columns', []):
                            if not math.isfinite(float(row[field])):
                                raise ValueError('non_finite_value')
                    if 'rows' in params and rows != params['rows']:
                        raise ValueError('row_count_mismatch')
                    metrics['rows'] = rows
            elif check == 'array':
                import numpy as np
                data = np.load(file, allow_pickle=False, mmap_mode='r')
                if not isinstance(data, np.ndarray) or data.size > params.get('max_elements', 10000000):
                    raise ValueError('unsupported_or_large_array')
                if 'shape' in params and list(data.shape) != params['shape']:
                    raise ValueError('shape_mismatch')
                if 'dtype' in params and str(data.dtype) != params['dtype']:
                    raise ValueError('dtype_mismatch')
                if not np.isfinite(data).all():
                    raise ValueError('non_finite_value')
                metrics.update(shape=list(data.shape), dtype=str(data.dtype))
            elif check == 'slit':
                width, wavelength = params['aperture_m'], params['wavelength_m']
                if width <= 0 or wavelength <= 0:
                    raise ValueError('invalid_units_or_parameters')
                curves = []
                errors = []
                for name in params['paths']:
                    source = safe_path(root, name)
                    if source.stat().st_size > 64*1024*1024:
                        raise ValueError('validation_input_too_large')
                    with open(source, newline='') as stream:
                        curve = [(float(r['frequency_per_m']), float(r['intensity'])) for r in csv.DictReader(stream)]
                    if not curve or any(not math.isfinite(f) or not math.isfinite(y) for f,y in curve):
                        raise ValueError('non_finite_or_empty')
                    if any(curve[i][0] >= curve[i+1][0] for i in range(len(curve)-1)):
                        raise ValueError('frequency_not_increasing')
                    selected = {f:y for f,y in curve if abs(f)<=3/width and abs(wavelength*f)<=1}
                    if len(selected)<5 or abs(selected.get(0, -1)-1)>1e-10:
                        raise ValueError('invalid_sampling_or_normalization')
                    errors.append(max(abs(y-(1 if f==0 else (math.sin(math.pi*width*f)/(math.pi*width*f))**2)) for f,y in selected.items()))
                    curves.append(selected)
                if len(curves) != 2:
                    raise ValueError('two_grids_required')
                common = curves[0].keys() & curves[1].keys()
                if len(common) != min(len(c) for c in curves):
                    raise ValueError('grids_not_comparable')
                delta = max(abs(curves[0][f]-curves[1][f]) for f in common)
                metrics.update(max_absolute_errors=errors, grid_difference=delta)
                if max(errors)>params['max_error'] or delta>params['max_grid_difference']:
                    raise ValueError('scientific_threshold_failed')
            else:
                raise ValueError('unknown_validator')
            observations.append({'check': item, 'status': 'passed', 'metrics': metrics})
        except Exception as error:
            observations.append({'check': item, 'status': 'failed', 'reason': str(error), 'metrics': metrics if 'metrics' in locals() else {}})
    atomic(root / request['result_path'], {'schema_version': 1, 'observations': observations})


if __name__ == '__main__':
    os.umask(0o077)
    action = sys.argv[1]
    if action == 'kernel':
        kernel(int(sys.argv[2]))
    elif action in ('kernel-supervisor', 'job-supervisor'):
        supervisor(action.split('-')[0])
    elif action == 'validate':
        validate(json.loads(Path(sys.argv[2]).read_text()))
