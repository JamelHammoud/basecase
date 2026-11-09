kernel void qualify(device real *io [[buffer(0)]], device real *s [[buffer(1)]], device int *n [[buffer(2)]],
                    device const uint *order [[buffer(3)]], device int *stats [[buffer(4)]],
                    constant uint *params [[buffer(5)]], uint t [[thread_position_in_grid]]) {
    if (t != 0) {
        return;
    }
    for (uint i = 0; i < params[0]; i++) {
        uint at = 8 * i;
        real a = io[at], b = io[at + 1];
        real sine, cosine;
        sin_cos(a, sine, cosine);
        io[at + 2] = a + b;
        io[at + 3] = a - b;
        io[at + 4] = a * b;
        io[at + 5] = a / b;
        io[at + 6] = dsqrt(dabs(a));
        io[at + 7] = sine;
    }
}
