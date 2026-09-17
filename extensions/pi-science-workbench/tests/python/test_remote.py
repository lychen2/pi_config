import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

PACKAGE=Path(__file__).resolve().parents[2]
HELPER=PACKAGE/'python/science_workbench/remote_helper.py'
WORKER=PACKAGE/'python/science_workbench/worker.py'

class RemoteHelperTests(unittest.TestCase):
    def invoke(self,request):
        p=subprocess.run([sys.executable,'-I','-B',str(HELPER)],input=json.dumps(request),text=True,capture_output=True,timeout=15)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        return json.loads(p.stdout)

    def test_submit_poll_harvest_and_duplicate(self):
        with tempfile.TemporaryDirectory() as root:
            worker=WORKER.read_bytes()
            data=b'input-payload'
            stage={'action':'stage','root':root,'run_id':'remote-test','path':'inputs/example.txt','data':base64.b64encode(data).decode(),'offset':0,'size':len(data),'max_transfer_bytes':1000}
            self.assertEqual(self.invoke(stage)['next_offset'],len(data))
            self.assertEqual(self.invoke(stage)['next_offset'],len(data))
            request={'action':'submit','root':root,'run_id':'remote-test','worker':base64.b64encode(worker).decode(),'worker_digest':hashlib.sha256(worker).hexdigest(),'inputs':[{'path':'inputs/example.txt','size_bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}],'max_transfer_bytes':1000,'spec':{'protocol_version':1,'request_id':'remote-test','generation':1,'executable':sys.executable,'argv':['-c','from pathlib import Path; Path("artifacts/output.txt").write_text("verified")'],'environment':{},'timeout_seconds':5,'max_log_bytes':1024}}
            self.assertEqual(self.invoke(request)['status'],'submitted')
            self.assertEqual(self.invoke(request)['status'],'existing')
            state={}
            for _ in range(100):
                state=self.invoke({'action':'poll','root':root,'run_id':'remote-test'})
                if state['execution_status'] not in ('running','unknown'):
                    break
                time.sleep(.03)
            self.assertEqual(state['execution_status'],'succeeded')
            artifact=self.invoke({'action':'read','root':root,'run_id':'remote-test','path':'artifacts/output.txt','offset':0})
            self.assertEqual(base64.b64decode(artifact['data']),b'verified')
            self.assertEqual(artifact['sha256'],hashlib.sha256(b'verified').hexdigest())

    def test_cancel_requires_confirmed_process(self):
        with tempfile.TemporaryDirectory() as root:
            worker=WORKER.read_bytes()
            request={'action':'submit','root':root,'run_id':'cancel-test','worker':base64.b64encode(worker).decode(),'worker_digest':hashlib.sha256(worker).hexdigest(),'inputs':[],'max_transfer_bytes':1000,'spec':{'protocol_version':1,'request_id':'cancel-test','generation':1,'executable':sys.executable,'argv':['-c','import time;time.sleep(60)'],'environment':{},'timeout_seconds':10,'max_log_bytes':1024}}
            self.invoke(request)
            state=self.invoke({'action':'cancel','root':root,'run_id':'cancel-test'})
            self.assertEqual(state['execution_status'],'cancelled')
