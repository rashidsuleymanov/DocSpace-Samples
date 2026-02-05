import "dotenv/config";
import { validateConfig, config } from "./config.js";
import { getFolderContents, getFormsRoomFolders, requireFormsRoom } from "./docspaceClient.js";

function logOk(message) {
  console.log(`OK  ${message}`);
}

function logWarn(message) {
  console.warn(`WARN ${message}`);
}

function logFail(message) {
  console.error(`FAIL ${message}`);
}

async function run() {
  const errors = validateConfig({ requiresAuth: true });
  if (errors.length) {
    errors.forEach((e) => logFail(e));
    process.exitCode = 1;
    return;
  }

  logOk("Base config present");

  const formsRoom = await requireFormsRoom().catch((e) => {
    logFail(e?.message || "Forms room not found");
    process.exitCode = 1;
    return null;
  });
  if (!formsRoom?.id) return;
  logOk(`Forms room: ${formsRoom.title} (${formsRoom.id})`);

  const folders = await getFormsRoomFolders(formsRoom.id).catch((e) => {
    logWarn(e?.message || "Forms room folders not detected");
    return null;
  });
  if (folders?.inProcess?.id && folders?.complete?.id) {
    logOk(`Forms room folders present: "${folders.inProcess.title}", "${folders.complete.title}"`);
  } else {
    logWarn("Forms room folders not detected (expected: In Process, Complete)");
  }

  const templatesFolderId = folders?.templates?.id || formsRoom.id;
  const templatesFolder = await getFolderContents(templatesFolderId).catch(() => null);
  const templatesCount = Array.isArray(templatesFolder?.items)
    ? templatesFolder.items.filter((i) => i.type === "file").length
    : 0;
  logOk(
    `Templates folder: ${templatesFolder?.title || config.formsTemplatesFolderTitle} (${templatesCount} file(s))`
  );

  if (!process.exitCode) {
    logOk("Smoke check finished");
  }
}

run();

