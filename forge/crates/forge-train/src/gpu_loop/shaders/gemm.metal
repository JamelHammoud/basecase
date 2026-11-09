#include <metal_stdlib>
using namespace metal;

constant constexpr uint TILE = 32;
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

template <bool TA, bool TB>
inline void fill_tiles(device const float *a, device const float *b, constant Gemm &g, threadgroup float *as,
                       threadgroup float *bs, uint3 at, uint lid) {
    uint row0 = at.x, col0 = at.y, k0 = at.z;
    uint k_end = min(g.k, (k0 / g.slice_len + 1) * g.slice_len);
    for (uint e = lid; e < TILE * KT; e += THREADS) {
        uint i = TA ? e % TILE : e / KT;
        uint kk = TA ? e / TILE : e % KT;
        bool inside = row0 + i < g.m && k0 + kk < k_end;
        as[i * KT + kk] = inside ? load_a<TA>(a, g, row0 + i, k0 + kk) : 0.0f;
    }
    for (uint e = lid; e < KT * TILE; e += THREADS) {
        uint kk = TB ? e % KT : e / TILE;
        uint j = TB ? e / KT : e % TILE;
        bool inside = col0 + j < g.n && k0 + kk < k_end;
        bs[kk * TILE + j] = inside ? load_b<TB>(b, g, k0 + kk, col0 + j) : 0.0f;
    }
}

template <bool TA, bool TB>
kernel void gemm(device const float *a [[buffer(0)]], device const float *b [[buffer(1)]], device float *c [[buffer(2)]],
                 device const float *h [[buffer(3)]], constant Gemm &g [[buffer(4)]],
                 uint tg [[threadgroup_position_in_grid]], uint lid [[thread_index_in_threadgroup]],
                 uint sg [[simdgroup_index_in_threadgroup]]) {
    threadgroup float as[TILE * KT];
    threadgroup float bs[KT * TILE];
    threadgroup float cs[TILE * TILE];
    uint tiles_m = (g.m + TILE - 1) / TILE, tiles_n = (g.n + TILE - 1) / TILE;
    uint slice = tg / (tiles_m * tiles_n), rest = tg % (tiles_m * tiles_n);
    uint row0 = (rest / tiles_n) * TILE, col0 = (rest % tiles_n) * TILE;
    uint k_begin = slice * g.slice_len, k_end = min(g.k, k_begin + g.slice_len);
    uint sr = (sg / 2) * 16, sc = (sg % 2) * 16;
    simdgroup_float8x8 acc[2][2];
    for (uint x = 0; x < 2; x++) {
        for (uint y = 0; y < 2; y++) {
            acc[x][y] = make_filled_simdgroup_matrix<float, 8, 8>(0.0f);
        }
    }
    for (uint k0 = k_begin; k0 < k_end; k0 += KT) {
        fill_tiles<TA, TB>(a, b, g, as, bs, uint3(row0, col0, k0), lid);
        threadgroup_barrier(mem_flags::mem_threadgroup);
        for (uint kk = 0; kk < KT; kk += 8) {
            simdgroup_float8x8 a0, a1, b0, b1;
            simdgroup_load(a0, as + sr * KT + kk, KT);
            simdgroup_load(a1, as + (sr + 8) * KT + kk, KT);
            simdgroup_load(b0, bs + kk * TILE + sc, TILE);
            simdgroup_load(b1, bs + kk * TILE + sc + 8, TILE);
            simdgroup_multiply_accumulate(acc[0][0], a0, b0, acc[0][0]);
            simdgroup_multiply_accumulate(acc[0][1], a0, b1, acc[0][1]);
            simdgroup_multiply_accumulate(acc[1][0], a1, b0, acc[1][0]);
            simdgroup_multiply_accumulate(acc[1][1], a1, b1, acc[1][1]);
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    for (uint x = 0; x < 2; x++) {
        for (uint y = 0; y < 2; y++) {
            simdgroup_store(acc[x][y], cs + (sr + 8 * x) * TILE + sc + 8 * y, TILE);
        }
    }
    threadgroup_barrier(mem_flags::mem_threadgroup);
    uint out = g.c_off + slice * g.m * g.n;
    for (uint e = lid; e < TILE * TILE; e += THREADS) {
        uint r = row0 + e / TILE, col = col0 + e % TILE;
        if (r < g.m && col < g.n) {
            c[out + r * g.ldc + col] = finish(cs[e], h, g, r, col);
        }
    }
}

template [[host_name("gemm_nn")]] kernel void gemm<false, false>(device const float *, device const float *,
                                                                 device float *, device const float *,
                                                                 constant Gemm &, uint, uint, uint);
template [[host_name("gemm_nt")]] kernel void gemm<false, true>(device const float *, device const float *,
                                                                device float *, device const float *,
                                                                constant Gemm &, uint, uint, uint);
template [[host_name("gemm_tn")]] kernel void gemm<true, false>(device const float *, device const float *,
                                                                device float *, device const float *,
                                                                constant Gemm &, uint, uint, uint);
