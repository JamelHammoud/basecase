/// A gray image. Pixel (i, j) covers [i, i + 1) x [j, j + 1), so its centre is (i + 0.5, j + 0.5).
pub struct Image<'a> {
    pub data: &'a [u8],
    pub w: usize,
    pub h: usize,
}

impl<'a> Image<'a> {
    #[inline]
    pub fn sample(&self, x: f64, y: f64) -> f64 {
        let fx = (x - 0.5).max(0.0).min((self.w - 1) as f64);
        let fy = (y - 0.5).max(0.0).min((self.h - 1) as f64);
        let ix = (fx as usize).min(self.w - 2);
        let iy = (fy as usize).min(self.h - 2);
        let tx = fx - ix as f64;
        let ty = fy - iy as f64;
        let i = iy * self.w + ix;
        let d = self.data;
        let top = d[i] as f64 * (1.0 - tx) + d[i + 1] as f64 * tx;
        let bottom = d[i + self.w] as f64 * (1.0 - tx) + d[i + self.w + 1] as f64 * tx;

        top * (1.0 - ty) + bottom * ty
    }
}
