import json, numpy as np, os
Q = np.array(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cardsize.json')))['q'])
def expected(x, y, deg, q=Q):
    u, v = (x - 1000) / 1000, (y - 600) / 1000; F = np.array([u, v, u * u, u * v, v * v])
    sx, sy = np.exp(F @ q[2:7]), np.exp(F @ q[7:12]); th = np.radians(deg)
    return float(np.exp(q[0]) * np.hypot(sx * np.cos(th), sy * np.sin(th))), float(np.exp(q[1]) * np.hypot(sx * np.sin(th), sy * np.cos(th)))
