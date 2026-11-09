constant constexpr uint REDUCE = 256;
constant constexpr float OBS_CLIP = 5.0f;
constant constexpr float LOG_TWO_PI_HALF = 0.9189385332f;

inline float tree_sum(threadgroup float *shared, float value, uint lid) {
    shared[lid] = value;
    threadgroup_barrier(mem_flags::mem_threadgroup);
    for (uint stride = REDUCE / 2; stride > 0; stride /= 2) {
        if (lid < stride) {
            shared[lid] += shared[lid + stride];
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    float total = shared[0];
    threadgroup_barrier(mem_flags::mem_threadgroup);
    return total;
}

kernel void normalize(device const float *raw [[buffer(0)]], device const float *stats [[buffer(1)]],
                      device float *out [[buffer(2)]], constant uint *p [[buffer(3)]],
                      uint i [[thread_position_in_grid]]) {
    if (i >= p[0]) {
        return;
    }
    uint col = i % NOBS;
    float std = sqrt(stats[NOBS + col] + 1e-8f);
    out[p[1] + i] = clamp((raw[i] - stats[col]) / std, -OBS_CLIP, OBS_CLIP);
}

kernel void norm_update(device const float *raw [[buffer(0)]], device float *stats [[buffer(1)]],
                        constant uint *p [[buffer(2)]], uint col [[threadgroup_position_in_grid]],
                        uint lid [[thread_index_in_threadgroup]]) {
    threadgroup float shared[REDUCE];
    uint rows = p[0];
    float sum = 0.0f;
    for (uint r = lid; r < rows; r += REDUCE) {
        sum += raw[r * NOBS + col];
    }
    float mean = tree_sum(shared, sum, lid) / float(rows);
    float squares = 0.0f;
    for (uint r = lid; r < rows; r += REDUCE) {
        float off = raw[r * NOBS + col] - mean;
        squares += off * off;
    }
    float var = tree_sum(shared, squares, lid) / float(rows);
    if (lid != 0) {
        return;
    }
    float count = stats[2 * NOBS + col], incoming = float(rows), total = count + incoming;
    float delta = mean - stats[col];
    stats[col] += delta * incoming / total;
    stats[NOBS + col] = (stats[NOBS + col] * count + var * incoming + delta * delta * count * incoming / total) / total;
    stats[2 * NOBS + col] = total;
}

kernel void sample(device const float *mean [[buffer(0)]], device const float *params [[buffer(1)]],
                   device float *act [[buffer(2)]], device float *logp [[buffer(3)]], device uint4 *rngs [[buffer(4)]],
                   constant uint *p [[buffer(5)]], uint w [[thread_position_in_grid]]) {
    if (w >= p[0]) {
        return;
    }
    device const float *log_std = params + LOG_STD_AT;
    uint4 rng = rngs[w];
    float quadratic = 0.0f, constant_part = 0.0f;
    for (int j = 0; j < NACT; j++) {
        float unit = normal32(rng);
        act[(p[1] + w) * NACT + j] = mean[w * NACT + j] + exp(log_std[j]) * unit;
        quadratic += unit * unit;
        constant_part += log_std[j];
    }
    logp[p[1] + w] = -0.5f * quadratic - (constant_part + NACT * LOG_TWO_PI_HALF);
    rngs[w] = rng;
}

kernel void gae(device float *rew [[buffer(0)]], device const float *val [[buffer(1)]],
                device const float *done [[buffer(2)]], device const float *timeout [[buffer(3)]],
                device const float *last [[buffer(4)]], device float *adv [[buffer(5)]], device float *ret [[buffer(6)]],
                constant uint *p [[buffer(7)]], constant float *f [[buffer(8)]], uint w [[thread_position_in_grid]]) {
    uint n = p[0], horizon = p[1];
    if (w >= n) {
        return;
    }
    float gamma = f[0], lambda = f[1], running = 0.0f;
    for (int t = int(horizon) - 1; t >= 0; t--) {
        uint at = uint(t) * n + w;
        float reward = rew[at] + gamma * val[at] * timeout[at];
        float next = uint(t) == horizon - 1 ? last[w] : val[at + n];
        float alive = 1.0f - done[at];
        float delta = reward + gamma * next * alive - val[at];
        running = delta + gamma * lambda * alive * running;
        rew[at] = reward;
        adv[at] = running;
        ret[at] = running + val[at];
    }
}

kernel void moments(device float *adv [[buffer(0)]], device float *ctrl [[buffer(1)]], constant uint *p [[buffer(2)]],
                    uint lid [[thread_index_in_threadgroup]]) {
    threadgroup float shared[REDUCE];
    uint total = p[0];
    float sum = 0.0f;
    for (uint i = lid; i < total; i += REDUCE) {
        sum += adv[i];
    }
    float mean = tree_sum(shared, sum, lid) / float(total);
    float squares = 0.0f;
    for (uint i = lid; i < total; i += REDUCE) {
        float off = adv[i] - mean;
        squares += off * off;
    }
    float std = sqrt(tree_sum(shared, squares, lid) / max(float(total) - 1.0f, 1.0f)) + 1e-8f;
    if (lid == 0) {
        ctrl[CTRL_ADV_MEAN] = mean;
        ctrl[CTRL_ADV_STD] = std;
    }
}

kernel void standardize(device float *adv [[buffer(0)]], device const float *ctrl [[buffer(1)]],
                        constant uint *p [[buffer(2)]], uint i [[thread_position_in_grid]]) {
    if (i < p[0]) {
        adv[i] = (adv[i] - ctrl[CTRL_ADV_MEAN]) / ctrl[CTRL_ADV_STD];
    }
}

kernel void gather(device const uint *perm [[buffer(0)]], device const float *obs [[buffer(1)]],
                   device const float *act [[buffer(2)]], device const float *rows [[buffer(3)]],
                   device float *mb_obs [[buffer(4)]], device float *mb_act [[buffer(5)]], device float *mb_rows [[buffer(6)]],
                   constant uint *p [[buffer(7)]], uint slot [[thread_position_in_grid]]) {
    uint count = p[0], total = p[2];
    if (slot >= count) {
        return;
    }
    uint i = perm[p[1] + slot];
    for (int k = 0; k < NOBS; k++) {
        mb_obs[slot * NOBS + k] = obs[i * NOBS + k];
    }
    for (int k = 0; k < NACT; k++) {
        mb_act[slot * NACT + k] = act[i * NACT + k];
    }
    for (uint field = 0; field < 3; field++) {
        mb_rows[field * count + slot] = rows[field * total + i];
    }
}
