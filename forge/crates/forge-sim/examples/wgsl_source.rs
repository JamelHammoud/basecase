use forge_sim::wgsl::{layout_for, program};
use forge_sim::Plan;

fn main() -> Result<(), String> {
    let path = std::env::args()
        .nth(1)
        .ok_or("Usage: wgsl_source <model.xml> [workgroup bytes]")?;
    let bytes = std::env::args()
        .nth(2)
        .and_then(|b| b.parse().ok())
        .unwrap_or(32 * 1024);
    let (_, kernel) = forge_ir::load(std::path::Path::new(&path)).map_err(|r| r.to_string())?;
    let plan = Plan::new(kernel);
    let layout = layout_for(&plan, bytes);

    print!("{}", program(&plan, &layout).source);

    Ok(())
}
