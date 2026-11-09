use std::fs;
use std::path::{Path, PathBuf};

const MAX_LINES: usize = 400;

fn sources(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("readable source folder").flatten() {
        let path = entry.path();

        if path.is_dir() {
            sources(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs" || e == "metal") {
            out.push(path);
        }
    }
}

#[test]
fn gpu_loop_sources_carry_no_comments_and_stay_short() {
    let mut files = Vec::new();

    sources(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src/gpu_loop"), &mut files);
    sources(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src/shac"), &mut files);

    assert!(files.len() > 10, "found only {} source files", files.len());

    for file in files {
        let text = fs::read_to_string(&file).expect("readable source");
        let lines = text.lines().filter(|l| !l.trim().is_empty()).count();
        let commented = text.lines().position(|l| l.trim_start().starts_with("//"));

        assert!(lines <= MAX_LINES, "{} has {lines} lines", file.display());
        assert!(
            commented.is_none(),
            "{} has a comment on line {}",
            file.display(),
            commented.unwrap_or(0) + 1
        );
    }
}
