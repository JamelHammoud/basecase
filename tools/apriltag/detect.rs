use crate::decode::{decode, Codebook};
use crate::geometry::{dist2, Pt, Quad};
use crate::image::Image;
use crate::quad;
use crate::refine::refine;
use crate::segment::{decimate, Segmenter};

const DECIMATE_FROM: usize = 1000;
const MIN_IMAGE: usize = 16;

pub struct Detection {
    pub id: u32,
    pub hamming: u32,
    pub corners: Quad,
}

#[derive(Default)]
pub struct Workspace {
    small: Vec<u8>,
    segmenter: Segmenter,
    hull: Vec<Pt>,
    chain: Vec<[i32; 2]>,
    edge: Vec<[f64; 3]>,
}

fn centre(q: &Quad) -> Pt {
    let mut c = [0.0, 0.0];

    for p in q {
        c[0] += p[0] * 0.25;
        c[1] += p[1] * 0.25;
    }

    c
}

fn keep(found: &mut Vec<Detection>, d: Detection) {
    let c = centre(&d.corners);
    let reach = dist2(d.corners[0], d.corners[2]) * 0.25;

    for other in found.iter_mut() {
        if other.id != d.id || dist2(centre(&other.corners), c) > reach {
            continue;
        }

        if d.hamming < other.hamming {
            *other = d;
        }

        return;
    }

    found.push(d);
}

pub fn detect(gray: &[u8], w: usize, h: usize, book: &Codebook, ws: &mut Workspace) -> Vec<Detection> {
    let mut found = Vec::new();

    if w < MIN_IMAGE || h < MIN_IMAGE {
        return found;
    }

    let full = Image { data: gray, w, h };
    let scale = if w >= DECIMATE_FROM { 2.0 } else { 1.0 };

    if scale > 1.0 {
        let (sw, sh) = decimate(gray, w, h, &mut ws.small);

        ws.segmenter.run(&Image { data: &ws.small, w: sw, h: sh });
    } else {
        ws.segmenter.run(&full);
    }

    for s in 0..ws.segmenter.spans.len() {
        let (from, to) = ws.segmenter.spans[s];

        quad::hull(&ws.segmenter.points[from..to], &mut ws.hull, &mut ws.chain);

        let Some(mut q) = quad::fit(&ws.hull) else { continue };

        for p in q.iter_mut() {
            p[0] *= scale;
            p[1] *= scale;
        }

        let Some(fine) = refine(&full, &q, &mut ws.edge) else { continue };
        let Some(code) = decode(&full, &fine, book) else { continue };
        let r = code.rotation;
        let corners = [fine[r], fine[(r + 1) % 4], fine[(r + 2) % 4], fine[(r + 3) % 4]];

        keep(&mut found, Detection { id: code.id, hamming: code.hamming, corners });
    }

    found
}
