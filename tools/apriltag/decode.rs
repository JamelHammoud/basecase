use crate::geometry::{Homography, Quad};
use crate::image::Image;

pub const CODE_BITS: usize = 36;
const MAX_HAMMING: u32 = 2;
const MAX_BORDER_ERRORS: u32 = 4;
const MIN_CONTRAST: f64 = 10.0;
const CELL: f64 = 0.25;
const SPREAD: [f64; 3] = [-0.2, 0.0, 0.2];

pub struct Codebook {
    codes: Vec<u64>,
    bit_x: [u8; CODE_BITS],
    bit_y: [u8; CODE_BITS],
}

pub struct Decoded {
    pub id: u32,
    pub hamming: u32,
    pub rotation: usize,
}

impl Codebook {
    pub fn empty() -> Codebook {
        Codebook { codes: Vec::new(), bit_x: [0; CODE_BITS], bit_y: [0; CODE_BITS] }
    }

    pub fn new(code_bytes: &[u8], xs: &[u8], ys: &[u8]) -> Codebook {
        let codes = code_bytes
            .chunks_exact(8)
            .map(|c| u64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]))
            .collect();
        let mut book = Codebook { codes, bit_x: [0; CODE_BITS], bit_y: [0; CODE_BITS] };

        book.bit_x.copy_from_slice(xs);
        book.bit_y.copy_from_slice(ys);
        book
    }

    fn nearest(&self, code: u64) -> (u32, u32) {
        let mut best = (u32::MAX, u32::MAX);

        for (id, &c) in self.codes.iter().enumerate() {
            let d = (c ^ code).count_ones();

            if d < best.1 {
                best = (id as u32, d);
            }
        }

        best
    }
}

fn cell(img: &Image, h: &Homography, cx: i32, cy: i32) -> f64 {
    let mut sum = 0.0;

    for dy in SPREAD {
        for dx in SPREAD {
            let u = -1.0 + (cx as f64 + 0.5 + dx) * CELL;
            let v = -1.0 + (cy as f64 + 0.5 + dy) * CELL;
            let p = h.map(u, v);

            sum += img.sample(p[0], p[1]);
        }
    }

    sum / 9.0
}

fn ring_mean(img: &Image, h: &Homography, lo: i32, hi: i32) -> f64 {
    let mut sum = 0.0;
    let mut n = 0.0;

    for i in lo..=hi {
        for (cx, cy) in [(i, lo), (i, hi), (lo, i), (hi, i)] {
            sum += cell(img, h, cx, cy);
            n += 1.0;
        }
    }

    sum / n
}

fn border_errors(img: &Image, h: &Homography, threshold: f64) -> u32 {
    let mut errors = 0;

    for i in 0..8 {
        for (cx, cy) in [(i, 0), (i, 7), (0, i), (7, i)] {
            if cell(img, h, cx, cy) > threshold {
                errors += 1;
            }
        }
    }

    errors
}

pub fn decode(img: &Image, quad: &Quad, book: &Codebook) -> Option<Decoded> {
    let h = Homography::from_square(quad)?;
    let black = ring_mean(img, &h, 0, 7);
    let white = ring_mean(img, &h, -1, 8);

    if white - black < MIN_CONTRAST {
        return None;
    }

    let threshold = (white + black) * 0.5;

    if border_errors(img, &h, threshold) > MAX_BORDER_ERRORS {
        return None;
    }

    let mut light = [[false; 8]; 8];

    for cy in 1..7 {
        for cx in 1..7 {
            light[cy][cx] = cell(img, &h, cx as i32, cy as i32) > threshold;
        }
    }

    best_rotation(&light, book)
}

fn best_rotation(light: &[[bool; 8]; 8], book: &Codebook) -> Option<Decoded> {
    let mut best: Option<Decoded> = None;

    for rotation in 0..4 {
        let mut code = 0u64;

        for i in 0..CODE_BITS {
            let (mut x, mut y) = (book.bit_x[i] as usize, book.bit_y[i] as usize);

            for _ in 0..rotation {
                (x, y) = (7 - y, x);
            }

            if light[y][x] {
                code |= 1u64 << (CODE_BITS - 1 - i);
            }
        }

        let (id, hamming) = book.nearest(code);

        if hamming <= MAX_HAMMING && best.as_ref().map_or(true, |b| hamming < b.hamming) {
            best = Some(Decoded { id, hamming, rotation });
        }
    }

    best
}
