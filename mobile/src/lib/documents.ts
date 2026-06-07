import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { IntakeDocument } from './types';

function fileNameFromUri(uri: string, fallback: string): string {
  const clean = uri.split('?')[0] || '';
  const value = clean.split('/').filter(Boolean).pop();
  return value || fallback;
}

export async function pickDocumentFile(): Promise<IntakeDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    multiple: false,
    copyToCacheDirectory: true
  });

  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    fileUri: asset.uri,
    fileName: asset.name || fileNameFromUri(asset.uri, 'document'),
    mimeType: asset.mimeType || 'application/octet-stream'
  };
}

export async function pickImageFromLibrary(): Promise<IntakeDocument | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1
  });

  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    fileUri: asset.uri,
    fileName: asset.fileName || fileNameFromUri(asset.uri, 'image.jpg'),
    mimeType: asset.mimeType || 'image/jpeg'
  };
}

export async function captureImage(): Promise<IntakeDocument | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: 1
  });

  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    fileUri: asset.uri,
    fileName: asset.fileName || fileNameFromUri(asset.uri, 'capture.jpg'),
    mimeType: asset.mimeType || 'image/jpeg'
  };
}
