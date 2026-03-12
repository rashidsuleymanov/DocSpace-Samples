import { terminateUsers, deleteUser, deleteRoom } from "../docspaceClient.js";
import { purgeDemoData } from "../store.js";

export async function cleanupDemoSession(session) {
  const sid = String(session?.id || "").trim();
  if (!sid) return { ok: true, errors: [] };
  const errors = [];

  const patientRoomId = session?.patient?.roomId ? String(session.patient.roomId) : "";
  const patientUserId = session?.patient?.userId ? String(session.patient.userId) : "";
  const doctorUserId = session?.doctor?.userId ? String(session.doctor.userId) : "";

  try {
    purgeDemoData({ roomId: patientRoomId, patientUserId, doctorUserId, sessionId: sid });
  } catch (e) {
    errors.push(`purge:${e?.message || e}`);
    console.warn("[demo-cleanup] purge store failed", sid, e?.message || e);
  }

  if (patientRoomId) {
    await deleteRoom(patientRoomId).catch((e) => {
      errors.push(`deleteRoom:${patientRoomId}:${e?.message || e}`);
      console.warn("[demo-cleanup] deleteRoom failed", sid, patientRoomId, e?.message || e);
    });
  }

  const userIds = [patientUserId, doctorUserId].filter(Boolean);
  if (userIds.length) {
    await terminateUsers(userIds).catch((e) => {
      errors.push(`terminate:${e?.message || e}`);
      console.warn("[demo-cleanup] terminateUsers failed", sid, userIds.join(","), e?.message || e);
    });
    for (const uid of userIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteUser(uid).catch((e) => {
        errors.push(`deleteUser:${uid}:${e?.message || e}`);
        console.warn("[demo-cleanup] deleteUser failed", sid, uid, e?.message || e);
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
