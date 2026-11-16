export const factoryDxf = [
  '0',
  'SECTION',
  '2',
  'HEADER',
  '9',
  '$INSUNITS',
  '70',
  '4',
  '0',
  'ENDSEC',
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'LWPOLYLINE',
  '8',
  'Ground',
  '90',
  '4',
  '70',
  '1',
  '10',
  '0',
  '20',
  '0',
  '10',
  '12000',
  '20',
  '0',
  '10',
  '12000',
  '20',
  '8000',
  '10',
  '0',
  '20',
  '8000',
  '0',
  'ENDSEC',
  '0',
  'EOF',
].join('\n');

export const siteControls = {
  datum: 'WGS84',
  vertical: { kind: 'ellipsoid' },
  controls: [
    { local: [0, 0, 0], latitude: 0, longitude: 0, altitudeM: 20 },
    { local: [10, 0, 0], latitude: 0, longitude: 0.0000898315284, altitudeM: 20 },
  ],
};

export const usdFacility = (units = 0.01, up = 'Y') => `#usda 1.0
(
    defaultPrim = "Facility"
    metersPerUnit = ${units}
    upAxis = "${up}"
)
def Xform "Facility" {
    def Mesh "Floor" {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (100, 0, 0), (0, 0, 100)]
    }
}
`;
