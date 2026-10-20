"""Offline GIS research only; optional Shapely, never used by the application.

Download public source layers into --cache, split counties on their named rivers,
and report positive-area ZIP intersections. Does not write to an application DB.
"""
import argparse
import json
from pathlib import Path
import urllib.parse
import urllib.request

from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.ops import linemerge, nearest_points, split, unary_union

COUNTIES = 'https://maps.austintexas.gov/arcgis/rest/services/Shared/Property/MapServer/5'
RIVERS = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/Texas_Streams/FeatureServer/0'
ZIPS = 'https://maps.austintexas.gov/arcgis/rest/services/Shared/BoundariesGrids_1/MapServer/5'


def query(cache, key, url, **params):
    path = cache / (key + '.json')
    if path.exists():
        return json.loads(path.read_text())
    params.update(f='json', outSR='4326', returnGeometry='true', outFields='*')
    with urllib.request.urlopen(url + '/query?' + urllib.parse.urlencode(params), timeout=45) as response:
        data = json.load(response)
    if 'features' not in data or data.get('exceededTransferLimit'):
        raise RuntimeError(f'Incomplete source: {url}: {str(data)[:200]}')
    path.write_text(json.dumps(data))
    return data


def geometry(feature):
    geo = feature['geometry']
    if 'paths' in geo:
        return MultiLineString(geo['paths'])
    result = Polygon()
    for ring in geo['rings']:
        result = result.symmetric_difference(Polygon(ring))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    counties = query(args.cache, 'county-boundaries', COUNTIES, where="COUNTY_NAME IN ('HAYS','TRAVIS')")
    rivers = query(args.cache, 'named-rivers', RIVERS, where="STRM_NM IN ('Blanco River','Colorado River')")
    zips = query(args.cache, 'postal-boundaries', ZIPS, where="STATE='TX'", geometry='-98.5,29.7,-97.2,30.8',
                 geometryType='esriGeometryEnvelope', inSR='4326', spatialRel='esriSpatialRelIntersects')
    for county_feature in counties['features']:
        county = geometry(county_feature)
        name = county_feature['attributes']['COUNTY_NAME']
        river_name = 'Blanco River' if name == 'HAYS' else 'Colorado River'
        river = unary_union([geometry(r) for r in rivers['features'] if r['attributes']['STRM_NM'] == river_name])
        if name == 'HAYS':
            # Blanco terminates at its confluence inside Hays. Close the small
            # remaining gap to the nearest county edge for side classification.
            # This affects only the ZIP already crossing that confluence; record it.
            merged = river if river.geom_type == 'LineString' else linemerge(river)
            if merged.geom_type != 'LineString':
                raise RuntimeError('Disconnected Blanco source; manual source review required')
            end = Point(merged.coords[-1])
            if county.contains(end):
                edge = nearest_points(end, county.boundary)[1]
                direction = (edge.x-end.x, edge.y-end.y)
                extended = (edge.x+direction[0]*.01, edge.y+direction[1]*.01)
                river = unary_union([river, LineString([end, extended])])
                print('Blanco confluence closure:', list(end.coords), list(edge.coords))
        pieces = list(split(county, river).geoms)
        print(name, 'parts:', [(round(p.area, 6), list(p.representative_point().coords)[0]) for p in pieces])
        # Buda for north of Blanco; South Austin for south of Colorado.
        anchor = Point(-97.84, 30.08) if name == 'HAYS' else Point(-97.76, 30.22)
        region = unary_union([p for p in pieces if p.contains(anchor)])
        if not region.area or region.area >= county.area * .99:
            raise RuntimeError(f'{name}: river did not split county as expected; review source geometry')
        rows = []
        for feature in zips['features']:
            polygon = geometry(feature)
            overlap = polygon.intersection(region).area
            if overlap > 0:
                rows.append({'zip': feature['attributes']['ZIPCODE'], 'city': feature['attributes'].get('CITY'),
                             'overlap_degrees_squared': overlap, 'zip_fraction': overlap / polygon.area})
        print(json.dumps(sorted(rows, key=lambda row: row['zip']), indent=2))
        (args.cache / (name + '-region.geojson')).write_text(json.dumps(region.__geo_interface__))
        (args.cache / (name + '-overlaps.json')).write_text(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
