export interface AccountProfileResponse {
  contract_version: 1;
  user_id: string;
  username: string;
  username_version: number;
  username_review_needed: boolean;
  username_reviewed_at: string | null;
  username_change_available_at: string | null;
  native_session_id?: string | null;
}

export interface UpdateUsernameRequest {
  contract_version: 1;
  command_id: string;
  expected_username_version: number;
  username: string;
}

export interface AccountProblemDetails {
  [extension: string]: unknown;
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
}
