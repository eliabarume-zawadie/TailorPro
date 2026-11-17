// The signed-in user's account as the app sees it. Shared by the auth provider and the local cache.
export interface Workspace {
  id: string; name: string; version: number; role: 'owner' | 'staff';
  location: string; businessType: string; currency: string; timezone: string;
}
export interface Profile { fullName: string; phone: string | null; email: string | null; locale: string }
