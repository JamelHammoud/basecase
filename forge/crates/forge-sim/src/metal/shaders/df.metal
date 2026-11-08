#include <metal_stdlib>
using namespace metal;

struct alignas(8) df {
    float hi;
    float lo;
};

typedef df real;

inline df D(float x) { return df{x, 0.0f}; }

inline df two_sum(float a, float b) {
    float s = a + b;
    float bb = s - a;
    return df{s, (a - (s - bb)) + (b - bb)};
}

inline df fast_two_sum(float a, float b) {
    float s = a + b;
    return df{s, b - (s - a)};
}

inline df operator+(df a, df b) {
    df s = two_sum(a.hi, b.hi);
    s.lo += a.lo + b.lo;
    return fast_two_sum(s.hi, s.lo);
}

inline df operator-(df a) { return df{-a.hi, -a.lo}; }
inline df operator-(df a, df b) { return a + (-b); }

inline df operator*(df a, df b) {
    float p = a.hi * b.hi;
    float e = fma(a.hi, b.hi, -p);
    e = fma(a.hi, b.lo, e);
    e = fma(a.lo, b.hi, e);
    return fast_two_sum(p, e);
}

inline df operator*(df a, float b) {
    float p = a.hi * b;
    float e = fma(a.hi, b, -p);
    e = fma(a.lo, b, e);
    return fast_two_sum(p, e);
}

inline df operator/(df a, df b) {
    float q1 = a.hi / b.hi;
    df r = a - b * q1;
    float q2 = r.hi / b.hi;
    r = r - b * q2;
    float q3 = r.hi / b.hi;
    df q = fast_two_sum(q1, q2);
    return q + D(q3);
}

inline df operator+(df a, float b) { return a + D(b); }
inline df operator-(df a, float b) { return a - D(b); }
inline df operator/(df a, float b) { return a / D(b); }

inline thread df &operator+=(thread df &a, df b) { a = a + b; return a; }
inline thread df &operator-=(thread df &a, df b) { a = a - b; return a; }
inline thread df &operator*=(thread df &a, df b) { a = a * b; return a; }
inline device df &operator+=(device df &a, df b) { a = a + b; return a; }
inline device df &operator-=(device df &a, df b) { a = a - b; return a; }
inline device df &operator*=(device df &a, df b) { a = a * b; return a; }
inline threadgroup df &operator+=(threadgroup df &a, df b) { a = a + b; return a; }
inline threadgroup df &operator-=(threadgroup df &a, df b) { a = a - b; return a; }
inline threadgroup df &operator*=(threadgroup df &a, df b) { a = a * b; return a; }

inline bool operator<(df a, df b) { return a.hi < b.hi || (a.hi == b.hi && a.lo < b.lo); }
inline bool operator>(df a, df b) { return b < a; }
inline bool operator<=(df a, df b) { return !(b < a); }
inline bool operator>=(df a, df b) { return !(a < b); }
inline bool operator==(df a, df b) { return a.hi == b.hi && a.lo == b.lo; }
inline bool operator!=(df a, df b) { return !(a == b); }

inline df dabs(df a) { return a.hi < 0.0f ? -a : a; }
inline df dmax(df a, df b) { return a < b ? b : a; }
inline df dmin(df a, df b) { return a < b ? a : b; }
inline df clip(df x, df lo, df hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline bool finite_df(df a) { return isfinite(a.hi) && isfinite(a.lo); }

inline df dsqrt(df a) {
    if (a.hi <= 0.0f) {
        return D(0.0f);
    }
    float s = sqrt(a.hi);
    float p = s * s;
    df sq = df{p, fma(s, s, -p)};
    df r = a - sq;
    return fast_two_sum(s, r.hi / (2.0f * s));
}

inline df mul2(df a) { return df{a.hi * 2.0f, a.lo * 2.0f}; }
inline df halve(df a) { return df{a.hi * 0.5f, a.lo * 0.5f}; }

struct dacc {
    float hi;
    float lo;
};

inline dacc A0() { return dacc{0.0f, 0.0f}; }

inline thread dacc &operator+=(thread dacc &a, df x) {
    float s = a.hi + x.hi;
    float bb = s - a.hi;
    a.lo += ((a.hi - (s - bb)) + (x.hi - bb)) + x.lo;
    a.hi = s;
    return a;
}

inline thread dacc &operator-=(thread dacc &a, df x) { return a += -x; }

inline df sum(dacc a) { return fast_two_sum(a.hi, a.lo); }
