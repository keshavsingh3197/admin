import { Role } from './auth.models';

/** A managed user as returned by GET /api/users. Mirrors the backend UserListItem DTO. */
export interface UserListItem {
  id: string;
  email: string;
  username?: string | null;
  displayName: string;
  phoneNumber?: string | null;
  roles: Role[];
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
}

export interface UpdateUserRequest {
  username?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  roles?: Role[];
  isActive?: boolean;
}
