import "dotenv/config";
import { validateConfig, config } from "./config.js";
import { getFileInfo, getFillOutLink, requireFormsRoom, requireLabRoom } from "./docspaceClient.js";

function logOk(message) {
  console.log(`OK  ${message}`);
}

function logWarn(message) {
  console.warn(`WARN ${message}`);
}

function logFail(message) {
  console.error(`FAIL ${message}`);
}

async function checkFile(fileId, label) {
  const id = String(fileId || "").trim();
  if (!id) return;
  const info = await getFileInfo(id).catch(() => null);
  if (!info?.id) {
    logWarn(`${label}: file not found (${id})`);
    return;
  }
  logOk(`${label}: ${info.title || id} (${id})`);
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
  if (formsRoom?.id) {
    logOk(`Forms room: ${formsRoom.title} (${formsRoom.id})`);
  }

  const labRoom = await requireLabRoom().catch((e) => {
    logWarn(e?.message || "Lab room not found");
    return null;
  });
  if (labRoom?.id) {
    logOk(`Lab room: ${labRoom.title} (${labRoom.id})`);
  }

  await checkFile(config.autoFillSignTemplateId, "Auto Fill & Sign template");
  await checkFile(config.medicalRecordTemplateId, "Medical record template");
  await checkFile(config.ticketTemplateId, "Ticket template");

  const autoId = String(config.autoFillSignTemplateId || "").trim();
  if (autoId) {
    const link = await getFillOutLink(autoId).catch(() => null);
    const title = String(link?.title || "").toLowerCase();
    if (!link?.shareLink) {
      logWarn("Auto Fill & Sign template: no public fill-out link found (GET /links)");
    } else if (!title.includes("fill out")) {
      logWarn(`Auto Fill & Sign template: public link title is "${link.title || "unknown"}" (expected to include "fill out")`);
    } else {
      logOk("Auto Fill & Sign template: fill-out link present");
    }
  }

  if (!process.exitCode) {
    logOk("Smoke check finished");
  }
}

run();

