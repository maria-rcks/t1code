/**
 * Profile management for t1chat mode.
 *
 * Profiles let users organize conversations under different personas.
 * Each profile has a name, icon, and unique ID. Threads can be
 * associated with a profile so switching profiles filters the sidebar.
 */

export interface Profile {
  id: string;
  name: string;
  icon: string;
}

/** Nerd Font icons available for profile selection. */
export const PROFILE_ICON_OPTIONS: { icon: string; label: string }[] = [
  { icon: "󰭹", label: "Chat" },
  { icon: "󰫢", label: "Star" },
  { icon: "󰃀", label: "Bookmark" },
  { icon: "󰋑", label: "Heart" },
  { icon: "󰈻", label: "Flag" },
  { icon: "󱐋", label: "Lightning" },
  { icon: "󰐊", label: "Play" },
  { icon: "󰛕", label: "Sparkles" },
  { icon: "󰂞", label: "Bell" },
  { icon: "󰛨", label: "Bulb" },
  { icon: "󰋜", label: "Home" },
  { icon: "󰉋", label: "Folder" },
  { icon: "󰃭", label: "Calendar" },
  { icon: "󰇮", label: "Mail" },
  { icon: "󰈙", label: "File" },
  { icon: "󰂺", label: "Book" },
  { icon: "󰊗", label: "Briefcase" },
  { icon: "󰆼", label: "Database" },
  { icon: "󰳗", label: "Cube" },
  { icon: "󰕮", label: "Music" },
  { icon: "󰄀", label: "Camera" },
  { icon: "󰈈", label: "Eye" },
  { icon: "󰟃", label: "Globe" },
  { icon: "󰑴", label: "Graduate" },
];

export const DEFAULT_PROFILE: Profile = {
  id: "default",
  name: "Default",
  icon: "󰭹",
};

export function createProfile(name: string, icon: string): Profile {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    id: `${slug}-${Date.now()}`,
    name,
    icon,
  };
}

export function reorderProfiles(
  profiles: Profile[],
  fromIndex: number,
  toIndex: number,
): Profile[] {
  const result = [...profiles];
  const [moved] = result.splice(fromIndex, 1);
  if (moved) {
    result.splice(toIndex, 0, moved);
  }
  return result;
}
