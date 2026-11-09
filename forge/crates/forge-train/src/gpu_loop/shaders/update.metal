constant constexpr float BETA1 = 0.9f;
constant constexpr float BETA2 = 0.999f;
constant constexpr float EPSILON = 1e-8f;
constant constexpr uint NORM_CHUNK = 4096;

kernel void policy_head(device const float *mean [[buffer(0)]], device const float *act [[buffer(1)]],
                        device const float *rows [[buffer(2)]], device const float *params [[buffer(3)]],
                        device float *seed [[buffer(4)]], device float *parts [[buffer(5)]],
                        constant uint *p [[buffer(6)]], constant float *f [[buffer(7)]],
                        device const float *value [[buffer(8)]], device float *value_seed [[buffer(9)]],
                        uint r [[thread_position_in_grid]]) {
    uint count = p[0];
    if (r >= count) {
        return;
    }
    value_seed[r] = (value[r] - rows[2 * count + r]) / float(count);
    device const float *log_std = params + LOG_STD_AT;
    float scale = 1.0f / float(count), clip_range = f[0], constant_part = NACT * LOG_TWO_PI_HALF, quadratic = 0.0f;
    for (int j = 0; j < NACT; j++) {
        constant_part += log_std[j];
        float off = act[r * NACT + j] - mean[r * NACT + j];
        quadratic += off * off * exp(-2.0f * log_std[j]);
    }
    float new_logp = -0.5f * quadratic - constant_part;
    float old_logp = rows[r], advantage = rows[count + r];
    float ratio = exp(new_logp - old_logp);
    float kept = ratio * advantage;
    float clipped = clamp(ratio, 1.0f - clip_range, 1.0f + clip_range) * advantage;
    float weight = kept <= clipped ? -kept * scale : 0.0f;
    for (int j = 0; j < NACT; j++) {
        float off = act[r * NACT + j] - mean[r * NACT + j];
        float target = off * exp(-2.0f * log_std[j]);
        parts[r * (NACT + 1) + j] = weight * (off * target - 1.0f);
        seed[r * NACT + j] = target * weight;
    }
    parts[r * (NACT + 1) + NACT] = old_logp - new_logp;
}

kernel void head_sums(device const float *parts [[buffer(0)]], device float *grads [[buffer(1)]],
                      device float *ctrl [[buffer(2)]], constant uint *p [[buffer(3)]], constant float *f [[buffer(4)]],
                      uint col [[threadgroup_position_in_grid]], uint lid [[thread_index_in_threadgroup]]) {
    threadgroup float shared[REDUCE];
    uint count = p[0];
    float sum = 0.0f;
    for (uint r = lid; r < count; r += REDUCE) {
        sum += parts[r * (NACT + 1) + col];
    }
    float total = tree_sum(shared, sum, lid);
    if (lid != 0) {
        return;
    }
    if (col < NACT) {
        grads[LOG_STD_AT + col] = total - f[0];
    } else {
        ctrl[CTRL_KL] = total / float(count);
    }
}

kernel void split_sum(device const float *partials [[buffer(0)]], device float *grads [[buffer(1)]],
                      device const float *mask [[buffer(2)]], constant uint *p [[buffer(3)]],
                      uint e [[thread_position_in_grid]]) {
    bool second = e >= p[0];
    constant uint *q = p + (second ? 6 : 0);
    uint i = second ? e - p[0] : e;
    uint elems = q[0], slices = q[1], width = q[3];
    if (i >= elems) {
        return;
    }
    float sum = 0.0f;
    for (uint s = 0; s < slices; s++) {
        sum += partials[q[5] + s * elems + i];
    }
    uint row = i / width;
    bool masked = q[4] != 0 && row < NOBS && mask[row] == 0.0f;
    grads[q[2] + i] = masked ? 0.0f : sum;
}

kernel void grad_squares(device const float *grads [[buffer(0)]], device float *partial [[buffer(1)]],
                         uint chunk [[threadgroup_position_in_grid]], uint lid [[thread_index_in_threadgroup]]) {
    threadgroup float shared[REDUCE];
    float sum = 0.0f;
    uint end = min((chunk + 1) * NORM_CHUNK, uint(NPARAMS));
    for (uint i = chunk * NORM_CHUNK + lid; i < end; i += REDUCE) {
        sum += grads[i] * grads[i];
    }
    float total = tree_sum(shared, sum, lid);
    if (lid == 0) {
        partial[chunk] = total;
    }
}

inline void adapt_rate(device float *ctrl, constant float *f) {
    float kl = ctrl[CTRL_KL], desired = f[0], rate = ctrl[CTRL_LR];
    if (kl > desired * 2.0f) {
        rate = max(rate / 1.5f, f[1]);
    } else if (kl < desired / 2.0f) {
        rate = min(rate * 1.5f, f[2]);
    }
    ctrl[CTRL_LR] = rate;
}

kernel void adam_begin(device const float *partial [[buffer(0)]], device float *ctrl [[buffer(1)]],
                       constant float *f [[buffer(2)]], uint lid [[thread_index_in_threadgroup]]) {
    threadgroup float shared[REDUCE];
    uint chunks = (NPARAMS + NORM_CHUNK - 1) / NORM_CHUNK;
    float sum = 0.0f;
    for (uint c = lid; c < chunks; c += REDUCE) {
        sum += partial[c];
    }
    float norm = sqrt(tree_sum(shared, sum, lid));
    if (lid != 0) {
        return;
    }
    ctrl[CTRL_NORM] = norm;
    ctrl[CTRL_APPLY] = isfinite(norm) ? 1.0f : 0.0f;
    if (isfinite(norm)) {
        float steps = ctrl[CTRL_STEPS] + 1.0f;
        ctrl[CTRL_STEPS] = steps;
        ctrl[CTRL_STEP_RATE] = ctrl[CTRL_LR] / (1.0f - pow(BETA1, steps));
        ctrl[CTRL_SECOND] = 1.0f / (1.0f - pow(BETA2, steps));
        ctrl[CTRL_SCALE] = min(1.0f / (norm + 1e-6f), 1.0f);
    }
    adapt_rate(ctrl, f);
}

kernel void adam(device float *params [[buffer(0)]], device const float *grads [[buffer(1)]],
                 device float *first [[buffer(2)]], device float *second [[buffer(3)]],
                 device const float *ctrl [[buffer(4)]], constant float *f [[buffer(5)]],
                 uint i [[thread_position_in_grid]]) {
    if (i >= NPARAMS || ctrl[CTRL_APPLY] == 0.0f) {
        return;
    }
    float scale = ctrl[CTRL_SCALE];
    float g = scale < 1.0f ? grads[i] * scale : grads[i];
    float m = first[i] * BETA1 + g * (1.0f - BETA1);
    float v = second[i] * BETA2 + g * g * (1.0f - BETA2);
    first[i] = m;
    second[i] = v;
    float next = params[i] - ctrl[CTRL_STEP_RATE] * m / (sqrt(v * ctrl[CTRL_SECOND]) + EPSILON);
    params[i] = i >= LOG_STD_AT ? clamp(next, f[0], f[1]) : next;
}
