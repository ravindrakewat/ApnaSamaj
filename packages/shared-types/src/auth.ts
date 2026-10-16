import { UserRole, UserStatus } from './user.js';

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  phone: string;
  password: string;
  fullName: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  city?: string;
  state?: string;
  subCaste?: string;
  gotra?: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  isPhoneVerified: boolean;
}

export interface LoginResponseData {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface RegisterResponseData {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface RefreshResponseData {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface AccessTokenPayload {
  sub: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  jti?: string;
  iat?: number;
  exp?: number;
}
