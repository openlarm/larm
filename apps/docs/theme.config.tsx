import React from "react"
import type { DocsThemeConfig } from "nextra-theme-docs"

const config: DocsThemeConfig = {
  logo: (
    <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>
      LARM{" "}
      <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 14 }}>
        Low Altitude Risk Model
      </span>
    </span>
  ),
  project: {
    link: "https://github.com/openlarm/larm",
  },
  chat: {
    // Placeholder for future Discord / community link.
    // link: "https://discord.gg/openlarm",
  },
  docsRepositoryBase: "https://github.com/openlarm/larm/tree/main/apps/docs",
  footer: {
    content: (
      <span>
        {"© "}
        {new Date().getFullYear()}{" "}
        <a href="https://openlarm.org" target="_blank" rel="noreferrer">
          The LARM Authors
        </a>
        {" · Apache License 2.0 · Not a substitute for pilot-in-command judgment."}
      </span>
    ),
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta
        name="description"
        content="LARM — Low Altitude Risk Model. Deterministic, region-agnostic risk-assessment decision-support for low-altitude drone operations."
      />
      <meta property="og:title" content="LARM — Low Altitude Risk Model" />
      <meta
        property="og:description"
        content="Deterministic drone-operation risk scoring (R0–R4), SORA 2.5 integrated, Apache 2.0 licensed."
      />
      <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    </>
  ),
  sidebar: {
    defaultMenuCollapseLevel: 1,
  },
  toc: {
    backToTop: true,
  },
  feedback: {
    content: "Report an issue on GitHub →",
    labels: "docs",
  },
  editLink: {
    content: "Edit this page on GitHub",
  },
  banner: {
    key: "alpha-release",
    content: (
      <span>
        LARM is currently in pre-release. `@openlarm/core@0.1.0-alpha.0`
        published to npm once the team signs off. Track progress at{" "}
        <a href="https://github.com/openlarm/larm" target="_blank" rel="noreferrer">
          github.com/openlarm/larm
        </a>
        .
      </span>
    ),
  },
}

export default config
