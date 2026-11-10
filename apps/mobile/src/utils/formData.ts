import { Platform } from 'react-native';

export interface UploadFileParam {
  uri: string;
  name: string;
  type: string;
  file?: any;
}

/**
 * Universal platform-compatible FormData builder for file uploads.
 * - On Web / Expo Web: Converts blob/data/http URIs or native File instances into true binary Blobs
 *   so browsers send a real multipart file part instead of the string "[object Object]".
 * - On Native (Android / iOS): Appends React Native's file descriptor object ({ uri, name, type }).
 */
export async function appendFileToFormData(
  formData: FormData,
  fieldName: string,
  file: UploadFileParam
): Promise<void> {
  const isWeb =
    Platform.OS === 'web' ||
    (typeof window !== 'undefined' && typeof window.document !== 'undefined');

  // 1. If explicit File or Blob is already present (e.g. from Web ImagePicker)
  if (
    file.file &&
    typeof Blob !== 'undefined' &&
    (file.file instanceof Blob || (file.file as any).size !== undefined)
  ) {
    formData.append(fieldName, file.file, file.name || (file.file as any).name);
    return;
  }

  // 2. On Web, convert URI (blob:, data:, http:) to a real binary Blob
  if (isWeb && file.uri) {
    if (
      file.uri.startsWith('blob:') ||
      file.uri.startsWith('data:') ||
      file.uri.startsWith('http://') ||
      file.uri.startsWith('https://')
    ) {
      try {
        const res = await fetch(file.uri);
        const blob = await res.blob();
        formData.append(fieldName, blob, file.name);
        return;
      } catch (err) {
        console.warn('[formData] Failed to convert URI to Blob on Web, falling back to native descriptor:', err);
      }
    }
  }

  // 3. Native Android / iOS
  formData.append(fieldName, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as any);
}

