@compute @workgroup_size(1)
fn qualify(@builtin(global_invocation_id) id: vec3<u32>) {
    PIN = P.pin;
    for (var i = 0u; i < P.worlds; i++) {
        let at = 8u * i;
        let a = IO[at];
        let b = IO[at + 1u];
        var s: real;
        var co: real;
        sin_cos(a, &s, &co);
        IO[at + 2u] = ad(a, b);
        IO[at + 3u] = sb(a, b);
        IO[at + 4u] = ml(a, b);
        IO[at + 5u] = dv(a, b);
        IO[at + 6u] = dsqrt(dabs(a));
        IO[at + 7u] = s;
    }
}
