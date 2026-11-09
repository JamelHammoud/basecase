struct Params {
    worlds: u32,
    nstep: u32,
    upto: u32,
    pin: u32,
}

@group(0) @binding(0) var<storage, read_write> IO: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> SR: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> NI: array<i32>;
@group(0) @binding(3) var<storage, read> ORDER: array<u32>;
@group(0) @binding(4) var<storage, read_write> STATS: array<i32>;
@group(0) @binding(5) var<storage, read> TR: array<vec2<f32>>;
@group(0) @binding(6) var<storage, read> TI: array<i32>;
@group(0) @binding(7) var<uniform> P: Params;

var<private> SB: u32;
var<private> NB: u32;
var<private> LANE: u32;

alias d3 = array<real, 3>;
alias d4 = array<real, 4>;
alias d6 = array<real, 6>;
alias d9 = array<real, 9>;
alias d10 = array<real, 10>;

fn enter(t: u32) {
    PIN = P.pin;
    let block = t / BLOCKU;
    LANE = t % BLOCKU;
    SB = block * u32(NREALS) * BLOCKU + LANE;
    NB = block * u32(NINTS) * BLOCKU + LANE;
}

fn sx(k: i32) -> u32 {
    return SB + u32(k) * BLOCKU;
}

fn sg(k: i32) -> real {
    return SR[sx(k)];
}

fn sp(k: i32, v: real) {
    SR[sx(k)] = v;
}

fn sa(k: i32, v: real) {
    let i = sx(k);
    SR[i] = ad(SR[i], v);
}

fn ng(k: i32) -> i32 {
    return NI[NB + u32(k) * BLOCKU];
}

fn np(k: i32, v: i32) {
    NI[NB + u32(k) * BLOCKU] = v;
}

fn tr(t: i32, i: i32) -> real {
    return TR[t + i];
}

fn tf(t: i32, i: i32) -> f32 {
    return TR[t + i].x;
}

fn ti(t: i32, i: i32) -> i32 {
    return TI[t + i];
}

fn tb(t: i32, i: i32) -> bool {
    return TI[t + i] != 0;
}

fn g3(off: i32, i: i32) -> d3 {
    return d3(sg(off + 3 * i), sg(off + 3 * i + 1), sg(off + 3 * i + 2));
}

fn g4(off: i32, i: i32) -> d4 {
    return d4(sg(off + 4 * i), sg(off + 4 * i + 1), sg(off + 4 * i + 2), sg(off + 4 * i + 3));
}

fn g6(off: i32, i: i32) -> d6 {
    var r: d6;
    for (var k = 0; k < 6; k++) {
        r[k] = sg(off + 6 * i + k);
    }
    return r;
}

fn g9(off: i32, i: i32) -> d9 {
    var r: d9;
    for (var k = 0; k < 9; k++) {
        r[k] = sg(off + 9 * i + k);
    }
    return r;
}

fn g10(off: i32, i: i32) -> d10 {
    var r: d10;
    for (var k = 0; k < 10; k++) {
        r[k] = sg(off + 10 * i + k);
    }
    return r;
}

fn p3(off: i32, i: i32, x: d3) {
    for (var k = 0; k < 3; k++) {
        sp(off + 3 * i + k, x[k]);
    }
}

fn p4(off: i32, i: i32, x: d4) {
    for (var k = 0; k < 4; k++) {
        sp(off + 4 * i + k, x[k]);
    }
}

fn p6(off: i32, i: i32, x: d6) {
    for (var k = 0; k < 6; k++) {
        sp(off + 6 * i + k, x[k]);
    }
}

fn p9(off: i32, i: i32, x: d9) {
    for (var k = 0; k < 9; k++) {
        sp(off + 9 * i + k, x[k]);
    }
}

fn p10(off: i32, i: i32, x: d10) {
    for (var k = 0; k < 10; k++) {
        sp(off + 10 * i + k, x[k]);
    }
}

fn c3(t: i32, i: i32) -> d3 {
    return d3(TR[t + 3 * i], TR[t + 3 * i + 1], TR[t + 3 * i + 2]);
}

fn c4(t: i32, i: i32) -> d4 {
    return d4(TR[t + 4 * i], TR[t + 4 * i + 1], TR[t + 4 * i + 2], TR[t + 4 * i + 3]);
}

fn zero3() -> d3 {
    return d3(Z(), Z(), Z());
}

fn zero6() -> d6 {
    return d6(Z(), Z(), Z(), Z(), Z(), Z());
}

fn add3(a: d3, b: d3) -> d3 {
    return d3(ad(a[0], b[0]), ad(a[1], b[1]), ad(a[2], b[2]));
}

fn sub3(a: d3, b: d3) -> d3 {
    return d3(sb(a[0], b[0]), sb(a[1], b[1]), sb(a[2], b[2]));
}

fn scl3(a: d3, s: real) -> d3 {
    return d3(ml(a[0], s), ml(a[1], s), ml(a[2], s));
}

fn dot3(a: d3, b: d3) -> real {
    return ad(ad(ml(a[0], b[0]), ml(a[1], b[1])), ml(a[2], b[2]));
}

fn cross3(a: d3, b: d3) -> d3 {
    return d3(sb(ml(a[1], b[2]), ml(a[2], b[1])), sb(ml(a[2], b[0]), ml(a[0], b[2])),
              sb(ml(a[0], b[1]), ml(a[1], b[0])));
}

fn row3(m: d9, r: i32, v: d3) -> real {
    return ad(ad(ml(m[3 * r], v[0]), ml(m[3 * r + 1], v[1])), ml(m[3 * r + 2], v[2]));
}

fn col3(m: d9, c: i32, v: d3) -> real {
    return ad(ad(ml(m[c], v[0]), ml(m[c + 3], v[1])), ml(m[c + 6], v[2]));
}

fn mat_vec(m: d9, v: d3) -> d3 {
    return d3(row3(m, 0, v), row3(m, 1, v), row3(m, 2, v));
}

fn mat_t_vec(m: d9, v: d3) -> d3 {
    return d3(col3(m, 0, v), col3(m, 1, v), col3(m, 2, v));
}
