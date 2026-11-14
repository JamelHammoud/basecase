#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct JointMap {
    pub index: Vec<Option<usize>>,
    pub missing: Vec<String>,
    pub extra: Vec<String>,
}

impl JointMap {
    pub fn matches(&self) -> bool {
        self.missing.is_empty() && self.extra.is_empty()
    }

    pub fn pick<T: Copy>(&self, published: &[T]) -> Vec<Option<T>> {
        self.index
            .iter()
            .map(|at| at.and_then(|at| published.get(at).copied()))
            .collect()
    }
}

pub fn map_joints(scene: &[String], published: &[String]) -> JointMap {
    let index: Vec<Option<usize>> = scene
        .iter()
        .map(|joint| published.iter().position(|name| name == joint))
        .collect();
    let missing = scene
        .iter()
        .zip(&index)
        .filter(|(_, at)| at.is_none())
        .map(|(joint, _)| joint.clone())
        .collect();
    let extra = published.iter().filter(|name| !scene.contains(name)).cloned().collect();

    JointMap { index, missing, extra }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|name| (*name).to_string()).collect()
    }

    #[test]
    fn the_same_joints_in_another_order_map_by_name() {
        let map = map_joints(
            &names(&["shoulder", "elbow", "wrist"]),
            &names(&["wrist", "shoulder", "elbow"]),
        );

        assert_eq!(map.index, vec![Some(1), Some(2), Some(0)]);
        assert!(map.matches());
        assert_eq!(map.pick(&[3.0, 1.0, 2.0]), vec![Some(1.0), Some(2.0), Some(3.0)]);
    }

    #[test]
    fn a_joint_the_robot_leaves_out_is_missing() {
        let map = map_joints(&names(&["shoulder", "elbow"]), &names(&["shoulder"]));

        assert_eq!(map.index, vec![Some(0), None]);
        assert_eq!(map.missing, names(&["elbow"]));
        assert!(map.extra.is_empty());
        assert!(!map.matches());
        assert_eq!(map.pick(&[0.5]), vec![Some(0.5), None]);
    }

    #[test]
    fn a_joint_the_scene_lacks_is_extra() {
        let map = map_joints(&names(&["shoulder"]), &names(&["gripper", "shoulder", "camera_tilt"]));

        assert_eq!(map.index, vec![Some(1)]);
        assert_eq!(map.extra, names(&["gripper", "camera_tilt"]));
        assert!(map.missing.is_empty());
        assert!(!map.matches());
    }

    #[test]
    fn nothing_published_leaves_every_joint_missing() {
        let map = map_joints(&names(&["a", "b"]), &[]);

        assert_eq!(map.index, vec![None, None]);
        assert_eq!(map.missing, names(&["a", "b"]));
    }

    #[test]
    fn a_short_published_list_never_reads_past_its_end() {
        let map = map_joints(&names(&["a", "b"]), &names(&["b", "a"]));

        assert_eq!(map.pick(&[1.0]), vec![None, Some(1.0)]);
    }
}
