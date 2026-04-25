import { TitleBar, titleBarTitleText } from "../components/TitleBar";
import { typographyBodySm, typographyLabel } from "../lib/typography";

const btnBase =
  `inline-flex items-center justify-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 ${typographyLabel} text-neutral-200 shadow-sm transition-colors hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 disabled:pointer-events-none disabled:opacity-40`;

type VaultSetupPageProps = {
  onPickVault: () => void | Promise<void>;
};

export function VaultSetupPage({ onPickVault }: VaultSetupPageProps) {
  return (
    <main className="flex h-full min-h-0 flex-col bg-canvas text-neutral-100">
      <TitleBar center={<span className={titleBarTitleText}>Basis</span>} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className={`max-w-sm ${typographyBodySm} text-neutral-500`}>Select a vault directory to begin.</p>
        <button type="button" className={btnBase} onClick={() => void onPickVault()}>
          Choose vault
        </button>
      </div>
    </main>
  );
}
