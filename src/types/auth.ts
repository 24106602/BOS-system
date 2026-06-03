export type UserRole = "admin" | "college";

export type UserProfile = {
  id: string;
  auth_user_id: string;
  role: UserRole;
  college_name: string | null;
  display_name: string | null;
  login_email: string | null;
  enabled: boolean;
  created_at: string | null;
};

export type AuthUserContext = {
  profile: UserProfile | null;
  loading: boolean;
  error: string;
};
