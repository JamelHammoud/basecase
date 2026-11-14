use crate::image::Image;

const TILE: usize = 4;
const MIN_CONTRAST: u8 = 20;
const MIN_SIZE: i32 = 8;
const MIN_PIXELS: u32 = 24;

#[derive(Clone, Copy)]
struct Run {
    y: i32,
    x0: i32,
    x1: i32,
}

#[derive(Clone, Copy)]
struct Stats {
    count: u32,
    x0: i32,
    y0: i32,
    x1: i32,
    y1: i32,
}

const EMPTY: Stats = Stats { count: 0, x0: i32::MAX, y0: i32::MAX, x1: i32::MIN, y1: i32::MIN };

#[derive(Default)]
pub struct Segmenter {
    tile_min: Vec<u8>,
    tile_max: Vec<u8>,
    thresh: Vec<u8>,
    runs: Vec<Run>,
    parent: Vec<u32>,
    root: Vec<u32>,
    stats: Vec<Stats>,
    slot: Vec<u32>,
    picked: Vec<u32>,
    offsets: Vec<usize>,
    extent: Vec<[i32; 2]>,
    pub points: Vec<[i32; 2]>,
    pub spans: Vec<(usize, usize)>,
}

pub fn decimate(gray: &[u8], w: usize, h: usize, out: &mut Vec<u8>) -> (usize, usize) {
    let (sw, sh) = (w / 2, h / 2);

    out.resize(sw * sh, 0);

    for y in 0..sh {
        let top = &gray[2 * y * w..2 * y * w + 2 * sw];
        let bottom = &gray[(2 * y + 1) * w..(2 * y + 1) * w + 2 * sw];
        let row = &mut out[y * sw..(y + 1) * sw];

        for x in 0..sw {
            let sum = top[2 * x] as u32 + top[2 * x + 1] as u32 + bottom[2 * x] as u32 + bottom[2 * x + 1] as u32;

            row[x] = ((sum + 2) >> 2) as u8;
        }
    }

    (sw, sh)
}

fn find(parent: &mut [u32], mut i: u32) -> u32 {
    while parent[i as usize] != i {
        let up = parent[parent[i as usize] as usize];

        parent[i as usize] = up;
        i = up;
    }

    i
}

fn union(parent: &mut [u32], a: u32, b: u32) {
    let ra = find(parent, a);
    let rb = find(parent, b);

    if ra < rb {
        parent[rb as usize] = ra;
    } else if rb < ra {
        parent[ra as usize] = rb;
    }
}

impl Segmenter {
    pub fn run(&mut self, img: &Image) {
        let tw = self.thresholds(img);

        self.label(img, tw);
        self.collect(img);
    }

    fn thresholds(&mut self, img: &Image) -> usize {
        let tw = (img.w + TILE - 1) / TILE;
        let th = (img.h + TILE - 1) / TILE;

        self.tile_min.clear();
        self.tile_min.resize(tw * th, 255);
        self.tile_max.clear();
        self.tile_max.resize(tw * th, 0);

        for y in 0..img.h {
            let row = &img.data[y * img.w..(y + 1) * img.w];
            let base = (y / TILE) * tw;

            for (tx, chunk) in row.chunks(TILE).enumerate() {
                let mut lo = self.tile_min[base + tx];
                let mut hi = self.tile_max[base + tx];

                for &v in chunk {
                    lo = lo.min(v);
                    hi = hi.max(v);
                }

                self.tile_min[base + tx] = lo;
                self.tile_max[base + tx] = hi;
            }
        }

        self.thresh.clear();
        self.thresh.resize(tw * th, 0);

        for ty in 0..th {
            for tx in 0..tw {
                let mut lo = 255u8;
                let mut hi = 0u8;

                for ny in ty.saturating_sub(1)..(ty + 2).min(th) {
                    for nx in tx.saturating_sub(1)..(tx + 2).min(tw) {
                        lo = lo.min(self.tile_min[ny * tw + nx]);
                        hi = hi.max(self.tile_max[ny * tw + nx]);
                    }
                }

                if hi - lo >= MIN_CONTRAST {
                    self.thresh[ty * tw + tx] = ((lo as u16 + hi as u16 + 1) / 2) as u8;
                }
            }
        }

        tw
    }

    fn label(&mut self, img: &Image, tw: usize) {
        self.runs.clear();
        self.parent.clear();

        let mut prev = (0usize, 0usize);

        for y in 0..img.h {
            let row = &img.data[y * img.w..(y + 1) * img.w];
            let trow = &self.thresh[(y / TILE) * tw..(y / TILE + 1) * tw];
            let start = self.runs.len();
            let mut x = 0;

            while x < img.w {
                if row[x] >= trow[x / TILE] {
                    x += 1;
                    continue;
                }

                let x0 = x;

                while x < img.w && row[x] < trow[x / TILE] {
                    x += 1;
                }

                self.parent.push(self.runs.len() as u32);
                self.runs.push(Run { y: y as i32, x0: x0 as i32, x1: x as i32 - 1 });
            }

            self.join(prev, (start, self.runs.len()));
            prev = (start, self.runs.len());
        }
    }

    fn join(&mut self, above: (usize, usize), here: (usize, usize)) {
        let (mut i, mut j) = (above.0, here.0);

        while i < above.1 && j < here.1 {
            let a = self.runs[i];
            let b = self.runs[j];

            if a.x0 <= b.x1 && b.x0 <= a.x1 {
                union(&mut self.parent, i as u32, j as u32);
            }

            if a.x1 < b.x1 {
                i += 1;
            } else {
                j += 1;
            }
        }
    }

    fn collect(&mut self, img: &Image) {
        let n = self.runs.len();

        self.root.clear();
        self.stats.clear();
        self.stats.resize(n, EMPTY);

        for i in 0..n {
            let r = find(&mut self.parent, i as u32);
            let run = self.runs[i];
            let s = &mut self.stats[r as usize];

            self.root.push(r);
            s.count += (run.x1 - run.x0 + 1) as u32;
            s.x0 = s.x0.min(run.x0);
            s.x1 = s.x1.max(run.x1);
            s.y0 = s.y0.min(run.y);
            s.y1 = s.y1.max(run.y);
        }

        self.pick(img);
        self.gather();
    }

    fn pick(&mut self, img: &Image) {
        let (w, h) = (img.w as i32, img.h as i32);

        self.slot.clear();
        self.slot.resize(self.runs.len(), u32::MAX);
        self.picked.clear();

        for (r, s) in self.stats.iter().enumerate() {
            let big = s.count >= MIN_PIXELS && s.x1 - s.x0 + 1 >= MIN_SIZE && s.y1 - s.y0 + 1 >= MIN_SIZE;
            let inside = s.x0 > 0 && s.y0 > 0 && s.x1 < w - 1 && s.y1 < h - 1;

            if big && inside {
                self.slot[r] = self.picked.len() as u32;
                self.picked.push(r as u32);
            }
        }
    }

    fn extents(&mut self) {
        let mut offset = 0;

        self.offsets.clear();

        for &r in &self.picked {
            let s = self.stats[r as usize];

            self.offsets.push(offset);
            offset += (s.y1 - s.y0 + 1) as usize;
        }

        self.extent.clear();
        self.extent.resize(offset, [i32::MAX, i32::MIN]);

        for (i, &r) in self.root.iter().enumerate() {
            let c = self.slot[r as usize];

            if c == u32::MAX {
                continue;
            }

            let run = self.runs[i];
            let e = &mut self.extent[self.offsets[c as usize] + (run.y - self.stats[r as usize].y0) as usize];

            e[0] = e[0].min(run.x0);
            e[1] = e[1].max(run.x1 + 1);
        }
    }

    fn gather(&mut self) {
        self.extents();
        self.points.clear();
        self.spans.clear();

        for (c, &r) in self.picked.iter().enumerate() {
            let s = self.stats[r as usize];
            let rows = &self.extent[self.offsets[c]..self.offsets[c] + (s.y1 - s.y0 + 1) as usize];
            let from = self.points.len();

            for k in 0..=rows.len() {
                let above = if k > 0 { rows[k - 1] } else { rows[k] };
                let below = if k < rows.len() { rows[k] } else { above };
                let y = s.y0 + k as i32;

                self.points.push([above[0].min(below[0]), y]);
                self.points.push([above[1].max(below[1]), y]);
            }

            self.spans.push((from, self.points.len()));
        }
    }
}
