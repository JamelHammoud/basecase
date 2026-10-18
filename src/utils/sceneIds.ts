/** Id for a new scene (saved to library/scenes/<id>.json) */
export const newSceneId = () => `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
