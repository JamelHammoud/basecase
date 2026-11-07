use std::env;
use std::path::PathBuf;

fn copy_dll_beside_binaries(lib_dir: &str) {
    let out = PathBuf::from(env::var("OUT_DIR").expect("cargo sets OUT_DIR"));
    let profile_dir = out.ancestors().nth(3).expect("OUT_DIR sits under the profile folder");
    let dll = PathBuf::from(lib_dir).join("mujoco.dll");

    if dll.exists() {
        std::fs::copy(&dll, profile_dir.join("mujoco.dll")).expect("copy mujoco.dll beside forge-train");
    }
}

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let Ok(lib_dir) = env::var("DEP_MUJOCO_LIB_DIR") else {
        return;
    };
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    if target_os == "windows" {
        copy_dll_beside_binaries(&lib_dir);

        return;
    }

    println!("cargo:rustc-link-arg=-Wl,-rpath,{lib_dir}");

    if target_os == "macos" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path");
    } else {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
    }
}
