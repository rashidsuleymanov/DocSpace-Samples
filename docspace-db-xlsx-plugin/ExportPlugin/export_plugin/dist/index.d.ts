import { IApiPlugin, IMainButtonItem, IMainButtonPlugin, IPlugin, ISettings, ISettingsPlugin, PluginStatus } from "@onlyoffice/docspace-plugin-sdk";
type AdminSettingsValue = {
    uiUrl?: string;
    backendUrl?: string;
    dataUrlTemplate?: string;
    tables?: string;
};
declare class Exportplugin implements IPlugin, IApiPlugin, ISettingsPlugin, IMainButtonPlugin {
    status: PluginStatus;
    origin: string;
    proxy: string;
    prefix: string;
    adminPluginSettings: ISettings | null;
    adminSettingsValue: Required<AdminSettingsValue>;
    private uiUrlDraft;
    private backendUrlDraft;
    private dataUrlTemplateDraft;
    private tablesDraft;
    mainButtonItems: Map<string, IMainButtonItem>;
    onLoadCallback: () => Promise<void>;
    updateStatus: (status: PluginStatus) => void;
    getStatus: () => PluginStatus;
    setOnLoadCallback: (callback: () => Promise<void>) => void;
    setOrigin: (origin: string) => void;
    getOrigin: () => string;
    setProxy: (proxy: string) => void;
    getProxy: () => string;
    setPrefix: (prefix: string) => void;
    getPrefix: () => string;
    setAPI: (origin: string, proxy: string, prefix: string) => void;
    getAPI: () => {
        origin: string;
        proxy: string;
        prefix: string;
    };
    getAdminPluginSettings: () => ISettings | null;
    setAdminPluginSettings: (settings: ISettings | null) => void;
    setAdminPluginSettingsValue: (settings: string | null) => void;
    addMainButtonItem: (item: IMainButtonItem) => void;
    getMainButtonItems: () => Map<string, IMainButtonItem>;
    updateMainButtonItem: (item: IMainButtonItem) => void;
    private buildSettingsBox;
    private buildSettingsSaveButton;
    private configureSettingsUi;
    private buildModalDialog;
    private configureMainButton;
    constructor();
}
declare const plugin: Exportplugin;
declare global {
    interface Window {
        Plugins: Record<string, unknown>;
    }
}
export default plugin;
