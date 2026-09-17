"""Scalar 1-D Fraunhofer fixture; outputs CSV into artifacts/. Requires NumPy."""
from pathlib import Path
import csv
import json
import numpy as np


def simulate(n, output, width=2e-6, window=32e-6):
    dx=window/n
    x=(np.arange(n)-n/2+0.5)*dx
    pupil=(np.abs(x)<width/2).astype(float)
    amplitude=np.fft.fftshift(np.fft.fft(np.fft.ifftshift(pupil)))*dx
    intensity=np.abs(amplitude)**2
    intensity/=intensity[n//2]
    frequencies=np.fft.fftshift(np.fft.fftfreq(n,dx))
    with open(output,'w',newline='') as stream:
        writer=csv.writer(stream)
        writer.writerow(['frequency_per_m','intensity'])
        writer.writerows(zip(frequencies,intensity))


def main():
    output=Path('artifacts')
    output.mkdir(exist_ok=True)
    parameters={'wavelength_m':193e-9,'aperture_m':2e-6,'window_m':32e-6,'grids':[4096,8192]}
    (output/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n')
    for n in parameters['grids']:
        simulate(n,output/f'slit-{n}.csv')


if __name__=='__main__':
    main()
