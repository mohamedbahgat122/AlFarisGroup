import Image from "next/image";
import { brand } from "@/config/brand";
import type { Locale } from "@/types/locale";

type BrandIdentityProps = {
  locale: Locale;
  compact?: boolean;
  variant?: "full" | "compact" | "iconOnly";
};

export function BrandIdentity({
  locale,
  compact = false,
  variant,
}: BrandIdentityProps) {
  const resolvedVariant = variant ?? (compact ? "compact" : "full");
  const isFull = resolvedVariant === "full";
  const isCompact = resolvedVariant === "compact";
  const isIconOnly = resolvedVariant === "iconOnly";

  return (
    <div
      className={
        isFull
          ? "relative z-10"
          : isIconOnly
            ? "flex w-full items-center justify-center"
            : "flex items-center gap-3"
      }
    >
      <div
        className={
          isIconOnly
            ? "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black"
            : isCompact
            ? "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black"
            : "mx-auto flex w-full max-w-[250px] items-center justify-center overflow-hidden rounded-3xl bg-black shadow-[0_24px_70px_rgba(16,35,63,0.24)] sm:max-w-[300px]"
        }
      >
        <Image
          src={brand.logo.src}
          alt={brand.logo.alt[locale]}
          width={brand.logo.width}
          height={brand.logo.height}
          priority={isFull}
          sizes={isFull ? "(max-width: 640px) 210px, 300px" : "48px"}
          className="h-auto w-full"
          style={{ height: "auto" }}
        />
      </div>
      {isIconOnly ? null : (
        <div
          className={
            isCompact
              ? "min-w-0"
              : "mx-auto mt-7 max-w-xl text-center text-white"
          }
        >
          <p
            className={
              isCompact
                ? "truncate text-sm font-semibold text-navy"
                : "text-3xl font-semibold tracking-normal text-gold sm:text-4xl"
            }
          >
            {brand.name[locale]}
          </p>
          <p
            className={
              isCompact
                ? "truncate text-xs text-muted"
                : "mt-3 text-base leading-7 text-white/76 sm:text-lg"
            }
          >
            {brand.systemDescription[locale]}
          </p>
        </div>
      )}
    </div>
  );
}
