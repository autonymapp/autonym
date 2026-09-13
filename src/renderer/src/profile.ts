const PROFILE_NAME_KEY = 'autonym:profileName'

export function getStoredProfileName(): string {
  return localStorage.getItem(PROFILE_NAME_KEY) ?? ''
}

export function setProfileName(name: string): void {
  localStorage.setItem(PROFILE_NAME_KEY, name)
}
