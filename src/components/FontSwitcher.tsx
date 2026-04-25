import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { typographyBodySm } from "../lib/typography";

const FONTS = [
  { id: "IBM Plex Sans", label: "IBM Plex Sans" },
  { id: "Geist Sans", label: "Geist" },
  { id: "Inter", label: "Inter" },
  { id: "Plus Jakarta Sans", label: "Plus Jakarta" }
];

const DEFAULT_FONT = "IBM Plex Sans";

function normalizeFontId(raw: string | undefined): string {
  if (!raw) return DEFAULT_FONT;
  return raw.replace(/['"]/g, "").trim() || DEFAULT_FONT;
}

export function FontSwitcher() {
  const [open, setOpen] = useState(false);
  const [activeFont, setActiveFont] = useState(DEFAULT_FONT);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void window.basis.prefs.getApp().then((p) => {
      if (cancelled) return;
      let font = normalizeFontId(p.fontSans);
      if (!p.fontSans) {
        const legacy = localStorage.getItem("basis-font");
        if (legacy) {
          font = normalizeFontId(legacy);
          void window.basis.prefs.setApp({ fontSans: font });
          localStorage.removeItem("basis-font");
        }
      }
      setActiveFont(font);
      document.documentElement.style.setProperty("--basis-font-sans", font);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (fontId: string) => {
    setActiveFont(fontId);
    document.documentElement.style.setProperty("--basis-font-sans", fontId);
    void window.basis.prefs.setApp({ fontSans: fontId });
    setOpen(false);
  };

  return (
    <div className="relative flex items-center h-full" ref={containerRef}>
      <button
        type="button"
        className={`title-bar-no-drag inline-flex items-center justify-center rounded px-2.5 py-1.5 transition-colors hover:bg-[#212121] hover:text-[#BCBCBC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5c5c5c] text-[#8f8f8f] ${
          open ? "bg-[#212121] text-[#BCBCBC]" : ""
        }`}
        onClick={() => setOpen(!open)}
        title="Typography Settings"
      >
        <Settings className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 origin-top-right rounded-md border border-[#363636] bg-[#1c1c1c] p-1 shadow-lg shadow-black/50">
          <div className={`px-2 py-1.5 text-ui-xs font-medium uppercase tracking-wide text-[#6b6b6b]`}>
            Typography
          </div>
          <div className="flex flex-col gap-px">
            {FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => handleSelect(font.id)}
                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left ${typographyBodySm} transition-colors hover:bg-[#2a2a2a] ${
                  activeFont === font.id ? "bg-[#2a2a2a] text-[#e0e0e0]" : "text-[#a0a0a0]"
                }`}
                style={{ fontFamily: `${font.id}, system-ui, sans-serif` }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
