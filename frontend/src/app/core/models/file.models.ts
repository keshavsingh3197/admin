/** A document owned by / shared with the user. Mirrors the API's UserFileDto. */
export interface UserFile {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  folderId: string | null;
}

/** A folder in the document tree. */
export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  shareCount: number;
  createdAt: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export type AccessLevel = 'owner' | 'editor' | 'viewer';
export type SubjectType = 'user' | 'group';
export type ShareLevel = 'viewer' | 'editor';

/** Contents of one folder (or the root), plus the caller's access there. */
export interface BrowseView {
  folderId: string | null;
  myAccess: AccessLevel;
  breadcrumb: BreadcrumbItem[];
  folders: FolderDto[];
  files: UserFile[];
  sharedWithMe: FolderDto[];
}

export interface FolderShareDto {
  subjectType: SubjectType;
  subjectId: string;
  subjectName: string;
  level: ShareLevel;
}

export interface ShareRequest {
  subjectType: SubjectType;
  subjectId: string;
  level: ShareLevel;
}
