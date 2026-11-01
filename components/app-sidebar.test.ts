import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/budget" }));

const html = renderToStaticMarkup(
  createElement(SidebarProvider, null, createElement(AppSidebar)),
);

describe("AppSidebar", () => {
  it("lists the screens in order", () => {
    const labels = [
      "Overview",
      "Budget",
      "Transactions",
      "Review Inbox",
      "Import",
      "Rules",
      "Settings",
    ];
    const positions = labels.map((label) => html.indexOf(`>${label}<`));

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it.each([
    ["Overview", "/"],
    ["Budget", "/budget"],
    ["Rules", "/rules"],
    ["Settings", "/settings"],
  ])("links %s to its route", (label, href) => {
    expect(html).toMatch(
      new RegExp(`href="${href}"[^>]*>.*?<span>${label}</span>`),
    );
  });

  it.each(["Transactions", "Review Inbox", "Import"])(
    "keeps %s unavailable",
    (label) => {
      expect(html).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${label}`),
      );
    },
  );

  it("marks the current screen", () => {
    expect(html).toMatch(/data-active="true"[^>]*href="\/budget"/);
  });

  it("no longer has Quick Start or Templates", () => {
    expect(html).not.toContain("Quick Start");
    expect(html).not.toContain("Templates");
  });
});
