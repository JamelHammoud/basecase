use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const VERSION: &str = "4.0.0";

fn release_file(target_os: &str) -> String {
    match target_os {
        "macos" => format!("mujoco-{VERSION}-macos-universal2.dmg"),
        "windows" => format!("mujoco-{VERSION}-windows-x86_64.zip"),
        _ => format!("mujoco-{VERSION}-linux-x86_64.tar.gz"),
    }
}

fn run(program: &str, args: &[&str]) {
    let status = Command::new(program)
        .args(args)
        .status()
        .unwrap_or_else(|e| panic!("Couldn't start {program}: {e}"));

    assert!(status.success(), "{program} {args:?} failed with {status}");
}

fn path_arg(path: &Path) -> &str {
    path.to_str().expect("MuJoCo's vendor path must be valid UTF-8")
}

fn unpack_dmg(archive: &Path, into: &Path) {
    let mount = archive.with_extension("mnt");
    let attach_args = [
        "attach",
        "-nobrowse",
        "-readonly",
        "-mountpoint",
        path_arg(&mount),
        path_arg(archive),
    ];

    run("hdiutil", &attach_args);

    let framework = mount.join("mujoco.framework");

    fs::create_dir_all(into).expect("create the MuJoCo folder");
    run("cp", &["-R", path_arg(&framework), path_arg(into)]);
    run("hdiutil", &["detach", path_arg(&mount)]);
}

fn unpack_archive(archive: &Path, into: &Path) {
    fs::create_dir_all(into).expect("create the MuJoCo folder");
    run("tar", &["-xf", path_arg(archive), "-C", path_arg(into)]);
}

fn lift_single_folder(into: &Path) {
    let entries: Vec<PathBuf> = fs::read_dir(into)
        .expect("read the unpacked MuJoCo folder")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();

    let [only] = entries.as_slice() else { return };

    if !only.is_dir() || !only.join("include").exists() {
        return;
    }

    for entry in fs::read_dir(only).expect("read MuJoCo's top folder").flatten() {
        fs::rename(entry.path(), into.join(entry.file_name())).expect("move MuJoCo's files up");
    }

    fs::remove_dir(only).expect("remove MuJoCo's empty top folder");
}

pub fn fetch(root: &Path, target_os: &str) {
    let parent = root.parent().expect("the MuJoCo folder has a parent");
    let staging = parent.join(format!("mujoco-{VERSION}.staging-{}", std::process::id()));
    let file = release_file(target_os);
    let url = format!("https://github.com/google-deepmind/mujoco/releases/download/{VERSION}/{file}");

    fs::create_dir_all(&staging).expect("create the MuJoCo download folder");

    let archive = staging.join(&file);
    let unpacked = staging.join("unpacked");

    run("curl", &["-fsSL", "--retry", "3", "-o", path_arg(&archive), &url]);

    if target_os == "macos" {
        unpack_dmg(&archive, &unpacked);
    } else {
        unpack_archive(&archive, &unpacked);
        lift_single_folder(&unpacked);
    }

    if fs::rename(&unpacked, root).is_err() {
        assert!(root.exists(), "Couldn't move MuJoCo into {}", root.display());
    }

    fs::remove_dir_all(&staging).expect("remove the MuJoCo download folder");
}
