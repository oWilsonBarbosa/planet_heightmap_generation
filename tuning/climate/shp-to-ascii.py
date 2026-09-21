"""
Rasterise the Kottek et al. Köppen-Geiger shapefile (c1976_2000) back to the
0.5-degree "Lat Lon Cls" ASCII grid that tuning/climate expects.

The shapefile carries an integer GRIDCODE, not class codes, and its metadata
documents only that it came from RasterToPolygon of the 1976-2000 raster -- the
legend is not in the file. So the legend is HYPOTHESISED as the conventional
Kottek ordering and then VERIFIED against known geography before use. If the
verification fails, nothing is written.

Usage:
  python3 shp-to-koppen.py <shpPath> <outTxt> [--check-only]
"""
import sys
import shapefile
import numpy as np
from matplotlib.path import Path

# Rubel & Kottek two-digit encoding: first digit is the main group
# (1=A, 2=B, 3=C, 4=D, 6=E), second enumerates the subtype. Deduced from the
# observed code set (31 distinct values spanning 11..62, which no 1..31 index
# scheme can produce) and then verified against the anchors below.
LEGEND = {
    11: 'Af', 12: 'Am', 13: 'As', 14: 'Aw',
    21: 'BWk', 22: 'BWh', 26: 'BSk', 27: 'BSh',
    31: 'Cfa', 32: 'Cfb', 33: 'Cfc', 34: 'Csa', 35: 'Csb', 36: 'Csc',
    37: 'Cwa', 38: 'Cwb', 39: 'Cwc',
    41: 'Dfa', 42: 'Dfb', 43: 'Dfc', 44: 'Dfd', 45: 'Dsa', 46: 'Dsb',
    47: 'Dsc', 48: 'Dsd', 49: 'Dwa', 50: 'Dwb', 51: 'Dwc', 52: 'Dwd',
    61: 'EF', 62: 'ET',
}

# Places whose Köppen class is not in serious dispute. Each is (lat, lon,
# accepted classes) -- several allow a small set because the exact subtype at
# 0.5 degrees can legitimately vary with the cell centre.
ANCHORS = [
    (-3.0, -60.0, {'Af', 'Am'},        'Amazon basin'),
    (0.5, 23.0, {'Af', 'Am', 'Aw'},    'Congo basin'),
    (22.0, 12.0, {'BWh'},              'central Sahara'),
    (14.0, 2.0, {'BSh', 'BWh'},        'Sahel'),
    (25.0, 45.0, {'BWh'},              'Arabian desert'),
    (-24.0, 134.0, {'BWh', 'BSh'},     'Australian interior'),
    (44.0, 105.0, {'BWk', 'BSk'},      'Gobi'),
    (38.0, -4.0, {'Csa'},              'southern Spain'),
    (52.0, -1.5, {'Cfb'},              'England'),
    (28.0, -81.5, {'Cfa'},             'Florida'),
    (-33.0, -60.0, {'Cfa', 'Cfb'},     'Pampas'),
    # As is a real class here, not a legend error: the Kottek scheme splits the
    # Indian monsoon belt's dry-season half into As where the dry months fall in
    # the high-sun half-year. ground-truth.mjs already aliases As -> Aw.
    (23.0, 79.0, {'Aw', 'As', 'Cwa', 'BSh'}, 'central India'),
    (30.0, 114.0, {'Cfa', 'Cwa'},      'central China'),
    (55.0, 37.0, {'Dfb'},              'Moscow'),
    (65.0, 100.0, {'Dfc', 'Dwc'},      'central Siberia'),
    (63.0, 130.0, {'Dfd', 'Dwd', 'Dfc', 'Dwc'}, 'Yakutia'),
    (68.0, -110.0, {'ET'},             'Canadian Arctic'),
    (72.0, -40.0, {'EF', 'ET'},        'Greenland interior'),
    (-80.0, 0.0, {'EF'},               'Antarctica'),
    (-15.0, -70.0, {'ET', 'Cwb', 'BSk', 'Dwb'}, 'Altiplano'),
]

GRID_W, GRID_H, NO_DATA = 720, 360, 0


def rasterise(shp_path):
    sf = shapefile.Reader(shp_path)
    lons = -179.75 + 0.5 * np.arange(GRID_W)
    lats = -89.75 + 0.5 * np.arange(GRID_H)
    LON, LAT = np.meshgrid(lons, lats)
    pts = np.column_stack([LON.ravel(), LAT.ravel()])
    grid = np.zeros(GRID_H * GRID_W, dtype=np.int16)

    for shp, rec in zip(sf.shapes(), sf.records()):
        code = rec['GRIDCODE']
        x0, y0, x1, y1 = shp.bbox
        # Only test grid points inside this polygon's bounding box
        sel = np.where((pts[:, 0] >= x0 - 0.5) & (pts[:, 0] <= x1 + 0.5) &
                       (pts[:, 1] >= y0 - 0.5) & (pts[:, 1] <= y1 + 0.5))[0]
        if sel.size == 0:
            continue
        # Compound path: ESRI outer rings are clockwise, holes counter-clockwise,
        # so the default nonzero winding rule cuts the holes out correctly.
        verts, codes = [], []
        parts = list(shp.parts) + [len(shp.points)]
        for i in range(len(parts) - 1):
            ring = shp.points[parts[i]:parts[i + 1]]
            if len(ring) < 3:
                continue
            verts.extend(ring)
            codes.extend([Path.MOVETO] + [Path.LINETO] * (len(ring) - 2) + [Path.CLOSEPOLY])
        if not verts:
            continue
        inside = Path(np.asarray(verts), codes).contains_points(pts[sel])
        hit = sel[inside]
        if hit.size:
            grid[hit] = code
    return grid


def check(grid, legend):
    ok, bad = 0, []
    for lat, lon, accepted, name in ANCHORS:
        row = int(round((lat + 89.75) / 0.5))
        col = int(round((lon + 179.75) / 0.5))
        row = max(0, min(GRID_H - 1, row))
        col = col % GRID_W
        gc = int(grid[row * GRID_W + col])
        cls = legend.get(gc, f'<none:{gc}>')
        good = cls in accepted
        ok += good
        if not good:
            bad.append((name, cls, sorted(accepted)))
        print(f"   {'OK ' if good else 'BAD'}  {name:22s} got {cls:5s}  expected one of {sorted(accepted)}")
    return ok, bad


def main():
    shp, out = sys.argv[1], sys.argv[2]
    check_only = '--check-only' in sys.argv
    print(f'rasterising {shp} ...')
    grid = rasterise(shp)
    filled = int((grid > 0).sum())
    print(f'   {filled:,} of {GRID_W * GRID_H:,} cells classified '
          f'({100 * filled / (GRID_W * GRID_H):.1f}% of globe)')
    codes = sorted(set(int(c) for c in grid if c > 0))
    print(f'   GRIDCODE values present: {len(codes)} (min {min(codes)}, max {max(codes)})')
    unmapped = [c for c in codes if c not in LEGEND]
    print(f'   codes not in legend: {unmapped if unmapped else "none"}')
    if unmapped:
        print('   LEGEND INCOMPLETE — not writing output.')
        sys.exit(1)

    print('\nVERIFYING the hypothesised legend against known geography:')
    ok, bad = check(grid, LEGEND)
    print(f'\n   {ok} of {len(ANCHORS)} anchors agree')
    if bad:
        print('   LEGEND REJECTED — not writing output.')
        sys.exit(1)
    print('   legend accepted')
    if check_only:
        return

    lines = ['Lat Lon Cls']
    for row in range(GRID_H):
        lat = -89.75 + 0.5 * row
        for col in range(GRID_W):
            gc = int(grid[row * GRID_W + col])
            if gc <= 0:
                continue
            lines.append(f'{lat:.2f} {-179.75 + 0.5 * col:.2f} {LEGEND[gc]}')
    with open(out, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'\nwrote {out} ({len(lines) - 1:,} cells)')


if __name__ == '__main__':
    main()
