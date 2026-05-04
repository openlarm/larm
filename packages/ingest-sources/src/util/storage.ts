export interface StorageClient {
  upload(
    path: string,
    body: Blob,
    opts?: { contentType?: string },
  ): Promise<{ path: string; fullPath: string; size: number }>
}
