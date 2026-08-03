import { Role } from './auth.models';
import { ChatVisibility } from './chat.models';

/** A managed user as returned by GET /api/users. Mirrors the backend UserListItem DTO. */
export interface UserListItem {
  id: string;
  email: string;
  username?: string | null;
  displayName: string;
  phoneNumber?: string | null;
  roles: Role[];
  customRoleKeys: string[];
  groupIds: string[];
  chatVisibility: ChatVisibility;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface CreateUserRequest {
  email: string;
  username?: string | null;
  displayName: string;
  phoneNumber?: string | null;
  password: string;
  roles: Role[];
  customRoleKeys?: string[];
}

export interface UpdateUserRequest {
  username?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  roles?: Role[];
  customRoleKeys?: string[];
  isActive?: boolean;
}
