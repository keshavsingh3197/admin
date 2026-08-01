/** A private file owned by the signed-in user. Mirrors the API's UserFileDto. */
export interface UserFile {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}
