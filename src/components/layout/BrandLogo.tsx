import Link from "next/link";

export default function BrandLogo({
  href = "/dashboard",
  light = false,
  showSubtitle = true,
  size = "md",
}: {
  href?: string;
  light?: boolean;
  showSubtitle?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const nameSize =
    size === "lg" ? "text-[22px]" : size === "sm" ? "text-[14px]" : "text-[15px]";
  const subSize = size === "lg" ? "text-[12px]" : "text-[10px]";

  return (
    <Link href={href} className="flex min-w-0 flex-col leading-none">
      <span
        className={`${nameSize} font-bold tracking-[-0.03em] ${
          light ? "text-white" : "text-nt-text"
        }`}
      >
        netrichtechnologies
      </span>
      {showSubtitle && (
        <span
          className={`${subSize} mt-1 font-medium tracking-[0.01em] ${
            light ? "text-white/65" : "text-nt-text-muted"
          }`}
        >
          Microsoft 365 Control Panel
        </span>
      )}
    </Link>
  );
}
