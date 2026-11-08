mod fetch;

use std::env;
use std::path::{Path, PathBuf};

fn vendor_root() -> PathBuf {
    if let Ok(dir) = env::var("FORGE_MUJOCO_DIR") {
        return PathBuf::from(dir);
    }

    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("cargo sets the manifest dir"));

    manifest.join("../../vendor").join(format!("mujoco-{}", fetch::VERSION))
}

fn compile_shim(root: &Path, target_os: &str) {
    let mut build = cc::Build::new();

    build.file("src/shim.c").file("src/fields.c").warnings(true);

    if target_os == "macos" {
        build.flag(format!("-F{}", root.display()));
    } else {
        build.include(root.join("include"));
    }

    build.compile("forge_mujoco_shim");
}

fn emit_link(root: &Path, target_os: &str) {
    match target_os {
        "macos" => {
            println!("cargo:rustc-link-search=framework={}", root.display());
            println!("cargo:rustc-link-lib=framework=mujoco");
            println!("cargo:lib_dir={}", root.display());
        }
        "windows" => {
            println!("cargo:rustc-link-search=native={}", root.join("lib").display());
            println!("cargo:rustc-link-search=native={}", root.join("bin").display());
            println!("cargo:rustc-link-lib=dylib=mujoco");
            println!("cargo:lib_dir={}", root.join("bin").display());
        }
        _ => {
            println!("cargo:rustc-link-search=native={}", root.join("lib").display());
            println!("cargo:rustc-link-lib=dylib=mujoco");
            println!("cargo:lib_dir={}", root.join("lib").display());
        }
    }

    if target_os != "windows" {
        let lib_dir = if target_os == "macos" {
            root.to_path_buf()
        } else {
            root.join("lib")
        };

        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_dir.display());
    }
}

fn main() {
    println!("cargo:rerun-if-changed=src/shim.c");
    println!("cargo:rerun-if-changed=src/fields.c");
    println!("cargo:rerun-if-changed=build/main.rs");
    println!("cargo:rerun-if-changed=build/fetch.rs");
    println!("cargo:rerun-if-env-changed=FORGE_MUJOCO_DIR");
    println!("cargo:rerun-if-env-changed=FORGE_CHECK_ONLY");

    if env::var("FORGE_CHECK_ONLY").is_ok() {
        return;
    }

    let target_os = env::var("CARGO_CFG_TARGET_OS").expect("cargo sets the target os");
    let root = vendor_root();

    if !root.exists() {
        fetch::fetch(&root, &target_os);
    }

    compile_shim(&root, &target_os);
    emit_link(&root, &target_os);
}
