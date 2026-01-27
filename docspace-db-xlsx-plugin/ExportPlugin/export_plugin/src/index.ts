import {
  Actions,
  Components,
  IApiPlugin,
  IBox,
  IButton,
  IInput,
  IMainButtonItem,
  IMainButtonPlugin,
  IMessage,
  IModalDialog,
  IPlugin,
  ISettings,
  ISettingsPlugin,
  IText,
  ButtonSize,
  InputSize,
  ModalDisplayType,
  PluginStatus,
  ToastType
} from "@onlyoffice/docspace-plugin-sdk";

type AdminSettingsValue = {
  uiUrl?: string;
  backendUrl?: string;
  dataUrlTemplate?: string;
  tables?: string;
};

const DEFAULTS: Required<AdminSettingsValue> = {
  uiUrl: "http://localhost:5173",
  backendUrl: "",
  dataUrlTemplate: "",
  tables: ""
};

function normalizeBaseUrl(value?: string | null) {
  return String(value || "").trim().replace(/\/$/, "");
}

function safeParseSettings(value: string | null | undefined): Required<AdminSettingsValue> {
  if (!value) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(value) as AdminSettingsValue;
    return {
      uiUrl: normalizeBaseUrl(parsed.uiUrl) || DEFAULTS.uiUrl,
      backendUrl: normalizeBaseUrl(parsed.backendUrl) || DEFAULTS.backendUrl,
      dataUrlTemplate: String(parsed.dataUrlTemplate || "").trim(),
      tables: String(parsed.tables || "").trim()
    };
  } catch {
    return { ...DEFAULTS };
  }
}

class Exportplugin implements IPlugin, IApiPlugin, ISettingsPlugin, IMainButtonPlugin {
  status: PluginStatus = PluginStatus.active;

  origin = "";
  proxy = "";
  prefix = "";

  adminPluginSettings: ISettings | null = null;
  adminSettingsValue: Required<AdminSettingsValue> = { ...DEFAULTS };

  private uiUrlDraft = DEFAULTS.uiUrl;
  private backendUrlDraft = DEFAULTS.backendUrl;
  private dataUrlTemplateDraft = DEFAULTS.dataUrlTemplate;
  private tablesDraft = DEFAULTS.tables;

  mainButtonItems: Map<string, IMainButtonItem> = new Map();

  onLoadCallback = async () => {};

  updateStatus = (status: PluginStatus) => {
    this.status = status;
  };

  getStatus = () => this.status;

  setOnLoadCallback = (callback: () => Promise<void>) => {
    this.onLoadCallback = callback;
  };

  setOrigin = (origin: string): void => {
    this.origin = origin;
  };

  getOrigin = (): string => this.origin;

  setProxy = (proxy: string): void => {
    this.proxy = proxy;
  };

  getProxy = (): string => this.proxy;

  setPrefix = (prefix: string): void => {
    this.prefix = prefix;
  };

  getPrefix = (): string => this.prefix;

  setAPI = (origin: string, proxy: string, prefix: string): void => {
    this.origin = origin;
    this.proxy = proxy;
    this.prefix = prefix;
  };

  getAPI = (): { origin: string; proxy: string; prefix: string } => {
    return { origin: this.origin, proxy: this.proxy, prefix: this.prefix };
  };

  getAdminPluginSettings = () => this.adminPluginSettings;

  setAdminPluginSettings = (settings: ISettings | null): void => {
    this.adminPluginSettings = settings;
  };

  setAdminPluginSettingsValue = (settings: string | null): void => {
    this.adminSettingsValue = safeParseSettings(settings);
    this.uiUrlDraft = this.adminSettingsValue.uiUrl;
    this.backendUrlDraft = this.adminSettingsValue.backendUrl;
    this.dataUrlTemplateDraft = this.adminSettingsValue.dataUrlTemplate;
    this.tablesDraft = this.adminSettingsValue.tables;
    this.configureSettingsUi();
    this.configureMainButton();
  };

  addMainButtonItem = (item: IMainButtonItem): void => {
    this.mainButtonItems.set(item.key, item);
  };

  getMainButtonItems = (): Map<string, IMainButtonItem> => {
    return this.mainButtonItems;
  };

  updateMainButtonItem = (item: IMainButtonItem): void => {
    this.mainButtonItems.set(item.key, item);
  };

  private buildSettingsBox(): IBox {
    const headerText: IText = {
      text: "Configure URLs and HTTP data source.",
      fontSize: "13px"
    };

    const uiLabel: IText = { text: "UI URL", fontSize: "12px" };
    const backendLabel: IText = { text: "Backend URL (optional)", fontSize: "12px" };
    const dataUrlLabel: IText = {
      text: "Data URL template (use {table})",
      fontSize: "12px"
    };
    const tablesLabel: IText = {
      text: "Tables (comma separated)",
      fontSize: "12px"
    };

    const uiInput: IInput = {
      value: this.uiUrlDraft,
      placeholder: DEFAULTS.uiUrl,
      size: InputSize.middle,
      onChange: (value: string) => {
        this.uiUrlDraft = value;
      }
    };

    const backendInput: IInput = {
      value: this.backendUrlDraft,
      placeholder: "",
      size: InputSize.middle,
      onChange: (value: string) => {
        this.backendUrlDraft = value;
      }
    };

    const dataUrlInput: IInput = {
      value: this.dataUrlTemplateDraft,
      placeholder: "https://example.com/api/data?table={table}",
      size: InputSize.middle,
      onChange: (value: string) => {
        this.dataUrlTemplateDraft = value;
      }
    };

    const tablesInput: IInput = {
      value: this.tablesDraft,
      placeholder: "public.users, public.orders",
      size: InputSize.middle,
      onChange: (value: string) => {
        this.tablesDraft = value;
      }
    };

    return {
      displayProp: "flex",
      flexDirection: "column",
      paddingProp: "0",
      children: [
        { component: Components.text, props: headerText },
        { component: Components.text, props: uiLabel },
        { component: Components.input, props: uiInput, contextName: "uiUrlInput" },
        { component: Components.text, props: backendLabel },
        { component: Components.input, props: backendInput, contextName: "backendUrlInput" },
        { component: Components.text, props: dataUrlLabel },
        { component: Components.input, props: dataUrlInput, contextName: "dataUrlTemplateInput" },
        { component: Components.text, props: tablesLabel },
        { component: Components.input, props: tablesInput, contextName: "tablesInput" }
      ]
    };
  }

  private buildSettingsSaveButton(): { button: IButton; settingsJson: string } {
    const nextValue: Required<AdminSettingsValue> = {
      uiUrl: normalizeBaseUrl(this.uiUrlDraft) || DEFAULTS.uiUrl,
      backendUrl: normalizeBaseUrl(this.backendUrlDraft) || DEFAULTS.backendUrl,
      dataUrlTemplate: String(this.dataUrlTemplateDraft || "").trim(),
      tables: String(this.tablesDraft || "").trim()
    };
    const settingsJson = JSON.stringify(nextValue);

    const button: IButton = {
      label: "Save",
      size: ButtonSize.normal,
      primary: true,
      onClick: () => {
        this.adminSettingsValue = nextValue;
        this.uiUrlDraft = nextValue.uiUrl;
        this.backendUrlDraft = nextValue.backendUrl;
        this.dataUrlTemplateDraft = nextValue.dataUrlTemplate;
        this.tablesDraft = nextValue.tables;
        this.configureMainButton();

        const message: IMessage = {
          actions: [Actions.saveSettings, Actions.showToast, Actions.updateMainButtonItems],
          settings: settingsJson,
          toastProps: [
            {
              type: ToastType.success,
              title: "Plugin settings updated."
            }
          ]
        };
        return message;
      }
    };

    return { button, settingsJson };
  }

  private configureSettingsUi() {
    const settingsBox = this.buildSettingsBox();
    const { button } = this.buildSettingsSaveButton();

    this.adminPluginSettings = {
      settings: settingsBox,
      saveButton: {
        component: Components.button,
        props: button
      }
    };
  }

  private buildModalDialog(src: string): IModalDialog {
    const body: IBox = {
      displayProp: "flex",
      flexDirection: "column",
      children: [
        {
          component: Components.iFrame,
          props: {
            src,
            width: "100%",
            height: "720px",
            id: "exportplugin-iframe"
          }
        }
      ]
    };

    return {
      displayType: ModalDisplayType.modal,
      dialogHeader: "DB → XLSX Export",
      dialogBody: body,
      autoMaxWidth: true,
      autoMaxHeight: true,
      fullScreen: false,
      onClose: () => ({}),
      onLoad: async () => ({
        newDialogBody: body
      })
    };
  }

  private configureMainButton() {
    const { uiUrl, backendUrl, dataUrlTemplate, tables } = this.adminSettingsValue;
    const url = new URL(uiUrl);
    if (backendUrl) url.searchParams.set("backendUrl", backendUrl);
    if (dataUrlTemplate) url.searchParams.set("dataUrlTemplate", dataUrlTemplate);
    if (tables) url.searchParams.set("tables", tables);

    const item: IMainButtonItem = {
      key: "exportplugin-open",
      label: "DB → XLSX",
      icon: "icon.svg",
      onClick: async () => {
        const modalDialogProps = this.buildModalDialog(url.toString());
        const message: IMessage = {
          actions: [Actions.showModal],
          modalDialogProps
        };
        return message;
      }
    };

    this.mainButtonItems.set(item.key, item);
  }

  constructor() {
    this.configureSettingsUi();
    this.configureMainButton();
  }
}

const plugin = new Exportplugin();

declare global {
  interface Window {
    Plugins: Record<string, unknown>;
  }
}

window.Plugins = window.Plugins || {};
window.Plugins.Exportplugin = plugin;

export default plugin;
