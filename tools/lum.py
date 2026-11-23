import sys
from PIL import Image
import numpy as np
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(float)/255
    lin = np.where(a<=0.04045, a/12.92, ((a+0.055)/1.055)**2.4)
    y = 0.2126*lin[...,0]+0.7152*lin[...,1]+0.0722*lin[...,2]
    # exclude HUD margins roughly: central 80%
    h,w = y.shape; c = y[int(h*.08):int(h*.8), int(w*.05):int(w*.95)]
    print(f"{p.split('/')[-1]:28s} meanY={c.mean():.3f} p10={np.percentile(c,10):.3f} p50={np.percentile(c,50):.3f} p90={np.percentile(c,90):.3f} dark<0.02={np.mean(c<0.02)*100:.1f}%")
