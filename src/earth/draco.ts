import dracoWasm from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoJs from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export const dracoLoader = () => new DRACOLoader().setDecoderPath({ js: dracoJs, wasm: dracoWasm });
