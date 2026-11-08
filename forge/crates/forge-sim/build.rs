use std::env;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let Ok(lib_dir) = env::var("DEP_MUJOCO_LIB_DIR") else {
        return;
    };
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    if target_os == "windows" {
        return;
    }

    println!("cargo:rustc-link-arg=-Wl,-rpath,{lib_dir}");

    if target_os == "macos" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path");
    } else {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
    }
}
