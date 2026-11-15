import { roboflowBridge } from '../../../roboflow/roboflowBridge';

export default function roboflowStudio() {
  return { roboflowKey: (key: string) => roboflowBridge.setKey(key) };
}
