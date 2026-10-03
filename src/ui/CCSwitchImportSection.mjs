// dsh-ccswitch-importer-plus — derivative of dsh-ccswitch-importer
// (Apache-2.0, https://github.com/wtiaw/dsh-ccswitch-importer).
// Changed for DSH 0.2.0-rc.2. See NOTICE and the README section
// "与上游的差异 / Differences from upstream".
import React, { useEffect, useSyncExternalStore } from "react";
import { saveCollapse, withPanelToggled } from "./collapse-state.mjs";
import { makeTranslator } from "../client/i18n.mjs";

const h = React.createElement;

function isSelectable(profile) {
  return profile.status !== 'blocked' && profile.credential === 'found';
}

function statusKey(status) {
  if (status === 'new') return 'importer.status.new';
  if (status === 'update') return 'importer.status.update';
  if (status === 'unchanged') return 'importer.status.unchanged';
  if (status === 'blocked') return 'importer.status.blocked';
  return undefined;
}

function statusLabel(status, tr) {
  const key = statusKey(status);
  return key ? tr(key, status) : (status ?? '');
}

function badgeClass(status) {
  const safe = status === 'new' || status === 'update' || status === 'unchanged' || status === 'blocked' ? status : 'unchanged';
  return `dsh-ccswitch-import__badge dsh-ccswitch-import__badge--${safe}`;
}

/**
 * An empty scan has several distinct causes (no CC Switch installed, database
 * present but no importable rows, unreadable schema, Node without node:sqlite).
 * Reporting them as one message leaves the user with no next step.
 */
function emptyMessage(snapshot, tr) {
  const probed = snapshot.probedPath || '~/.cc-switch/cc-switch.db';
  if (snapshot.source === 'not-installed') {
    return tr('importer.emptyNotInstalled', '未检测到 CC Switch 数据库（已查找 {path}）。', { path: probed });
  }
  if (snapshot.source === 'no-profiles') {
    return tr('importer.emptyNoProfiles', 'CC Switch 数据库中没有可导入的 provider。');
  }
  if (snapshot.source === 'unreadable') {
    return tr('importer.emptyUnreadable', 'CC Switch 数据库无法读取（表结构异常或文件损坏）。');
  }
  if (snapshot.source === 'unsupported-node') {
    return tr('importer.emptyUnsupportedNode', '当前 Node 版本无法加载 node:sqlite，因此读不到 CC Switch 数据库。');
  }
  return tr('importer.empty', '没有可读取的 CCSwitch provider。');
}

export function CCSwitchImportSection({ controller, collapse, setCollapse, t }) {
  const tr = makeTranslator(t);
  if (!controller) return null;
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (snapshot.phase === 'idle') void controller.scan().catch(() => {});
  }, [controller, snapshot.phase]);
  const busy = snapshot.phase === "loading" || snapshot.phase === "importing";
  const selected = new Set(snapshot.selectedIds);
  const profiles = Array.isArray(snapshot.profiles) ? snapshot.profiles : [];
  const importableIds = profiles.filter(isSelectable).map((profile) => profile.profileId);
  const selectedCount = importableIds.filter((id) => selected.has(id)).length;
  const allSelected = importableIds.length > 0 && selectedCount === importableIds.length;
  const collapsed = collapse?.importPanel === true;
  const toggleCollapsed = () => {
    if (typeof setCollapse !== "function") return;
    setCollapse((current) => {
      const next = withPanelToggled(current, "importPanel");
      saveCollapse(next);
      return next;
    });
  };
  return h("section", { className: "dsh-ccswitch-import" + (collapsed ? " dsh-ccswitch-import--collapsed" : ""), "aria-labelledby": "dsh-ccswitch-import-title" },
    h("div", { className: "dsh-ccswitch-import__header" },
      h("div", null,
        h("h2", { id: "dsh-ccswitch-import-title", className: "dsh-ccswitch-import__title" }, tr('importer.title', 'CCSwitch 导入')),
        h("p", { className: "dsh-ccswitch-import__hint" }, collapsed
          ? tr('importer.hintCollapsed', '点击展开 CCSwitch 导入设置')
          : tr('importer.hintExpanded', '从本机 CCSwitch 读取 provider 配置。')),
      ),
      h("div", { className: "dsh-ccswitch-import__header-actions" },
        h("button", {
          type: "button",
          className: "dsh-ccswitch-collapse",
          "aria-expanded": !collapsed,
          "aria-controls": "dsh-ccswitch-import-body",
          "aria-label": tr('importer.collapseAria', '展开或收起 CCSwitch 导入面板'),
          onClick: toggleCollapsed,
        }, h("span", { "aria-hidden": "true" }, collapsed ? "⌄" : "⌃")),
        !collapsed && h("div", { className: "dsh-ccswitch-import__actions" },
          h("button", { className: "dsh-ccswitch-import__secondary", type: "button", disabled: busy, onClick: () => { void controller.scan().catch(() => {}); } }, busy ? tr('importer.scanning', '处理中…') : tr('importer.scan', '扫描')),
          h("button", { className: "dsh-ccswitch-import__primary", type: "button", disabled: busy || selected.size === 0, onClick: () => { void controller.importSelected().catch(() => {}); } }, tr('importer.importSelected', '导入选中')),
        ),
      ),
    ),
    h("div", { id: "dsh-ccswitch-import-body", className: "dsh-ccswitch-import__body", hidden: collapsed },
      snapshot.error && h("p", { role: "alert", className: "dsh-ccswitch-import__error" }, snapshot.error),
      profiles.length === 0 && snapshot.phase !== "loading"
        ? h("p", { className: "dsh-ccswitch-import__empty" }, emptyMessage(snapshot, tr))
        : h("div", { className: "dsh-ccswitch-import__list" },
          h("label", { className: "dsh-ccswitch-import__row dsh-ccswitch-import__row--select-all" },
            h("input", {
              type: "checkbox",
              checked: allSelected,
              ref: (el) => { if (el) el.indeterminate = selectedCount > 0 && !allSelected; },
              disabled: busy || importableIds.length === 0,
              onChange: () => controller.toggleSelectAll(),
            }),
            h("span", { className: "dsh-ccswitch-import__content" },
              h("strong", null, allSelected ? tr('importer.selectNone', '取消全选') : tr('importer.selectAll', '全选')),
              h("span", { className: "dsh-ccswitch-import__meta-line" },
                h("span", null, tr('importer.selectedCount', '已选 {selected} / {total} 个可导入', { selected: selectedCount, total: importableIds.length })),
              ),
            ),
          ),
          ...profiles.map((profile) => {
            const selectable = isSelectable(profile);
            return h("label", {
              key: profile.profileId,
              className: "dsh-ccswitch-import__row" + (selectable ? "" : " dsh-ccswitch-import__row--blocked"),
            },
              h("input", {
                type: "checkbox",
                checked: selected.has(profile.profileId),
                disabled: !selectable || busy,
                onChange: () => controller.toggleSelected(profile.profileId),
              }),
              h("span", { className: "dsh-ccswitch-import__content" },
                h("span", { className: "dsh-ccswitch-import__primary-line" },
                  h("strong", null, profile.profileName || profile.profileId),
                  profile.baseURL ? h("code", null, profile.baseURL) : null,
                ),
                h("span", { className: "dsh-ccswitch-import__meta-line" },
                  h("code", { className: "dsh-ccswitch-import__provider-key" }, profile.providerKey || tr('importer.pendingKey', '待生成 provider key')),
                  h("span", null, `${profile.credential === "found" ? tr('importer.credentialFound', '凭据已找到') : tr('importer.credentialMissing', '缺少凭据')} · ${(profile.modelIds ?? []).join(", ") || tr('importer.noModels', '无模型')}`),
                  Array.isArray(profile.warnings) && profile.warnings.length > 0
                    ? h("span", { className: "dsh-ccswitch-import__warnings" }, profile.warnings.join("；"))
                    : null,
                ),
              ),
              h("span", { className: badgeClass(profile.status) }, statusLabel(profile.status, tr)),
            );
          }),
        ),
      snapshot.results.length > 0 && h("ul", { className: "dsh-ccswitch-import__results" },
        ...snapshot.results.map((result) => h("li", { key: `${result.profileId}-${result.status}` },
          `${result.profileId}: ${result.status === "failed" ? result.error : statusLabel(result.status, tr)}`
        )),
      ),
    ),
  );
}
