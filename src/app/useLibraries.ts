import { useEffect, useState } from 'react';
import type { AgentConversationSummary, CustomModelDefinition, ReferenceImageRecord } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';

export function useLibraries() {
  const [customModels, setCustomModels] = useState<CustomModelDefinition[]>([]);
  const [uploadedImages, setUploadedImages] = useState<ReferenceImageRecord[]>([]);
  const [chatList, setChatList] = useState<AgentConversationSummary[]>([]);

  useEffect(() => {
    platformBridge
      .listModels()
      .then(setCustomModels)
      .catch(() => {});
    platformBridge
      .listScenes()
      .then(sceneStore.set)
      .catch(() => {});
    platformBridge
      .listImages()
      .then(setUploadedImages)
      .catch(() => {});
    platformBridge
      .listChats()
      .then(setChatList)
      .catch(() => {});
  }, []);

  return {
    customModels,
    setCustomModels,
    uploadedImages,
    setUploadedImages,
    chatList,
    setChatList,
  };
}
