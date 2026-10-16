/** 사진 저장소. 서비스 코드는 이 인터페이스만 쓴다. 클라이언트에는 서명 URL만 준다. */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** 만료 시간이 있는 접근 URL */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
