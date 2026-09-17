import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('worker',ROOT/'python/science_workbench/worker.py')
w=importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

class WorkerTests(unittest.TestCase):
    def test_frames(self):
        stream=io.BytesIO()
        w.send(stream,{'hello':'world'})
        stream.seek(0)
        self.assertEqual(w.receive(stream),{'hello':'world'})
        with self.assertRaises(EOFError):
            w.receive(stream)

    def test_safe_path(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                w.safe_path(root,'../escape')
            Path(root,'link').symlink_to('/tmp')
            with self.assertRaises(ValueError):
                w.safe_path(root,'link/file')

    def test_validators(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root,'input.json').write_text('{"x": 1}')
            w.validate({'cwd':root,'result_path':'result.json','checks':[{'id':'json','parameters':{'path':'input.json','equals':{'x':2}}}]})
            self.assertEqual(json.loads(Path(root,'result.json').read_text())['observations'][0]['status'],'failed')

    def test_nonfinite(self):
        with self.assertRaises(ValueError):
            w.finite({'x':[float('nan')]})

if __name__=='__main__':
    unittest.main()
