#include <metal_stdlib>
using namespace metal;

constant constexpr uint KT = 16;
constant constexpr uint THREADS = 128;

struct Gemm {
    uint m;
    uint n;
    uint k;
    uint lda;
    uint ldb;
    uint ldc;
    uint a_off;
    uint b_off;
    uint c_off;
    uint ones;
    uint epilogue;
    uint h_off;
    uint ldh;
    uint slice_len;
};

template <bool TA>
inline float load_a(device const float *a, constant Gemm &g, uint i, uint kk) {
    if ((g.ones == 1 && kk == g.k - 1) || (g.ones == 2 && i == g.m - 1)) {
        return 1.0f;
    }
    return TA ? a[g.a_off + kk * g.lda + i] : a[g.a_off + i * g.lda + kk];
}

template <bool TB>
inline float load_b(device const float *b, constant Gemm &g, uint kk, uint j) {
    return TB ? b[g.b_off + j * g.ldb + kk] : b[g.b_off + kk * g.ldb + j];
}

inline float finish(float v, device const float *h, constant Gemm &g, uint r, uint c) {
    if (g.epilogue == 1) {
        return v > 0.0f ? v : exp(v) - 1.0f;
    }
    if (g.epilogue == 2) {
        float x = h[g.h_off + r * g.ldh + c];
        return v * (x > 0.0f ? 1.0f : x + 1.0f);
    }
    return v;
}

template <bool TA, bool TB, uint T>
inline void fill_tiles(device const float *a, device const float *b, constant Gemm &g, threadgroup float *as,
                       threadgroup float *bs, uint3 at, uint lid) {
    uint row0 = at.x, col0 = at.y, k0 = at.z;
    uint k_end = min(g.k, (k0 / g.slice_len + 1) * g.slice_len);
    for (uint e = lid; e < T * KT; e += THREADS) {
        uint i = TA ? e % T : e / KT;
        uint kk = TA ? e / T : e % KT;
        bool inside = row0 + i < g.m && k0 + kk < k_end;
        as[i * KT + kk] = inside ? load_a<TA>(a, g, row0 + i, k0 + kk) : 0.0f;
    }
    for (uint e = lid; e < KT * T; e += THREADS) {
        uint kk = TB ? e % KT : e / T;
        uint j = TB ? e / KT : e % T;
        bool inside = col0 + j < g.n && k0 + kk < k_end;
        bs[kk * T + j] = inside ? load_b<TB>(b, g, k0 + kk, col0 + j) : 0.0f;
    }
}

template <uint T>
inline void multiply(threadgroup float *as, threadgroup float *bs, thread simdgroup_float8x8 (&acc)[T / 16][T / 16],
                     uint2 at) {
    constexpr uint F = T / 16;
    for (uint kk = 0; kk < KT; kk += 8) {
        simdgroup_float8x8 af[F], bf[F];
        for (uint x = 0; x < F; x++) {
            simdgroup_load(af[x], as + (at.x + 8 * x) * KT + kk, KT);
            simdgroup_load(bf[x], bs + kk * T + at.y + 8 * x, T);
        }
        for (uint x = 0; x < F; x++) {
            for (uint y = 0; y < F; y++) {
                simdgroup_multiply_accumulate(acc[x][y], af[x], bf[y], acc[x][y]);
            }
        }
    }
}

template <bool TA, bool TB, uint T>
inline void tile(device const float *a, device const float *b, device float *c, device const float *h,
                 constant Gemm &g, uint3 at, threadgroup float *as, threadgroup float *bs, threadgroup float *cs) {
    constexpr uint F = T / 16;
    uint tg = at.x, lid = at.y, sg = at.z;
    uint tiles_m = (g.m + T - 1) / T, tiles_n = (g.n + T - 1) / T;
    uint slice = tg / (tiles_m * tiles_n), rest = tg % (tiles_m * tiles_n);
    uint row0 = (rest / tiles_n) * T, col0 = (rest % tiles_n) * T;
    uint k_begin = slice * g.slice_len, k_end = min(g.k, k_begin + g.slice_len);
    uint2 sub = uint2((sg / 2) * (T / 2), (sg % 2) * (T / 2));
    simdgroup_float8x8 acc[F][F];
    for (uint x = 0; x < F; x++) {
        for (uint y = 0; y < F; y++) {
            acc[x][y] = make_filled_simdgroup_matrix<float, 8, 8>(0.0f);
        }
    }
    for (uint k0 = k_begin; k0 < k_end; k0 += KT) {
        fill_tiles<TA, TB, T>(a, b, g, as, bs, uint3(row0, col0, k0), lid);
        threadgroup_barrier(mem_flags::mem_threadgroup);
        multiply<T>(as, bs, acc, sub);
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    for (uint x = 0; x < F; x++) {
        for (uint y = 0; y < F; y++) {
            simdgroup_store(acc[x][y], cs + (sub.x + 8 * x) * T + sub.y + 8 * y, T);
        }
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);
    uint out = g.c_off + slice * g.m * g.n;
    for (uint e = lid; e < T * T; e += THREADS) {
        uint r = row0 + e / T, col = col0 + e % T;
        if (r < g.m && col < g.n) {
            c[out + r * g.ldc + col] = finish(cs[e], h, g, r, col);
        }
    }
}

template <uint T>
inline uint groups_of(constant Gemm &g) {
    uint tiles = ((g.m + T - 1) / T) * ((g.n + T - 1) / T);
    return g.m == 0 ? 0 : tiles * ((g.k + g.slice_len - 1) / g.slice_len);
}

template <bool TA, bool TB, uint T>
kernel void gemm(device const float *a0 [[buffer(0)]], device const float *b0 [[buffer(1)]],
                 device float *c0 [[buffer(2)]], device const float *h0 [[buffer(3)]],
                 device const float *a1 [[buffer(4)]], device const float *b1 [[buffer(5)]],
                 device float *c1 [[buffer(6)]], device const float *h1 [[buffer(7)]],
                 constant Gemm *gs [[buffer(8)]], uint tg [[threadgroup_position_in_grid]],
                 uint lid [[thread_index_in_threadgroup]], uint sg [[simdgroup_index_in_threadgroup]]) {
    threadgroup float as[T * KT];
    threadgroup float bs[KT * T];
    threadgroup float cs[T * T];
    uint first = groups_of<T>(gs[0]);
    if (tg < first) {
        tile<TA, TB, T>(a0, b0, c0, h0, gs[0], uint3(tg, lid, sg), as, bs, cs);
    } else {
        tile<TA, TB, T>(a1, b1, c1, h1, gs[1], uint3(tg - first, lid, sg), as, bs, cs);
    }
}

#define GEMM_ARGS                                                                                                      \
    device const float *, device const float *, device float *, device const float *, device const float *,            \
        device const float *, device float *, device const float *, constant Gemm *, uint, uint, uint

template [[host_name("gemm_nn")]] kernel void gemm<false, false, 32>(GEMM_ARGS);
template [[host_name("gemm_nt")]] kernel void gemm<false, true, 32>(GEMM_ARGS);
template [[host_name("gemm_tn")]] kernel void gemm<true, false, 32>(GEMM_ARGS);
