export interface AccessRule {
  effect: string;
  actions: string[];
  scope: string;
  conditions?: Partial<Record<'robot' | 'site', Record<string, string[]>>>;
}

export interface AccessResource {
  id: string;
  name: string;
  attributes?: Record<string, string>;
  roles?: string[];
  members?: string[];
  rules?: AccessRule[];
}

export interface AccessPage<T = AccessResource> {
  items: T[];
  next: string | null;
}

export const ACCESS_KINDS = [
  { value: 'account', label: 'Accounts' },
  { value: 'group', label: 'Groups' },
  { value: 'role', label: 'Roles' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'providers', label: 'Providers' },
];
