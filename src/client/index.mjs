// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
import { createReasoningSettingsController } from "./controller.mjs";
import { createCCSwitchImportController } from "./import-controller.mjs";
import { registerReasoningSettings } from "./registration.mjs";
import { ModelsFooterPanel } from "../ui/ModelsFooterPanel.mjs";
import { installEmbedStyles } from "./styles.mjs";

export const name = "dsh-ccswitch-importer-plus";

// 0.2.0: remote settings/credentials namespaces are mounted by dsh-api-remotes;
// dsh-client-runtime no longer exists and connection.api is gone.
export const inject = [
  "slots",
  "locale",
  "remote",
];

export function apply(ctx) {
  const controller = createReasoningSettingsController(ctx.remote);
  const importer = createCCSwitchImportController({
    getRevision: () => controller.getSnapshot().revision,
    onImported: () => controller.refresh(),
  });
  const t = ctx.locale.bind("dsh-ccswitch-importer-plus");
  const removeStyles = installEmbedStyles();
  const dispose = registerReasoningSettings(ctx, {
    controller,
    importer,
    component: ModelsFooterPanel,
    t,
  });
  ctx.effect(() => {
    controller.refresh();
    return () => {
      dispose();
      removeStyles();
    };
  }, "dsh-ccswitch-importer-plus.lifecycle");
}
