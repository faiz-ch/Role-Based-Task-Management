import React from "react";

/**
 * "Institutions of Rashid Latif Khan Group" footer, shown on every page.
 *
 * Built from separate logos (frontend/public/brand/institutions) and real text,
 * matching the original footer artwork. Everything is sized from one number,
 * `scale` (1 = original artwork size). To add an institution: put its logo in
 * public/brand/institutions and add one line to INSTITUTIONS.
 */

type Institution = {
  logo: string;
  /** logo height at scale 1 (px) */
  h: number;
  name: [string, string] | null; // null = the name is part of the logo (wordmark)
  color?: string;
  /** slightly smaller lettering (long names) */
  small?: boolean;
  alt: string;
};

const INSTITUTIONS: Institution[] = [
  { logo: "rlmc.png", h: 96, name: ["Rashid Latif", "Medical Complex"], color: "#BE2A30", alt: "Rashid Latif Medical Complex" },
  { logo: "rlku-mc-full.png", h: 139, name: null, alt: "RLKU Medical College" },
  { logo: "rldc.png", h: 96, name: ["Rashid Latif", "Dental College"], color: "#2E5C78", alt: "Rashid Latif Dental College" },
  { logo: "rlcp.png", h: 96, name: ["Rashid Latif", "College of Pharmacy"], color: "#167838", small: true, alt: "Rashid Latif College of Pharmacy" },
  { logo: "hlh.png", h: 86, name: ["Hameed Latif", "Hospital"], color: "#1F6E3E", alt: "Hameed Latif Hospital" },
  { logo: "life.png", h: 57, name: ["Lahore Institute of", "Fertility & Endocrinology"], color: "#2B2B2B", alt: "LIFE — Lahore Institute of Fertility & Endocrinology" },
  { logo: "amth.png", h: 96, name: ["Arif Memorial", "Teaching Hospital"], color: "#2E6CB0", alt: "Arif Memorial Teaching Hospital" },
  { logo: "hlth.png", h: 91, name: ["Hameed Latif", "Teaching Hospital"], color: "#353A8C", alt: "Hameed Latif Teaching Hospital" },
  { logo: "rlku.png", h: 98, name: ["Rashid Latif", "Khan University"], color: "#2A2B44", alt: "Rashid Latif Khan University" },
];

export function InstitutionsFooter({
  variant = "app",
  className = "",
}: {
  /** "auth" = gold rule on top (sign-in / register); "app" = thin border (inside the app) */
  variant?: "app" | "auth";
  className?: string;
}) {
  return (
    <footer
      aria-labelledby="rlk-institutions-label"
      className={`rlk-footer ${variant === "auth" ? "rlk-footer--auth" : ""} ${className}`}
    >
      <span id="rlk-institutions-label" className="rlk-footer__label">
        Institutions of Rashid Latif Khan Group
      </span>
      <ul className="rlk-footer__list">
        {INSTITUTIONS.map((inst) => (
          <li
            key={inst.logo}
            className={`rlk-inst ${inst.name ? "" : "rlk-inst--wordmark"} ${inst.small ? "rlk-inst--small" : ""}`}
            style={{ ["--h" as any]: `${inst.h}px`, ["--c" as any]: inst.color ?? "inherit" }}
          >
            <div className="rlk-inst__logo">
              <img src={`/brand/institutions/${inst.logo}`} alt={`${inst.alt} logo`} loading="lazy" />
            </div>
            {inst.name && (
              <span className="rlk-inst__name">
                {inst.name[0]}
                <br />
                {inst.name[1]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
}
