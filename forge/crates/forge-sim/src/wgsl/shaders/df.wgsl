alias real = vec2<f32>;
alias dacc = vec2<f32>;

var<private> PIN: u32;

fn pn(x: f32) -> f32 {
    return bitcast<f32>(bitcast<u32>(x) | PIN);
}

fn D(x: f32) -> real {
    return real(x, 0.0);
}

fn Z() -> real {
    return real(0.0, 0.0);
}

fn two_sum(a: f32, b: f32) -> real {
    let s = pn(a + b);
    let bb = pn(s - a);
    return real(s, pn(a - pn(s - bb)) + pn(b - bb));
}

fn fast_two_sum(a: f32, b: f32) -> real {
    let s = pn(a + b);
    return real(s, b - pn(s - a));
}

fn ad(a: real, b: real) -> real {
    let s = two_sum(a.x, b.x);
    return fast_two_sum(s.x, pn(s.y + pn(a.y + b.y)));
}

fn sb(a: real, b: real) -> real {
    return ad(a, -b);
}

fn ml(a: real, b: real) -> real {
    let p = pn(a.x * b.x);
    var e = fma(a.x, b.x, -p);
    e = fma(a.x, b.y, e);
    e = fma(a.y, b.x, e);
    return fast_two_sum(p, pn(e));
}

fn mf(a: real, b: f32) -> real {
    let p = pn(a.x * b);
    var e = fma(a.x, b, -p);
    e = fma(a.y, b, e);
    return fast_two_sum(p, pn(e));
}

fn dv(a: real, b: real) -> real {
    let q1 = pn(a.x / b.x);
    var r = sb(a, mf(b, q1));
    let q2 = pn(r.x / b.x);
    r = sb(r, mf(b, q2));
    let q3 = pn(r.x / b.x);
    return ad(fast_two_sum(q1, q2), D(q3));
}

fn lt(a: real, b: real) -> bool {
    return a.x < b.x || (a.x == b.x && a.y < b.y);
}

fn gt(a: real, b: real) -> bool {
    return lt(b, a);
}

fn le(a: real, b: real) -> bool {
    return !lt(b, a);
}

fn ge(a: real, b: real) -> bool {
    return !lt(a, b);
}

fn eqd(a: real, b: real) -> bool {
    return a.x == b.x && a.y == b.y;
}

fn dabs(a: real) -> real {
    return select(a, -a, a.x < 0.0);
}

fn dmax(a: real, b: real) -> real {
    return select(a, b, lt(a, b));
}

fn dmin(a: real, b: real) -> real {
    return select(b, a, lt(a, b));
}

fn clip(x: real, lo: real, hi: real) -> real {
    return select(select(x, hi, gt(x, hi)), lo, lt(x, lo));
}

fn finite_f(x: f32) -> bool {
    return (bitcast<u32>(x) & 0x7f800000u) != 0x7f800000u;
}

fn nan_f(x: f32) -> bool {
    return (bitcast<u32>(x) & 0x7fffffffu) > 0x7f800000u;
}

fn dsqrt(a: real) -> real {
    if (a.x <= 0.0) {
        return Z();
    }
    let s = pn(sqrt(a.x));
    let p = pn(s * s);
    let r = sb(a, real(p, pn(fma(s, s, -p))));
    return fast_two_sum(s, pn(r.x / (2.0 * s)));
}

fn mul2(a: real) -> real {
    return a * 2.0;
}

fn halve(a: real) -> real {
    return a * 0.5;
}

fn A0() -> dacc {
    return dacc(0.0, 0.0);
}

fn acc(a: dacc, x: real) -> dacc {
    let s = pn(a.x + x.x);
    let bb = pn(s - a.x);
    let e = pn(pn(a.x - pn(s - bb)) + pn(x.x - bb));
    return dacc(s, pn(a.y + pn(e + x.y)));
}

fn total(a: dacc) -> real {
    return fast_two_sum(a.x, a.y);
}
