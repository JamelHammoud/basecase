inline uint rotl32(uint x, uint k) { return (x << k) | (x >> (32u - k)); }

inline uint next32(thread uint4 &s) {
    uint result = rotl32(s.y * 5u, 7u) * 9u;
    uint t = s.y << 9u;
    s.z ^= s.x;
    s.w ^= s.y;
    s.y ^= s.z;
    s.x ^= s.w;
    s.z ^= t;
    s.w = rotl32(s.w, 11u);
    return result;
}

inline float unit32(thread uint4 &s) { return (float)(next32(s) >> 8) * (1.0f / 16777216.0f); }

inline float uniform32(thread uint4 &s, float low, float high) { return low + (high - low) * unit32(s); }

inline int range32(thread uint4 &s, int low, int high) {
    uint span = (uint)max(high - low, 1);
    return low + (int)(next32(s) % span);
}

inline float normal32(thread uint4 &s) {
    float u = max(unit32(s), 1.0f / 16777216.0f);
    float v = unit32(s);
    return precise::sqrt(-2.0f * precise::log(u)) * precise::cos(2.0f * M_PI_F * v);
}
