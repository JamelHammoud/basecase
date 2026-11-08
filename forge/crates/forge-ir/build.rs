use std::env;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let Ok(lib_dir) = env::var("DEP_MUJOCO_LIB_DIR") else {
        return;
    };

    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() != "windows" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{lib_dir}");
    }
}
