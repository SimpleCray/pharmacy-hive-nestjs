/**
 * Download a file from a Jotform uploads URL (e.g. webhook `qN_fileuploadM` values).
 * Pass the API key when the form has "Require log-in" for uploads.
 */
export async function fetchJotformUploadFileBlob(fileUrl: string, apiKey: string): Promise<Blob> {
  const response = await fetch(fileUrl, {
    method: 'GET',
    headers: {
      APIKEY: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Jotform file fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.blob();
}

export async function fetchJotformUploadFileBuffer(fileUrl: string, apiKey: string): Promise<Buffer> {
  const blob = await fetchJotformUploadFileBlob(fileUrl, apiKey);
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
