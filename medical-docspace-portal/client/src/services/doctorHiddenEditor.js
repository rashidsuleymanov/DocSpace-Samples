import { destroyHiddenEditor, initHiddenEditor } from "./hiddenEditor.js";

export async function runDoctorHiddenEditor({
  file,
  payload,
  doctor,
  docspaceUrl,
  editorFrameId,
  editorRef
} = {}) {
  const token = doctor?.token || file?.requestToken || file?.shareToken || "";
  if (!file?.id || !token) return;
  if (!docspaceUrl) {
    throw new Error("VITE_DOCSPACE_URL is not set.");
  }

  return new Promise(async (resolve, reject) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      try {
        destroyHiddenEditor(editorRef);
      } finally {
        fn();
      }
    };

    destroyHiddenEditor(editorRef);

    try {
      const instance = await initHiddenEditor({
        docspaceUrl,
        fileId: String(file.id),
        frameId: editorFrameId,
        requestToken: token,
        mode: "edit",
        width: "1px",
        height: "1px",
        events: {
          onAppReady: () => {
            const frameInstance = window.DocSpace?.SDK?.frames?.[editorFrameId];
            if (!frameInstance) {
              finish(() => reject(new Error("Hidden editor frame not available")));
              return;
            }
            const callback = new Function(
              "editorInstance",
              `
              try {
                if (!editorInstance || typeof editorInstance.createConnector !== "function") {
                  console.error("Editor instance is invalid", editorInstance);
                  return;
                }
                const connector = editorInstance.createConnector();
                if (!connector || typeof connector.callCommand !== "function") {
                  console.error("Connector is invalid", connector);
                  return;
                }
                Asc.scope.payload = ${JSON.stringify(payload)};
                connector.callCommand(function () {
                  try {
                    var data = Asc.scope.payload || {};
                    var doc = Api.GetDocument();

                    function safeText(v) {
                      return (v && String(v).trim()) ? String(v) : "-";
                    }

                    function pushPara(p) {
                      if (doc.Push) {
                        doc.Push(p);
                        return;
                      }
                      if (doc.InsertContent) {
                        doc.InsertContent([p], true);
                      }
                    }

                    function addLine(text, spacingAfter) {
                      var p = Api.CreateParagraph();
                      if (p.SetSpacingAfter) p.SetSpacingAfter(spacingAfter || 80);
                      p.AddText(safeText(text));
                      pushPara(p);
                    }

                    function addBlank() {
                      addLine(" ", 40);
                    }

                    if (doc.RemoveAllElements) doc.RemoveAllElements();

                    if (data.type === "prescription") {
                      addLine("Prescription", 120);
                      addLine("Patient: " + safeText(data.patient));
                      addLine("Doctor: " + safeText(data.doctor));
                      addLine("Date: " + safeText(data.date));
                      addBlank();
                      addLine("Medication: " + safeText(data.medication));
                      addLine("Dosage: " + safeText(data.dosage));
                      addLine("Instructions: " + safeText(data.instructions));
                    } else if (data.type === "medical-record") {
                      addLine("Medical Record", 120);
                      addLine("Patient: " + safeText(data.patient));
                      addLine("Doctor: " + safeText(data.doctor));
                      addLine("Appointment: " + safeText(data.appointment));
                      addLine("Record type: " + safeText(data.recordType));
                      addBlank();
                      addLine("Summary: " + safeText(data.summary));
                    } else if (data.type === "sick-leave") {
                      addLine("Sick Leave Certificate", 120);
                      addLine("Patient: " + safeText(data.patient));
                      addLine("Doctor: " + safeText(data.doctor));
                      addLine("Issue date: " + safeText(data.date));
                      addLine("Start date: " + safeText(data.startDate));
                      addLine("End date: " + safeText(data.endDate));
                      addLine("Diagnosis: " + safeText(data.diagnosis));
                      if (data.note) {
                        addBlank();
                        addLine("Note: " + safeText(data.note));
                      }
                    } else if (data.type === "imaging-report") {
                      addLine("Imaging Report", 120);
                      addLine("Patient: " + safeText(data.patient));
                      addLine("Doctor: " + safeText(data.doctor));
                      addLine("Report date: " + safeText(data.date));
                      addLine("Modality: " + safeText(data.modality));
                      addLine("Study date: " + safeText(data.studyDate));
                      addBlank();
                      addLine("Findings: " + safeText(data.findings));
                      addBlank();
                      addLine("Impression: " + safeText(data.impression));
                      if (data.attachments && data.attachments.length) {
                        addBlank();
                        addLine("Attachments:", 80);
                        for (var i = 0; i < data.attachments.length; i++) {
                          addLine("- " + safeText(data.attachments[i]), 60);
                        }
                      }
                    } else {
                      addLine("Clinical document", 120);
                    }

                    Api.Save();
                  } catch (e) {
                    console.error("Doctor editor command failed", e);
                  }
                });
              } catch (e) {
                console.error("Doctor editor callback failed", e);
              }
            `
            );
            frameInstance.executeInEditor(callback);
            setTimeout(() => finish(resolve), 6500);
          },
          onAppError: () => {
            setTimeout(() => finish(() => reject(new Error("Editor app error"))), 500);
          }
        }
      });
      editorRef.current = instance;
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

