import { SYSTEM_ROLES, SYSTEM_ROLE_KEYS, type SystemRole } from "@/lib/permissions";

export function RoleBadges({
  systemRoles,
  customRoles,
}: {
  systemRoles: readonly SystemRole[];
  customRoles: { id: string; name: string }[];
}) {
  if (systemRoles.length === 0 && customRoles.length === 0) {
    return <span className="text-xs text-zinc-400">Sin roles</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {SYSTEM_ROLE_KEYS.filter((key) => systemRoles.includes(key)).map((key) => (
        <span
          key={key}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
            key === "owner" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          {SYSTEM_ROLES[key].label}
        </span>
      ))}
      {customRoles.map((role) => (
        <span
          key={role.id}
          className="rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-zinc-600"
        >
          {role.name}
        </span>
      ))}
    </div>
  );
}
