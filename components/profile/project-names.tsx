import { Fragment } from "react";

export function projectLevel(name = "") {
  if (/修士|[硕碩]士/.test(name)) return "master";
  if (name.includes("博士")) return "doctoral";
  if (/本科|[学學][部士]/.test(name)) return "undergraduate";
}

export function ProjectNames({ names, fallback = "待补" }: {
  names: string | string[];
  fallback?: string;
}) {
  const items = typeof names === "string" ? [names] : names;
  if (!items.length) return fallback;
  return items.map((name, index) => (
    <Fragment key={index}>
      {index > 0 && "、"}
      <span data-project-level={projectLevel(name)}>{name}</span>
    </Fragment>
  ));
}
