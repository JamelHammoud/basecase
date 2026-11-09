fn hg(i: i32) -> f32 {
    return SR[sx(HF + i)].x;
}

fn hs(i: i32, v: f32) {
    SR[sx(HF + i)] = vec2<f32>(v, 0.0);
}
