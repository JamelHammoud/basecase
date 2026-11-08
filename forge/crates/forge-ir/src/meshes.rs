use crate::kernel::{Climb, Face, Mesh};
use crate::read::{vec3, Reader};

const HILLCLIMB_MIN: usize = 10;

struct Polys<'a> {
    adr: &'a [i32],
    num: &'a [i32],
    normal: &'a [f64],
    vertadr: &'a [i32],
    vertnum: &'a [i32],
    vert: &'a [i32],
    mapadr: &'a [i32],
    mapnum: &'a [i32],
    map: &'a [i32],
}

impl<'a> Polys<'a> {
    fn read(r: &Reader<'a>) -> Result<Self, String> {
        Ok(Self {
            adr: r.i32s("mesh_polyadr")?,
            num: r.i32s("mesh_polynum")?,
            normal: r.f64s("mesh_polynormal")?,
            vertadr: r.i32s("mesh_polyvertadr")?,
            vertnum: r.i32s("mesh_polyvertnum")?,
            vert: r.i32s("mesh_polyvert")?,
            mapadr: r.i32s("mesh_polymapadr")?,
            mapnum: r.i32s("mesh_polymapnum")?,
            map: r.i32s("mesh_polymap")?,
        })
    }

    fn faces(&self, mesh: usize) -> Vec<Face> {
        let adr = self.adr[mesh] as usize;

        (0..self.num[mesh] as usize)
            .map(|p| {
                let start = self.vertadr[adr + p] as usize;
                let count = self.vertnum[adr + p] as usize;

                Face {
                    normal: vec3(self.normal, adr + p),
                    vertices: self.vert[start..start + count].iter().map(|&v| v as usize).collect(),
                }
            })
            .collect()
    }

    fn vertex_faces(&self, vertadr: usize, vertnum: usize) -> Vec<Vec<usize>> {
        (0..vertnum)
            .map(|v| {
                let start = self.mapadr[vertadr + v] as usize;
                let count = self.mapnum[vertadr + v] as usize;

                self.map[start..start + count].iter().map(|&p| p as usize).collect()
            })
            .collect()
    }
}

fn climb(graph: &[i32], extrema: &[i32]) -> Climb {
    let numvert = graph[0] as usize;
    let edgeadr = &graph[2..2 + numvert];
    let vertex = graph[2 + numvert..2 + 2 * numvert]
        .iter()
        .map(|&v| v as usize)
        .collect();
    let edges = &graph[2 + 2 * numvert..];
    let neighbours = edgeadr
        .iter()
        .map(|&start| {
            edges[start as usize..]
                .iter()
                .take_while(|&&e| e >= 0)
                .map(|&e| e as usize)
                .collect()
        })
        .collect();
    let mut seeds = [0usize; 27];

    for (seed, &e) in seeds.iter_mut().zip(extrema) {
        *seed = e as usize;
    }

    Climb {
        vertex,
        neighbours,
        extrema: seeds,
    }
}

pub fn meshes(r: &Reader) -> Result<Vec<Mesh>, String> {
    let n = r.size("nmesh")?;
    let (vertadr, vertnum) = (r.i32s("mesh_vertadr")?, r.i32s("mesh_vertnum")?);
    let vert = r.f32s("mesh_vert")?;
    let (graphadr, graph, extrema) = (r.i32s("mesh_graphadr")?, r.i32s("mesh_graph")?, r.i32s("mesh_extrema")?);
    let polys = Polys::read(r)?;
    let mut out = Vec::with_capacity(n);

    for m in 0..n {
        let (adr, count) = (vertadr[m] as usize, vertnum[m] as usize);
        let vertices = (0..count)
            .map(|v| {
                let k = 3 * (adr + v);

                [vert[k], vert[k + 1], vert[k + 2]]
            })
            .collect();
        let climbs = graphadr[m] >= 0 && count >= HILLCLIMB_MIN;

        out.push(Mesh {
            vertices,
            faces: polys.faces(m),
            vertex_faces: polys.vertex_faces(adr, count),
            climb: climbs.then(|| climb(&graph[graphadr[m] as usize..], &extrema[27 * m..27 * m + 27])),
        });
    }

    Ok(out)
}
