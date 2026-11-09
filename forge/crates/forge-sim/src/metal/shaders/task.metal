inline float joined(real x) { return x.hi + x.lo; }

inline float3 into_frame(float4 q, float3 v) {
    float w = q.x, x = q.y, y = q.z, z = q.w;
    float scale = 2.0f * w * w - 1.0f;
    float3 cross_v = float3(y * v.z - z * v.y, z * v.x - x * v.z, x * v.y - y * v.x);
    float along = 2.0f * (x * v.x + y * v.y + z * v.z);
    return v * scale - cross_v * (w * 2.0f) + float3(x, y, z) * along;
}

inline float4 root_quat(device const real *row) {
    int at = QPOS + TASK_ROOT_QPOS + 3;
    return float4(joined(row[at]), joined(row[at + 1]), joined(row[at + 2]), joined(row[at + 3]));
}

inline float3 root_vec(device const real *row, int at) {
    return float3(joined(row[at]), joined(row[at + 1]), joined(row[at + 2]));
}

inline void task_state(device const real *row, device const float *env, thread TaskState &s) {
    float4 q = root_quat(row);
    float3 g = into_frame(q, float3(0.0f, 0.0f, -1.0f));
    float3 v = into_frame(q, root_vec(row, QVEL + TASK_ROOT_DOF));
    float3 w = root_vec(row, QVEL + TASK_ROOT_DOF + 3);
    for (int k = 0; k < 3; k++) {
        s.g[k] = g[k];
        s.w[k] = w[k];
        s.v[k] = v[k];
        s.cmd[k] = env[ENV_CMD + k];
    }
    s.z = joined(row[QPOS + TASK_ROOT_QPOS + 2]);
    s.z0 = TASK_Z0;
    s.dt = TASK_DT;
    for (int j = 0; j < NACT; j++) {
        s.jp[j] = joined(row[QPOS + TJ_QPOS[j]] - TJ_DEFAULT[j]);
        s.jv[j] = joined(row[QVEL + TJ_DOF[j]]);
        s.a[j] = env[j];
        s.la[j] = env[ENV_LA + j];
    }
}

inline real yawed(real hc, real hs, d4 q, int k) {
    real w = hc * q.v[0] - hs * q.v[3];
    real x = hc * q.v[1] - hs * q.v[2];
    real y = hc * q.v[2] + hs * q.v[1];
    real z = hc * q.v[3] + hs * q.v[0];
    return k == 0 ? w : (k == 1 ? x : (k == 2 ? y : z));
}

inline void reset_world(device real *row, device const real *start, device float *env, thread uint4 &rng) {
    for (int i = 0; i < TMASS; i++) {
        row[i] = start[i];
    }
    for (int j = 0; j < NACT; j++) {
        int at = QPOS + TJ_QPOS[j];
        real moved = row[at] + D(uniform32(rng, -TASK_NOISE, TASK_NOISE));
        row[at] = dmin(dmax(moved, TJ_LO[j]), TJ_HI[j]);
    }
    float half_yaw = uniform32(rng, -M_PI_F, M_PI_F) * 0.5f;
    real hc = D(precise::cos(half_yaw)), hs = D(precise::sin(half_yaw));
    int at = QPOS + TASK_ROOT_QPOS + 3;
    d4 q = d4{{row[at], row[at + 1], row[at + 2], row[at + 3]}};
    for (int k = 0; k < 4; k++) {
        row[at + k] = yawed(hc, hs, q, k);
    }
    for (int j = 0; j < 2 * NACT; j++) {
        env[j] = 0.0f;
    }
}

inline void draw_command(device float *env, device int *counter, thread uint4 &rng, int steps) {
    if (!TASK_RESAMPLE) {
        for (int k = 0; k < 3; k++) {
            env[ENV_CMD + k] = CMD_LO[k];
        }
        counter[2] = TASK_NEVER;
        return;
    }
    bool still = STILL_SHARE > 0.0f && unit32(rng) < STILL_SHARE;
    float gap = uniform32(rng, RESAMPLE_LO, RESAMPLE_HI);
    for (int k = 0; k < 3; k++) {
        env[ENV_CMD + k] = still ? 0.0f : uniform32(rng, CMD_LO[k], CMD_HI[k]);
    }
    counter[2] = steps + max((int)gap, 1);
}

inline float drawn_bias(thread uint4 &rng, float bias) {
    return bias > 0.0f ? uniform32(rng, -bias, bias) : 0.0f;
}

inline int drawn_delay(thread uint4 &rng, float ceiling) {
    if (!TASK_DELAY_RAMP) {
        return range32(rng, DELAY_LO, DELAY_HI + 1);
    }
    int reach = (int)((ceiling - (float)DELAY_LO + 1.0f) * unit32(rng));
    return DELAY_LO + min(reach, DELAY_HI - DELAY_LO);
}

inline void reset_conditions(device float *env, device int *counter, thread uint4 &rng, float ceiling) {
    draw_command(env, counter, rng, 0);
    counter[3] = DELAY_HI > 0 ? drawn_delay(rng, ceiling) : 0;
    for (int j = 0; j < NACT; j++) {
        env[ENV_ENC + j] = drawn_bias(rng, ENC_BIAS);
    }
    for (int k = 0; k < 2; k++) {
        env[ENV_IMU + k] = drawn_bias(rng, IMU_BIAS);
    }
    for (int i = 0; i < TASK_DEPTH * NACT; i++) {
        env[ENV_RING + i] = 0.0f;
    }
}

kernel void task_reset(device real *io [[buffer(0)]], device const real *start [[buffer(1)]],
                       device float *env [[buffer(2)]], device int *counters [[buffer(3)]],
                       device uint4 *rngs [[buffer(4)]], device const float *knobs [[buffer(5)]],
                       constant uint *p [[buffer(6)]], uint w [[thread_position_in_grid]]) {
    if (w >= p[0]) {
        return;
    }
    uint4 rng = rngs[w];
    device float *mine = env + w * TASK_ENV;
    device int *counter = counters + TASK_COUNTERS * w;
    reset_world(io + w * NSTATE, start, mine, rng);
    counter[0] = 0;
    counter[1] = TASK_PUSHES ? range32(rng, PUSH_GAP_LO, PUSH_GAP_HI) : TASK_NEVER;
    reset_conditions(mine, counter, rng, knobs[0]);
    rngs[w] = rng;
}

inline void push(device real *row, device int *counter, thread uint4 &rng) {
    if (!TASK_PUSHES || counter[0] < counter[1]) {
        return;
    }
    float angle = uniform32(rng, 0.0f, 2.0f * M_PI_F);
    float speed = uniform32(rng, PUSH_SPEED_LO, PUSH_SPEED_HI);
    int gap = range32(rng, PUSH_GAP_LO, PUSH_GAP_HI);
    int at = QVEL + TASK_ROOT_DOF;
    row[at] = row[at] + D(precise::cos(angle) * speed);
    row[at + 1] = row[at + 1] + D(precise::sin(angle) * speed);
    counter[1] = counter[0] + gap;
}

kernel void task_act(device real *io [[buffer(0)]], device float *env [[buffer(1)]],
                     device int *counters [[buffer(2)]], device uint4 *rngs [[buffer(3)]],
                     device const float *acts [[buffer(4)]], constant uint *p [[buffer(5)]],
                     uint w [[thread_position_in_grid]]) {
    if (w >= p[0]) {
        return;
    }
    device real *row = io + w * NSTATE;
    device float *mine = env + w * TASK_ENV;
    device float *ring = mine + ENV_RING;
    device int *counter = counters + TASK_COUNTERS * w;
    device const float *taken = acts + (p[1] + w) * NACT;
    for (int u = 0; u < NU; u++) {
        row[CTRL + u] = CTRL_DEFAULT[u];
    }
    for (int d = TASK_DEPTH - 1; d > 0; d--) {
        for (int j = 0; j < NACT; j++) {
            ring[d * NACT + j] = ring[(d - 1) * NACT + j];
        }
    }
    int late = counter[3] * NACT;
    for (int j = 0; j < NACT; j++) {
        float a = TASK_SQUASH ? precise::tanh(taken[j]) : clamp(taken[j], -1.0f, 1.0f);
        mine[j] = a;
        ring[j] = a;
        real target = TJ_DEFAULT[j] + TASK_SCALE * D(ring[late + j]);
        row[CTRL + TJ_ACT[j]] = dmin(dmax(target, TJ_LO[j]), TJ_HI[j]);
    }
    uint4 rng = rngs[w];
    push(row, counter, rng);
    rngs[w] = rng;
}

kernel void task_after(device real *io [[buffer(0)]], device const real *start [[buffer(1)]],
                       device float *env [[buffer(2)]], device int *counters [[buffer(3)]],
                       device uint4 *rngs [[buffer(4)]], device float *rew [[buffer(5)]],
                       device float *done [[buffer(6)]], device float *timeout [[buffer(7)]],
                       device float *fell [[buffer(8)]], device const float *knobs [[buffer(9)]],
                       constant uint *p [[buffer(10)]], uint w [[thread_position_in_grid]]) {
    if (w >= p[0]) {
        return;
    }
    device real *row = io + w * NSTATE;
    device float *mine = env + w * TASK_ENV;
    device int *counter = counters + TASK_COUNTERS * w;
    int steps = counter[0] + 1;
    counter[0] = steps;
    TaskState s;
    task_state(row, mine, s);
    bool fallen = TASK_FALL_RESETS && task_fell(s) != 0.0f;
    bool ended = steps >= TASK_EPISODE;
    uint at = p[1] + w;
    rew[at] = task_reward(s);
    done[at] = (fallen || ended) ? 1.0f : 0.0f;
    timeout[at] = ended ? 1.0f : 0.0f;
    fell[at] = fallen ? 1.0f : 0.0f;
    for (int j = 0; j < NACT; j++) {
        mine[ENV_LA + j] = mine[j];
    }
    uint4 rng = rngs[w];
    if (fallen || ended) {
        reset_world(row, start, mine, rng);
        counter[0] = 0;
        reset_conditions(mine, counter, rng, knobs[0]);
    } else if (TASK_RESAMPLE && steps >= counter[2]) {
        draw_command(mine, counter, rng, steps);
    }
    rngs[w] = rng;
}

inline void observed(device const float *env, thread TaskState &s) {
    for (int j = 0; j < NACT; j++) {
        s.jp[j] += env[ENV_ENC + j];
    }
    if (IMU_BIAS <= 0.0f) {
        return;
    }
    float sr = precise::sin(env[ENV_IMU]), cr = precise::cos(env[ENV_IMU]);
    float sp = precise::sin(env[ENV_IMU + 1]), cp = precise::cos(env[ENV_IMU + 1]);
    float g0 = s.g[0], g1 = cr * s.g[1] - sr * s.g[2], g2 = sr * s.g[1] + cr * s.g[2];
    s.g[0] = cp * g0 + sp * g2;
    s.g[1] = g1;
    s.g[2] = -sp * g0 + cp * g2;
}

kernel void task_observe(device const real *io [[buffer(0)]], device const float *env [[buffer(1)]],
                         device float *obs [[buffer(2)]], constant uint *p [[buffer(3)]],
                         uint w [[thread_position_in_grid]]) {
    if (w >= p[0]) {
        return;
    }
    device const float *mine = env + w * TASK_ENV;
    TaskState s;
    task_state(io + w * NSTATE, mine, s);
    observed(mine, s);
    task_observe_one(s, obs + (p[1] + w) * NOBS);
}
