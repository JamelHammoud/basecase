import { useEffect, useState } from 'react';
import type {
  AgentConversationSummary,
  CustomModelDefinition,
  ReferenceImageRecord,
  SavedSceneSummary,
} from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';

export function useLibraries() {
  const [customModels, setCustomModels] = useState<CustomModelDefinition[]>([]);
  const [savedScenes, setSavedScenes] = useState<SavedSceneSummary[]>([]);
  const [uploadedImages, setUploadedImages] = useState<ReferenceImageRecord[]>([]);
  const [chatList, setChatList] = useState<AgentConversationSummary[]>([]);

  useEffect(() => {
    platformBridge
      .listModels()
      .then(setCustomModels)
      .catch(() => {});
    platformBridge
      .listScenes()
      .then(setSavedScenes)
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
    savedScenes,
    setSavedScenes,
    uploadedImages,
    setUploadedImages,
    chatList,
    setChatList,
  };
}
