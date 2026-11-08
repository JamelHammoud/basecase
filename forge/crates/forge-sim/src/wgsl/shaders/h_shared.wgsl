var<workgroup> TG: array<f32, TG_SIZE>;

fn hg(i: i32) -> f32 {
    return TG[u32(i) * BLOCKU + LANE];
}

fn hs(i: i32, v: f32) {
    TG[u32(i) * BLOCKU + LANE] = v;
}
