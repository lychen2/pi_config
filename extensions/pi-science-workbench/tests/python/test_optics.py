import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class OpticsTests(unittest.TestCase):
    def test_analytic_and_grid_thresholds(self):
        try:
            import numpy
        except ImportError:
            self.skipTest('NumPy is not installed; no automatic installation')
        optics=load('slit',ROOT/'skills/optics-diffraction-check/scripts/rectangular_slit.py')
        worker=load('worker',ROOT/'python/science_workbench/worker.py')
        with tempfile.TemporaryDirectory() as root:
            for n in (64,4096,8192):
                optics.simulate(n,Path(root,f'{n}.csv'))
            params={'paths':['4096.csv','8192.csv'],'aperture_m':2e-6,'wavelength_m':193e-9,'max_error':1e-3,'max_grid_difference':5e-4}
            worker.validate({'cwd':root,'result_path':'fine.json','checks':[{'id':'slit','parameters':params}]})
            fine=json.loads(Path(root,'fine.json').read_text())
            self.assertEqual(fine['observations'][0]['status'],'passed')
            params['paths']=['64.csv','8192.csv']
            worker.validate({'cwd':root,'result_path':'coarse.json','checks':[{'id':'slit','parameters':params}]})
            coarse=json.loads(Path(root,'coarse.json').read_text())
            self.assertEqual(coarse['observations'][0]['status'],'failed')
