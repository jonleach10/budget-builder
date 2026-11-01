import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "caption",
            "body-sm",
            "body",
            "subheading",
            "heading-sm",
            "heading",
            "heading-lg",
            "display",
          ],
        },
      ],
      shadow: [
        { shadow: ["hairline", "hairline-focus", "glass", "modal", "glow"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
